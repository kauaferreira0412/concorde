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
 * desconecta o WebSocket (isso inclui forceMuted/forceDeafened: sao "por sessao de call",
 * nao ficam gravados - sair e entrar de novo no canal reseta, igual mic/deafen normais).
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

    public void join(Long channelId, String sessionId, Long userId, String username, String avatarUrl) {
        byChannel.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>())
                .put(userId, new VoiceParticipantInfo(userId, username, avatarUrl, true, false, false, false));
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

    /** Um moderador (ver VoiceModerationController) mutando/desmutando outro membro a força -
     * ao ligar, tambem reflete micEnabled=false na hora (a presenca bate com a realidade). */
    public void setForceMuted(Long channelId, Long targetUserId, boolean forceMuted) {
        update(channelId, targetUserId, current -> new VoiceParticipantInfo(targetUserId, current.username(),
                current.avatarUrl(), forceMuted ? false : current.micEnabled(), current.deafened(), forceMuted,
                current.forceDeafened()));
    }

    public void setForceDeafened(Long channelId, Long targetUserId, boolean forceDeafened) {
        update(channelId, targetUserId, current -> new VoiceParticipantInfo(targetUserId, current.username(),
                current.avatarUrl(), current.micEnabled(), forceDeafened ? true : current.deafened(),
                current.forceMuted(), forceDeafened));
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
