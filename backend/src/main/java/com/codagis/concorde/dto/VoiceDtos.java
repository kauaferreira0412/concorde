package com.codagis.concorde.dto;

import java.util.List;

public class VoiceDtos {

    public record VoiceTokenResponse(String token, String wsUrl, String room, String identity,
                                      boolean forceMuted, boolean forceDeafened) {}

    public record VoiceParticipantInfo(Long userId, String username, String avatarUrl, boolean micEnabled,
                                        boolean deafened, boolean forceMuted, boolean forceDeafened,
                                        List<Long> watchingUserIds) {}

    public record VoiceControlEvent(String type, Long targetUserId, Long toChannelId, String toChannelName,
                                     Boolean muted, Boolean deafened) {}
}
