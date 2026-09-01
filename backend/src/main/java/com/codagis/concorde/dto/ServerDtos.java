package com.codagis.concorde.dto;

import com.codagis.concorde.enums.ChannelType;
import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.PresenceStatus;
import com.codagis.concorde.enums.ServerType;
import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Set;

public class ServerDtos {

    // type nulo = NORMAL (ver ServerService.createServer) - opcional pra nao quebrar nenhum
    // client antigo que ainda nao manda esse campo.
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

    // restricted = tem alguma restricao de acesso configurada nessa categoria (ver
    // CategoryAccessEntry/ServerService.setCategoryAccess) - so' um booleano aqui, a lista de
    // quem tem acesso de verdade vem do GET /categories/{id}/access (so' quem pode gerenciar
    // canais busca isso, nao faz sentido expor pra todo mundo).
    public record CategoryResponse(Long id, Long serverId, String name, int position, boolean restricted) {}

    public record MoveChannelRequest(Long categoryId) {}

    // Lista vazia = sem restricao (categoria aberta pra todo mundo do servidor) - e' assim que
    // se remove uma restricao ja configurada, nao tem um endpoint separado de "desfazer".
    public record SetCategoryAccessRequest(List<Long> userIds) {}
}
