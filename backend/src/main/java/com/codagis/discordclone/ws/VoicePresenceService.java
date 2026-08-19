package com.codagis.discordclone.ws;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Registro em memoria de "quem esta em qual canal de voz agora", para TODOS os membros
 * do servidor verem isso na barra lateral (nao so quem ja entrou na call, como no LiveKit).
 * Nao precisa de banco - e' presenca efemera, some quando o processo reinicia ou o usuario
 * desconecta o WebSocket. forceMuted/forceDeafened aqui sao so' o REFLEXO em memoria, pra
 * broadcast rapido - a punicao em si e' GRAVADA em Membership (ver VoiceModerationController/
 * VoicePresenceController.join) e sobrevive a sair/entrar de novo na call, so' essa copia
 * aqui e' que se perde e e' recarregada do banco a cada join().
 */
@Service
public class VoicePresenceService {

    private final SimpMessagingTemplate messagingTemplate;

    // channelId -> (userId -> info)
    private final Map<Long, Map<Long, VoiceParticipantInfo>> byChannel = new ConcurrentHashMap<>();
    // sessionId do STOMP -> canal/usuario, para limpar automaticamente se o socket cair sem "leave" explicito
    private final Map<String, Long> sessionChannel = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionUser = new ConcurrentHashMap<>();

    public VoicePresenceService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /**
     * forceMuted/forceDeafened aqui vem de uma punicao GRAVADA (ver Membership no
     * VoicePresenceController.join) - se a pessoa ja' estava mutada/ensurdecida a força antes
     * de sair, entra na call ja' assim, em vez de sempre "limpo". Ensurdecer implica mutado
     * (mesma regra usada em VoicePresenceService.setForceDeafened).
     */
    public void join(Long channelId, String sessionId, Long userId, String username, String avatarUrl,
                      boolean forceMuted, boolean forceDeafened) {
        boolean effectiveForceMuted = forceMuted || forceDeafened;
        byChannel.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>())
                .put(userId, new VoiceParticipantInfo(userId, username, avatarUrl, !effectiveForceMuted, forceDeafened,
                        effectiveForceMuted, forceDeafened));
        sessionChannel.put(sessionId, channelId);
        sessionUser.put(sessionId, userId);
        broadcast(channelId);
    }

    public void leaveBySession(String sessionId) {
        Long channelId = sessionChannel.remove(sessionId);
        Long userId = sessionUser.remove(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        if (participants != null) {
            participants.remove(userId);
            if (participants.isEmpty()) {
                byChannel.remove(channelId);
            }
        }
        broadcast(channelId);
    }

    public void setMicEnabled(String sessionId, boolean micEnabled) {
        Long channelId = sessionChannel.get(sessionId);
        Long userId = sessionUser.get(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        update(channelId, userId, current -> new VoiceParticipantInfo(userId, current.username(), current.avatarUrl(),
                micEnabled, current.deafened(), current.forceMuted(), current.forceDeafened()));
    }

    /** Ensurdecer e' diferente de so mutar: a pessoa nem esta ouvindo ninguem, nao so calada. */
    public void setDeafened(String sessionId, boolean deafened) {
        Long channelId = sessionChannel.get(sessionId);
        Long userId = sessionUser.get(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        update(channelId, userId, current -> new VoiceParticipantInfo(userId, current.username(), current.avatarUrl(),
                current.micEnabled(), deafened, current.forceMuted(), current.forceDeafened()));
    }

    /**
     * Um moderador (ver VoiceModerationController) mutando/desmutando outro membro a força -
     * micEnabled reflete o resultado final NA HORA (!forceMuted), sem depender do cliente-alvo
     * mandar de volta um /voice.mic separado confirmando isso. Esse segundo aviso ainda chega
     * (ver applyForceMute no frontend, que tambem precisa desligar o microfone de verdade no
     * LiveKit) mas so' repete o mesmo valor - aqui a presenca ja fica correta assim que o
     * MODERADOR agiu, sem essa segunda viagem de rede no meio pra todo mundo enxergar certo.
     */
    public void setForceMuted(Long channelId, Long targetUserId, boolean forceMuted) {
        update(channelId, targetUserId, current -> new VoiceParticipantInfo(targetUserId, current.username(),
                current.avatarUrl(), !forceMuted, current.deafened(), forceMuted, current.forceDeafened()));
    }

    /**
     * Ensurdecer a força TAMBEM muta o microfone - enquanto estiver ligado, a pessoa nao fala
     * nem ouve (pedido explicito do usuario: "se eu ensurdecer ele direto, ele tambem nao vai
     * conseguir se desmutar" - igual o Discord de verdade). Liberar libera os dois juntos.
     * deafened/micEnabled/forceMuted refletem o resultado final NA HORA (mesmo motivo do
     * setForceMuted acima - nao espera nenhuma mensagem de volta do cliente-alvo pra ficar
     * certo em todo lugar que mostra isso).
     */
    public void setForceDeafened(Long channelId, Long targetUserId, boolean forceDeafened) {
        update(channelId, targetUserId, current -> new VoiceParticipantInfo(targetUserId, current.username(),
                current.avatarUrl(), !forceDeafened, forceDeafened, forceDeafened, forceDeafened));
    }

    public boolean isForceMuted(Long channelId, Long userId) {
        VoiceParticipantInfo info = get(channelId, userId);
        return info != null && info.forceMuted();
    }

    public boolean isForceDeafened(Long channelId, Long userId) {
        VoiceParticipantInfo info = get(channelId, userId);
        return info != null && info.forceDeafened();
    }

    public boolean isPresent(Long channelId, Long userId) {
        return get(channelId, userId) != null;
    }

    private VoiceParticipantInfo get(Long channelId, Long userId) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        return participants == null ? null : participants.get(userId);
    }

    private void update(Long channelId, Long userId, java.util.function.Function<VoiceParticipantInfo, VoiceParticipantInfo> updater) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        if (participants == null) {
            return;
        }
        VoiceParticipantInfo current = participants.get(userId);
        if (current == null) {
            return;
        }
        participants.put(userId, updater.apply(current));
        broadcast(channelId);
    }

    public List<VoiceParticipantInfo> snapshot(Long channelId) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        return participants == null ? List.of() : new ArrayList<>(participants.values());
    }

    private void broadcast(Long channelId) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".voice", snapshot(channelId));
    }
}
