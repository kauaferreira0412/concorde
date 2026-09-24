package com.codagis.concorde.dto;

import com.codagis.concorde.enums.PresenceStatus;

import java.time.Instant;
import java.util.List;

public class FriendDtos {

    public record FriendInfo(Long userId, String username, String nickname, String avatarUrl,
                              PresenceStatus status, Long dmChannelId) {}

    public record FriendRequestInfo(Long userId, String username, String nickname, String avatarUrl, Instant createdAt) {}

    public record FriendRequestsResponse(List<FriendRequestInfo> incoming, List<FriendRequestInfo> outgoing) {}

    public record SendFriendRequestBody(String username) {}

    public record FriendStatusResponse(String status, Long dmChannelId) {}

    public record FriendEvent(String type) {}
}
