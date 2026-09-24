package com.codagis.concorde.dto;

import com.codagis.concorde.enums.ChannelType;
import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.PresenceStatus;
import com.codagis.concorde.enums.ServerType;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Set;

public class ServerDtos {

    public record CreateServerRequest(@NotBlank String name, ServerType type) {}

    public record ServerResponse(Long id, String name, Long ownerId, String iconUrl, String description, ServerType type) {}

    public record UpdateServerRequest(@NotBlank String name, String description) {}

    public record SetNicknameRequest(String nickname) {}

    public record CreateChannelRequest(@NotBlank String name, ChannelType type, Long categoryId) {}

    public record ChannelResponse(Long id, Long serverId, String name, ChannelType type, boolean adminOnly,
                                   Long categoryId, int position) {}

    public record ServerWithChannels(ServerResponse server, List<ChannelResponse> channels) {}

    public record MemberResponse(Long userId, String username, String nickname, String avatarUrl, PresenceStatus status,
                                  Role role, Set<Long> roleIds) {}

    public record CreateCategoryRequest(@NotBlank String name) {}

    public record UpdateCategoryRequest(@NotBlank String name) {}

    public record CategoryResponse(Long id, Long serverId, String name, int position, boolean restricted, Long createdBy) {}

    public record MoveChannelRequest(Long categoryId) {}

    public record SetCategoryAccessRequest(List<Long> userIds) {}

    public record InviteFriendRequest(Long userId) {}
}
