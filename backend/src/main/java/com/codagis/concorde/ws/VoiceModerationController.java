package com.codagis.concorde.ws;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Membership;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.dto.VoiceDtos.VoiceControlEvent;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.service.LiveKitService;
import com.codagis.concorde.service.PermissionService;
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

    private boolean isMusicBot(Long channelId, Long targetUserId) {
        return targetUserId != null && targetUserId.equals(-channelId);
    }

    private void callBotBestEffort(String path, Map<String, Object> body) {
        try {
            restTemplate.postForObject(musicBotUrl + path, body, Map.class);
        } catch (RestClientException e) {
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
            return;
        }
        Channel toChannel = channelRepository.findById(payload.toChannelId()).orElse(null);
        if (toChannel == null || !toChannel.getServerId().equals(fromChannel.getServerId())) {
            throw new IllegalArgumentException("Canal de destino invalido");
        }
        if (isMusicBot(channelId, payload.targetUserId())) {
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
            callBotBestEffort("/stop", Map.of("channelId", channelId));
            return;
        }
        broadcast(channelId, new VoiceControlEvent("KICK", payload.targetUserId(), null, null, null, null));
        liveKitService.disconnectParticipant("channel-" + channelId, "user-" + payload.targetUserId());
    }

    @Transactional
    @MessageMapping("/channel.{channelId}.voice.force-mute")
    public void forceMute(@DestinationVariable Long channelId, ForceMutePayload payload, Principal principal) {
        Channel channel = requireChannel(channelId);
        permissionService.assertHas(channel.getServerId(), userIdOf(principal), ServerPermission.MUTE_MEMBERS);
        if (isMusicBot(channelId, payload.targetUserId())) {
            if (presenceService.isPresent(channelId, payload.targetUserId())) {
                presenceService.setForceMuted(channelId, payload.targetUserId(), payload.muted());
            }
            callBotBestEffort("/mute", Map.of("channelId", channelId, "muted", payload.muted()));
            return;
        }
        persistForceState(channel.getServerId(), payload.targetUserId(), payload.muted(), null);
        if (!presenceService.isPresent(channelId, payload.targetUserId())) {
            return;
        }
        presenceService.setForceMuted(channelId, payload.targetUserId(), payload.muted());
        broadcast(channelId, new VoiceControlEvent("FORCE_MUTE", payload.targetUserId(), null, null, payload.muted(), null));
    }

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

    private void persistForceState(Long serverId, Long targetUserId, boolean forceMuted, Boolean forceDeafened) {
        Membership membership = membershipRepository.findByServerIdAndUserId(serverId, targetUserId).orElse(null);
        if (membership == null) {
            return;
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
