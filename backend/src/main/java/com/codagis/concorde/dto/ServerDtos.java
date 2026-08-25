package com.codagis.concorde.dto;

import com.codagis.concorde.domain.ChannelType;
import com.codagis.concorde.domain.Role;
import com.codagis.concorde.domain.PresenceStatus;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Set;

public class ServerDtos {

    public record CreateServerRequest(@NotBlank String name) {}

    public record ServerResponse(Long id, String name, Long ownerId, String iconUrl, String description) {}

    public record UpdateServerRequest(@NotBlank String name, String description) {}

    public record SetNicknameRequest(String nickname) {}

    public record CreateChannelRequest(@NotBlank String name, ChannelType type) {}

    public record ChannelResponse(Long id, Long serverId, String name, ChannelType type, boolean adminOnly) {}

    public record ServerWithChannels(ServerResponse server, List<ChannelResponse> channels) {}

    public record MemberResponse(Long userId, String username, String nickname, String avatarUrl, PresenceStatus status,
                                  Role role, Set<Long> roleIds) {}
}
