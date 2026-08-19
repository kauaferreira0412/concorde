package com.codagis.discordclone.ws;

import com.codagis.discordclone.domain.Channel;
import com.codagis.discordclone.domain.ServerPermission;
import com.codagis.discordclone.repository.ChannelRepository;
import com.codagis.discordclone.service.PermissionService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Acoes de moderacao de voz - mover/expulsar/mutar/ensurdecer OUTRO membro a força, cada
 * uma exigindo a permissao correspondente (ver ServerPermission/PermissionService). O
 * backend so' autoriza e avisa; quem realmente executa a acao (sair da call, entrar em
 * outro canal, desligar o microfone na hora) e' o proprio cliente-alvo, reagindo ao evento
 * em /topic/channel.{channelId}.voice.control (ver VoiceCallContext.jsx) - reaproveita 100%
 * a logica de entrar/sair de call que ja existe e ja e' testada, em vez de duplicar isso
 * aqui no backend mexendo direto no LiveKit.
 */
@Controller
public class VoiceModerationController {

    private final ChannelRepository channelRepository;
    private final PermissionService permissionService;
    private final VoicePresenceService presenceService;
    private final SimpMessagingTemplate messagingTemplate;

    public VoiceModerationController(ChannelRepository channelRepository, PermissionService permissionService,
                                      VoicePresenceService presenceService, SimpMessagingTemplate messagingTemplate) {
        this.channelRepository = channelRepository;
        this.permissionService = permissionService;
        this.presenceService = presenceService;
        this.messagingTemplate = messagingTemplate;
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
        broadcast(channelId, new VoiceControlEvent("KICK", payload.targetUserId(), null, null, null, null));
    }

    @MessageMapping("/channel.{channelId}.voice.force-mute")
    public void forceMute(@DestinationVariable Long channelId, ForceMutePayload payload, Principal principal) {
        Channel channel = requireChannel(channelId);
        permissionService.assertHas(channel.getServerId(), userIdOf(principal), ServerPermission.MUTE_MEMBERS);
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return;
        }
        presenceService.setForceMuted(channelId, payload.targetUserId(), payload.muted());
        broadcast(channelId, new VoiceControlEvent("FORCE_MUTE", payload.targetUserId(), null, null, payload.muted(), null));
    }

    /** Ensurdecer a força tambem muta o microfone junto (ver VoicePresenceService.setForceDeafened -
     *  DEAFEN_MEMBERS e' a unica permissao exigida aqui, mesmo mutando tambem). */
    @MessageMapping("/channel.{channelId}.voice.force-deafen")
    public void forceDeafen(@DestinationVariable Long channelId, ForceDeafenPayload payload, Principal principal) {
        Channel channel = requireChannel(channelId);
        permissionService.assertHas(channel.getServerId(), userIdOf(principal), ServerPermission.DEAFEN_MEMBERS);
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return;
        }
        presenceService.setForceDeafened(channelId, payload.targetUserId(), payload.deafened());
        broadcast(channelId, new VoiceControlEvent("FORCE_DEAFEN", payload.targetUserId(), null, null, null, payload.deafened()));
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
