package com.codagis.discordclone.dto;

import com.codagis.discordclone.domain.ChannelType;
import com.codagis.discordclone.domain.Role;
import com.codagis.discordclone.ws.PresenceStatus;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Set;

public class ServerDtos {

    public record CreateServerRequest(@NotBlank String name) {}

    public record ServerResponse(Long id, String name, Long ownerId, String iconUrl, String description) {}

    /** Edicao de nome/descricao do servidor - so' o dono/ADMIN pode (ver ServerService.updateServer). */
    public record UpdateServerRequest(@NotBlank String name, String description) {}

    /** Apelido do usuario logado DENTRO desse servidor especifico (ver Membership.nickname). */
    public record SetNicknameRequest(String nickname) {}

    public record CreateChannelRequest(@NotBlank String name, ChannelType type) {}

    public record ChannelResponse(Long id, Long serverId, String name, ChannelType type) {}

    public record ServerWithChannels(ServerResponse server, List<ChannelResponse> channels) {}

    public record MemberResponse(Long userId, String username, String nickname, String avatarUrl, PresenceStatus status,
                                  Role role, Set<Long> roleIds) {}
}
