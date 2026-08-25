package com.codagis.concorde.service;

import com.codagis.concorde.domain.Membership;
import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.domain.ServerRole;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.ServerRepository;
import com.codagis.concorde.repository.ServerRoleRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.EnumSet;
import java.util.Set;

@Service
public class PermissionService {

    private final MembershipRepository membershipRepository;
    private final ServerRoleRepository serverRoleRepository;
    private final ServerRepository serverRepository;
    private final UserRepository userRepository;

    public PermissionService(MembershipRepository membershipRepository, ServerRoleRepository serverRoleRepository,
                              ServerRepository serverRepository, UserRepository userRepository) {
        this.membershipRepository = membershipRepository;
        this.serverRoleRepository = serverRoleRepository;
        this.serverRepository = serverRepository;
        this.userRepository = userRepository;
    }

    public Set<ServerPermission> effectivePermissions(Long serverId, Long userId) {
        if (isOwnerOrGlobalAdmin(serverId, userId)) {
            return EnumSet.allOf(ServerPermission.class);
        }
        Membership membership = membershipRepository.findByServerIdAndUserId(serverId, userId).orElse(null);
        Set<ServerPermission> result = EnumSet.noneOf(ServerPermission.class);
        if (membership == null || membership.getRoleIds().isEmpty()) {
            return result;
        }
        for (Long roleId : membership.getRoleIds()) {
            ServerRole role = serverRoleRepository.findById(roleId).orElse(null);
            if (role != null && role.getServerId().equals(serverId)) {
                result.addAll(role.getPermissions());
            }
        }
        return result;
    }

    public boolean has(Long serverId, Long userId, ServerPermission permission) {
        return effectivePermissions(serverId, userId).contains(permission);
    }

    public void assertHas(Long serverId, Long userId, ServerPermission permission) {
        if (!has(serverId, userId, permission)) {
            throw new IllegalStateException("Você não tem permissão pra fazer isso nesse servidor");
        }
    }

    public boolean isOwnerOrGlobalAdmin(Long serverId, Long userId) {
        boolean isGlobalAdmin = userRepository.findById(userId).map(u -> u.getRole() == Role.ADMIN).orElse(false);
        if (isGlobalAdmin) {
            return true;
        }
        return serverRepository.findById(serverId).map(s -> s.getOwnerId().equals(userId)).orElse(false);
    }
}
