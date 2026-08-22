package com.codagis.discordclone.ws;

import com.codagis.discordclone.domain.Channel;
import com.codagis.discordclone.domain.Membership;
import com.codagis.discordclone.domain.ServerPermission;
import com.codagis.discordclone.repository.ChannelRepository;
import com.codagis.discordclone.repository.MembershipRepository;
import com.codagis.discordclone.service.LiveKitService;
import com.codagis.discordclone.service.PermissionService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.security.Principal;
import java.util.Map;

/**
 * Acoes de moderacao de voz - mover/expulsar/mutar/ensurdecer OUTRO membro a força, cada
 * uma exigindo a permissao correspondente (ver ServerPermission/PermissionService). O
 * backend so' autoriza e avisa; quem realmente executa a acao (sair da call, entrar em
 * outro canal, desligar o microfone na hora) e' o proprio cliente-alvo, reagindo ao evento
 * em /topic/channel.{channelId}.voice.control (ver VoiceCallContext.jsx) - reaproveita 100%
 * a logica de entrar/sair de call que ja existe e ja e' testada, em vez de duplicar isso
 * aqui no backend mexendo direto no LiveKit.
 *
 * EXCECAO: o bot de musica (ver MusicController/music-bot/index.js) nao e' um cliente WebSocket
 * de verdade, entao nunca vai reagir a um evento de controle sozinho - pra kick/force-mute
 * funcionarem NELE, esse controller precisa chamar o bot diretamente (mesmo REST interno que o
 * MusicController usa), em vez de so' confiar em "o alvo vai se virar". Ver isMusicBot/callBot*.
 */
@Controller
public class VoiceModerationController {

    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final PermissionService permissionService;
    private final VoicePresenceService presenceService;
    private final SimpMessagingTemplate messagingTemplate;
    private final LiveKitService liveKitService;
    private final String musicBotUrl;
    private final RestTemplate restTemplate = new RestTemplate();

    public VoiceModerationController(ChannelRepository channelRepository, MembershipRepository membershipRepository,
                                      PermissionService permissionService, VoicePresenceService presenceService,
                                      SimpMessagingTemplate messagingTemplate, LiveKitService liveKitService,
                                      @Value("${app.music-bot.url}") String musicBotUrl) {
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.permissionService = permissionService;
        this.presenceService = presenceService;
        this.messagingTemplate = messagingTemplate;
        this.liveKitService = liveKitService;
        this.musicBotUrl = musicBotUrl;
    }

    /** O bot usa sempre esse userId sintetico nesse canal (ver VoicePresenceService.joinBot). */
    private boolean isMusicBot(Long channelId, Long targetUserId) {
        return targetUserId != null && targetUserId.equals(-channelId);
    }

    /** Melhor esforco - se o bot ja caiu sozinho (ex: idle timeout) ou o servico estiver fora
     *  do ar nesse instante, so' ignora (a acao de moderacao em si ja aconteceu do lado que
     *  importa: a presenca/gravacao no banco). */
    private void callBotBestEffort(String path, Map<String, Object> body) {
        try {
            restTemplate.postForObject(musicBotUrl + path, body, Map.class);
        } catch (RestClientException e) {
            // silencioso de proposito, ver comentario acima
        }
    }

    public record MovePayload(Long targetUserId, Long toChannelId) {}
    public record KickPayload(Long targetUserId) {}
    public record ForceMutePayload(Long targetUserId, boolean muted) {}
    public record ForceDeafenPayload(Long targetUserId, boolean deafened) {}

    @MessageMapping("/channel.{channelId}.voice.move")
    public void move(@DestinationVariable Long channelId, MovePayload payload, Principal principal) {
        Channel fromChannel = requireChannel(channelId);
        Long requesterId = userIdOf(principal);
        permissionService.assertHas(fromChannel.getServerId(), requesterId, ServerPermission.MOVE_MEMBERS);
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return; // ja nao esta mais nessa call, nada a fazer
        }
        Channel toChannel = channelRepository.findById(payload.toChannelId()).orElse(null);
        if (toChannel == null || !toChannel.getServerId().equals(fromChannel.getServerId())) {
            throw new IllegalArgumentException("Canal de destino invalido");
        }
        if (isMusicBot(channelId, payload.targetUserId())) {
            // O bot nao tem cliente WebSocket ouvindo o evento abaixo - manda ele mesmo trocar
            // de sala no LiveKit (ver POST /move em music-bot/index.js, a musica continua
            // tocando, so' muda pra onde o audio e' publicado). Presenca segue o proprio bot
            // avisando de volta (ver MusicBotInternalController), igual entrar/sair normal.
            callBotBestEffort("/move", Map.of("fromChannelId", channelId, "toChannelId", toChannel.getId()));
            return;
        }
        broadcast(channelId, new VoiceControlEvent("MOVE", payload.targetUserId(), toChannel.getId(),
                toChannel.getName(), null, null));
    }

    @MessageMapping("/channel.{channelId}.voice.kick")
    public void kick(@DestinationVariable Long channelId, KickPayload payload, Principal principal) {
        Channel channel = requireChannel(channelId);
        permissionService.assertHas(channel.getServerId(), userIdOf(principal), ServerPermission.KICK_VOICE);
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return;
        }
        if (isMusicBot(channelId, payload.targetUserId())) {
            // O bot nao tem cliente WebSocket ouvindo o evento abaixo - manda ele sair de
            // verdade (mesmo endpoint que o /stop usa, ver MusicController). A presenca dele
            // some sozinha quando o bot avisar de volta (ver MusicBotInternalController).
            callBotBestEffort("/stop", Map.of("channelId", channelId));
            return;
        }
        broadcast(channelId, new VoiceControlEvent("KICK", payload.targetUserId(), null, null, null, null));
        // O broadcast acima so' funciona se o cliente-alvo estiver vivo pra reagir sozinho -
        // se o app dele ja tiver travado/perdido conexao (mesmo bug da "conexao fantasma", ver
        // VoicePresenceService.leaveBySession), o kick pareceria funcionar (some da lista) mas
        // o audio continuaria saindo. Forca a desconexao de verdade no LiveKit tambem, garante
        // o kick mesmo contra um cliente que nao vai reagir a nada.
        liveKitService.disconnectParticipant("channel-" + channelId, "user-" + payload.targetUserId());
    }

    /** Punicao GRAVADA (Membership) - continua valendo mesmo se a pessoa sair e entrar de
     *  novo na call, ate' alguem com permissao tirar (pedido explicito do usuario). */
    @Transactional
    @MessageMapping("/channel.{channelId}.voice.force-mute")
    public void forceMute(@DestinationVariable Long channelId, ForceMutePayload payload, Principal principal) {
        Channel channel = requireChannel(channelId);
        permissionService.assertHas(channel.getServerId(), userIdOf(principal), ServerPermission.MUTE_MEMBERS);
        if (isMusicBot(channelId, payload.targetUserId())) {
            // O bot nao tem Membership (nao e' um usuario de verdade) pra persistir a punicao
            // nem cliente WebSocket ouvindo o evento de controle - manda ele mesmo silenciar os
            // proximos frames (ver POST /mute em music-bot/index.js) e so' atualiza a presenca
            // (pro icone de mutado aparecer certo na UI de todo mundo).
            if (presenceService.isPresent(channelId, payload.targetUserId())) {
                presenceService.setForceMuted(channelId, payload.targetUserId(), payload.muted());
            }
            callBotBestEffort("/mute", Map.of("channelId", channelId, "muted", payload.muted()));
            return;
        }
        persistForceState(channel.getServerId(), payload.targetUserId(), payload.muted(), null);
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return; // gravado mesmo assim - so' nao tem ninguem pra avisar agora
        }
        presenceService.setForceMuted(channelId, payload.targetUserId(), payload.muted());
        broadcast(channelId, new VoiceControlEvent("FORCE_MUTE", payload.targetUserId(), null, null, payload.muted(), null));
    }

    /** Ensurdecer a força tambem muta o microfone junto (ver VoicePresenceService.setForceDeafened -
     *  DEAFEN_MEMBERS e' a unica permissao exigida aqui, mesmo mutando tambem). Tambem gravado
     *  (Membership), mesmo motivo do forceMute acima. */
    @Transactional
    @MessageMapping("/channel.{channelId}.voice.force-deafen")
    public void forceDeafen(@DestinationVariable Long channelId, ForceDeafenPayload payload, Principal principal) {
        Channel channel = requireChannel(channelId);
        permissionService.assertHas(channel.getServerId(), userIdOf(principal), ServerPermission.DEAFEN_MEMBERS);
        persistForceState(channel.getServerId(), payload.targetUserId(), payload.deafened(), payload.deafened());
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return;
        }
        presenceService.setForceDeafened(channelId, payload.targetUserId(), payload.deafened());
        broadcast(channelId, new VoiceControlEvent("FORCE_DEAFEN", payload.targetUserId(), null, null, null, payload.deafened()));
    }

    /** forceDeafened == null quando e' so' um mute independente (nao mexe no ensurdecido
     *  gravado); != null quando vem do force-deafen (seta os dois - ensurdecer implica mudo). */
    private void persistForceState(Long serverId, Long targetUserId, boolean forceMuted, Boolean forceDeafened) {
        Membership membership = membershipRepository.findByServerIdAndUserId(serverId, targetUserId).orElse(null);
        if (membership == null) {
            return; // nao e' mais membro desse servidor - nada pra gravar
        }
        membership.setForceMuted(forceMuted);
        if (forceDeafened != null) {
            membership.setForceDeafened(forceDeafened);
        }
        membershipRepository.save(membership);
    }

    private Channel requireChannel(Long channelId) {
        return channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
    }

    private Long userIdOf(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private void broadcast(Long channelId, VoiceControlEvent event) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".voice.control", event);
    }
}
