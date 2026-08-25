package com.codagis.concorde.dto;

import com.codagis.concorde.domain.ServerPermission;
import jakarta.validation.constraints.NotBlank;

import java.util.Set;

public class ServerRoleDtos {

    public record CreateRoleRequest(@NotBlank String name, String color, Set<ServerPermission> permissions) {}

    public record UpdateRoleRequest(@NotBlank String name, String color, Set<ServerPermission> permissions) {}

    public record RoleResponse(Long id, Long serverId, String name, String color, Set<ServerPermission> permissions) {}

    public record SetMemberRolesRequest(Set<Long> roleIds) {}
}
