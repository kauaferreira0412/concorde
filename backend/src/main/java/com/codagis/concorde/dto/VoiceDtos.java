package com.codagis.concorde.dto;

import java.util.List;

public class VoiceDtos {

    public record VoiceTokenResponse(String token, String wsUrl, String room, String identity,
                                      boolean forceMuted, boolean forceDeafened) {}

    public record VoiceParticipantInfo(Long userId, String username, String avatarUrl, boolean micEnabled,
                                        boolean deafened, boolean forceMuted, boolean forceDeafened,
                                        List<Long> watchingUserIds, boolean screenSharing) {}

    /** Uma call com gente agora, num servidor seu (pro widget e pra lista "em call agora"). */
    public record ActiveCall(Long channelId, String channelName, Long serverId, String serverName, String serverIconUrl,
                             List<ActiveCallParticipant> participants) {}

    public record ActiveCallParticipant(Long userId, String username, String avatarUrl) {}

    public record VoiceControlEvent(String type, Long targetUserId, Long toChannelId, String toChannelName,
                                     Boolean muted, Boolean deafened) {}
}
