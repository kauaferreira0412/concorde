package com.codagis.concorde.controller;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Membership;
import com.codagis.concorde.dto.VoiceDtos.VoiceTokenResponse;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.DisplayNameService;
import com.codagis.concorde.service.LiveKitService;
import com.codagis.concorde.dto.VoiceDtos.VoiceParticipantInfo;
import com.codagis.concorde.ws.VoicePresenceService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/channels")
public class VoiceController {

    private final LiveKitService liveKitService;
    private final CurrentUser currentUser;
    private final UserRepository userRepository;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final VoicePresenceService voicePresenceService;
    private final DisplayNameService displayNameService;

    public VoiceController(LiveKitService liveKitService, CurrentUser currentUser, UserRepository userRepository,
                            ChannelRepository channelRepository, MembershipRepository membershipRepository,
                            VoicePresenceService voicePresenceService, DisplayNameService displayNameService) {
        this.liveKitService = liveKitService;
        this.currentUser = currentUser;
        this.userRepository = userRepository;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.voicePresenceService = voicePresenceService;
        this.displayNameService = displayNameService;
    }

    @GetMapping("/{channelId}/voice-presence")
    public List<VoiceParticipantInfo> getVoicePresence(@PathVariable Long channelId) {
        return voicePresenceService.snapshot(channelId);
    }

    @PostMapping("/{channelId}/voice-token/viewer")
    public VoiceTokenResponse getCameraViewerToken(@PathVariable Long channelId) {
        Long userId = currentUser.id();
        String displayName = displayNameService.resolveForChannel(channelId, userId);
        String room = "channel-" + channelId;
        String identity = "user-" + userId + "-camview";
        String token = liveKitService.generateCameraViewerToken(room, identity, displayName);
        return new VoiceTokenResponse(token, liveKitService.getWsUrl(), room, identity, false, false);
    }

    @PostMapping("/{channelId}/voice-token")
    public VoiceTokenResponse getVoiceToken(@PathVariable Long channelId) {
        Long userId = currentUser.id();
        var user = userRepository.findById(userId);
        String displayName = displayNameService.resolveForChannel(channelId, userId);
        String avatarUrl = user.map(u -> u.getAvatarUrl()).orElse(null);

        String room = "channel-" + channelId;
        String identity = "user-" + userId;
        String token = liveKitService.generateAccessToken(room, identity, displayName, avatarUrl);

        Channel channel = channelRepository.findById(channelId).orElse(null);
        boolean forceMuted = false;
        boolean forceDeafened = false;
        if (channel != null) {
            Membership membership = membershipRepository.findByServerIdAndUserId(channel.getServerId(), userId).orElse(null);
            if (membership != null) {
                forceMuted = membership.isForceMuted();
                forceDeafened = membership.isForceDeafened();
            }
        }

        return new VoiceTokenResponse(token, liveKitService.getWsUrl(), room, identity, forceMuted, forceDeafened);
    }
}
