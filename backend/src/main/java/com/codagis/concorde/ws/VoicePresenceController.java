package com.codagis.concorde.ws;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Membership;
import com.codagis.concorde.domain.ServerPermission;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.service.DisplayNameService;
import com.codagis.concorde.service.PermissionService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class VoicePresenceController {

    private final VoicePresenceService presenceService;
    private final UserRepository userRepository;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final DisplayNameService displayNameService;
    private final PermissionService permissionService;

    public VoicePresenceController(VoicePresenceService presenceService, UserRepository userRepository,
                                    ChannelRepository channelRepository, MembershipRepository membershipRepository,
                                    DisplayNameService displayNameService, PermissionService permissionService) {
        this.presenceService = presenceService;
        this.userRepository = userRepository;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.displayNameService = displayNameService;
        this.permissionService = permissionService;
    }

    public record MicStatePayload(boolean micEnabled) {}
    public record DeafenStatePayload(boolean deafened) {}
    public record WatchingPayload(java.util.List<Long> watchingUserIds) {}

    @MessageMapping("/channel.{channelId}.voice.join")
    public void join(@DestinationVariable Long channelId, @Header("simpSessionId") String sessionId, Principal principal) {
        Long userId = (Long) ((Authentication) principal).getPrincipal();
        var user = userRepository.findById(userId);
        String displayName = displayNameService.resolveForChannel(channelId, userId);
        String avatarUrl = user.map(u -> u.getAvatarUrl()).orElse(null);
        boolean forceMuted = false;
        boolean forceDeafened = false;
        Channel channel = channelRepository.findById(channelId).orElse(null);
        if (channel != null) {
            Membership membership = membershipRepository.findByServerIdAndUserId(channel.getServerId(), userId).orElse(null);
            if (membership != null) {
                forceMuted = membership.isForceMuted();
                forceDeafened = membership.isForceDeafened();
            }
        }
        presenceService.join(channelId, sessionId, userId, displayName, avatarUrl, forceMuted, forceDeafened);
    }

    @MessageMapping("/channel.{channelId}.voice.leave")
    public void leave(@DestinationVariable Long channelId, @Header("simpSessionId") String sessionId) {
        presenceService.leaveBySession(sessionId);
    }

    @MessageMapping("/channel.{channelId}.voice.mic")
    public void mic(@DestinationVariable Long channelId, MicStatePayload payload, @Header("simpSessionId") String sessionId,
                     Principal principal) {
        if (payload.micEnabled() && presenceService.isForceMuted(channelId, userIdOf(principal))
                && !hasPermission(channelId, userIdOf(principal), ServerPermission.MUTE_MEMBERS)) {
            return;
        }
        presenceService.setMicEnabled(sessionId, payload.micEnabled());
    }

    @MessageMapping("/channel.{channelId}.voice.deafen")
    public void deafen(@DestinationVariable Long channelId, DeafenStatePayload payload, @Header("simpSessionId") String sessionId,
                        Principal principal) {
        if (!payload.deafened() && presenceService.isForceDeafened(channelId, userIdOf(principal))
                && !hasPermission(channelId, userIdOf(principal), ServerPermission.DEAFEN_MEMBERS)) {
            return;
        }
        presenceService.setDeafened(sessionId, payload.deafened());
    }

    @MessageMapping("/channel.{channelId}.voice.watching")
    public void watching(@DestinationVariable Long channelId, WatchingPayload payload, @Header("simpSessionId") String sessionId) {
        presenceService.setWatching(sessionId, payload.watchingUserIds());
    }

    private Long userIdOf(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private boolean hasPermission(Long channelId, Long userId, ServerPermission permission) {
        Channel channel = channelRepository.findById(channelId).orElse(null);
        return channel != null && permissionService.has(channel.getServerId(), userId, permission);
    }
}
