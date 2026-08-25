package com.codagis.concorde.service;

import com.codagis.concorde.domain.*;
import com.codagis.concorde.dto.ServerDtos.*;
import com.codagis.concorde.dto.ServerRoleDtos.*;
import com.codagis.concorde.repository.*;
import com.codagis.concorde.security.AdminGuard;
import com.codagis.concorde.ws.OnlinePresenceService;
import com.codagis.concorde.dto.VoiceDtos.VoiceParticipantInfo;
import com.codagis.concorde.ws.VoicePresenceService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class ServerService {

    private final ServerRepository serverRepository;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final ServerRoleRepository serverRoleRepository;
    private final MessageRepository messageRepository;
    private final AdminGuard adminGuard;
    private final OnlinePresenceService presenceService;
    private final PermissionService permissionService;
    private final VoicePresenceService voicePresenceService;

    public ServerService(ServerRepository serverRepository, ChannelRepository channelRepository,
                          MembershipRepository membershipRepository, UserRepository userRepository,
                          ServerRoleRepository serverRoleRepository, MessageRepository messageRepository,
                          AdminGuard adminGuard, OnlinePresenceService presenceService,
                          PermissionService permissionService, VoicePresenceService voicePresenceService) {
        this.serverRepository = serverRepository;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.serverRoleRepository = serverRoleRepository;
        this.messageRepository = messageRepository;
        this.adminGuard = adminGuard;
        this.presenceService = presenceService;
        this.permissionService = permissionService;
        this.voicePresenceService = voicePresenceService;
    }

    public List<VoiceParticipantInfo> getVoicePresence(Long serverId, Long userId) {
        assertMember(serverId, userId);
        return channelRepository.findByServerIdOrderByIdAsc(serverId).stream()
                .filter(c -> c.getType() == ChannelType.VOICE)
                .flatMap(c -> voicePresenceService.snapshot(c.getId()).stream())
                .toList();
    }

    @Transactional
    public ServerResponse createServer(Long ownerId, CreateServerRequest req) {
        adminGuard.assertAdmin(ownerId);
        Server server = serverRepository.save(Server.builder()
                .name(req.name())
                .ownerId(ownerId)
                .build());

        membershipRepository.save(Membership.builder().serverId(server.getId()).userId(ownerId).build());

        channelRepository.save(Channel.builder().serverId(server.getId()).name("geral").type(ChannelType.TEXT).build());
        channelRepository.save(Channel.builder().serverId(server.getId()).name("Geral").type(ChannelType.VOICE).build());
        channelRepository.save(Channel.builder().serverId(server.getId()).name("Atualizações").type(ChannelType.TEXT).adminOnly(true).build());

        return toResponse(server);
    }

    public List<ServerResponse> listServersOfUser(Long userId) {
        return membershipRepository.findByUserId(userId).stream()
                .map(m -> serverRepository.findById(m.getServerId()).orElse(null))
                .filter(s -> s != null)
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public void grantAccessAsAdmin(Long requesterId, Long serverId, Long targetUserId) {
        adminGuard.assertAdmin(requesterId);
        if (!serverRepository.existsById(serverId)) {
            throw new IllegalArgumentException("Servidor nao existe");
        }
        if (!membershipRepository.existsByServerIdAndUserId(serverId, targetUserId)) {
            try {
                membershipRepository.save(Membership.builder().serverId(serverId).userId(targetUserId).build());
            } catch (DataIntegrityViolationException e) {
            }
        }
    }

    public void assertMember(Long serverId, Long userId) {
        if (!membershipRepository.existsByServerIdAndUserId(serverId, userId)) {
            throw new IllegalStateException("Usuario nao pertence a esse servidor");
        }
    }

    public List<MemberResponse> listMembers(Long serverId, Long userId) {
        assertMember(serverId, userId);
        List<Membership> memberships = membershipRepository.findByServerId(serverId);
        List<Long> userIds = memberships.stream().map(Membership::getUserId).toList();
        var nicknameByUserId = new java.util.HashMap<Long, String>();
        var roleIdsByUserId = new java.util.HashMap<Long, Set<Long>>();
        memberships.forEach(m -> {
            nicknameByUserId.put(m.getUserId(), m.getNickname());
            roleIdsByUserId.put(m.getUserId(), m.getRoleIds());
        });
        var statusById = presenceService.effectiveStatusOf(userIds);
        return userRepository.findAllById(userIds).stream()
                .map(u -> new MemberResponse(u.getId(), u.getUsername(), nicknameByUserId.get(u.getId()),
                        u.getAvatarUrl(), statusById.get(u.getId()), u.getRole(), roleIdsByUserId.get(u.getId())))
                .sorted((a, b) -> {
                    boolean aOffline = a.status() == PresenceStatus.OFFLINE;
                    boolean bOffline = b.status() == PresenceStatus.OFFLINE;
                    if (aOffline != bOffline) return aOffline ? 1 : -1;
                    return a.username().compareToIgnoreCase(b.username());
                })
                .toList();
    }

    @Transactional
    public ServerResponse updateServer(Long requesterId, Long serverId, UpdateServerRequest req) {
        assertMember(serverId, requesterId);
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_SERVER);
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalArgumentException("Servidor nao encontrado"));
        server.setName(req.name());
        server.setDescription(blankToNull(req.description()));
        return toResponse(serverRepository.save(server));
    }

    @Transactional
    public void deleteServer(Long requesterId, Long serverId) {
        adminGuard.assertAdmin(requesterId);
        if (!serverRepository.existsById(serverId)) {
            throw new IllegalArgumentException("Servidor nao encontrado");
        }
        channelRepository.findByServerIdOrderByIdAsc(serverId)
                .forEach(channel -> messageRepository.deleteByChannelId(channel.getId()));
        channelRepository.deleteByServerId(serverId);
        serverRoleRepository.deleteByServerId(serverId);
        membershipRepository.deleteByServerId(serverId);
        serverRepository.deleteById(serverId);
    }

    @Transactional
    public ServerResponse updateServerIcon(Long requesterId, Long serverId, String iconUrl) {
        assertMember(serverId, requesterId);
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_SERVER);
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalArgumentException("Servidor nao encontrado"));
        server.setIconUrl(iconUrl);
        return toResponse(serverRepository.save(server));
    }

    public String getMyNickname(Long serverId, Long userId) {
        return membershipRepository.findByServerIdAndUserId(serverId, userId)
                .map(Membership::getNickname)
                .orElse(null);
    }

    @Transactional
    public void setMyNickname(Long serverId, Long userId, String nickname) {
        Membership membership = membershipRepository.findByServerIdAndUserId(serverId, userId)
                .orElseThrow(() -> new IllegalStateException("Usuario nao pertence a esse servidor"));
        membership.setNickname(blankToNull(nickname));
        membershipRepository.save(membership);
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    public List<ChannelResponse> listChannels(Long serverId, Long userId) {
        assertMember(serverId, userId);
        return channelRepository.findByServerIdOrderByIdAsc(serverId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ChannelResponse createChannel(Long serverId, Long userId, CreateChannelRequest req) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        Channel channel = channelRepository.save(Channel.builder()
                .serverId(serverId)
                .name(req.name())
                .type(req.type() == null ? ChannelType.TEXT : req.type())
                .build());
        return toResponse(channel);
    }

    @Transactional
    public void deleteChannel(Long serverId, Long userId, Long channelId) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        if (!channel.getServerId().equals(serverId)) {
            throw new IllegalArgumentException("Canal não pertence a esse servidor");
        }
        messageRepository.deleteByChannelId(channelId);
        channelRepository.delete(channel);
    }

    @Transactional
    public void removeMember(Long requesterId, Long serverId, Long targetUserId) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_MEMBERS);
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalArgumentException("Servidor nao encontrado"));
        if (server.getOwnerId().equals(targetUserId)) {
            throw new IllegalStateException("Não dá pra remover o dono do servidor");
        }
        membershipRepository.findByServerIdAndUserId(serverId, targetUserId)
                .ifPresent(membershipRepository::delete);
    }

    @Transactional
    public void setMemberNickname(Long requesterId, Long serverId, Long targetUserId, String nickname) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_MEMBERS);
        Membership membership = membershipRepository.findByServerIdAndUserId(serverId, targetUserId)
                .orElseThrow(() -> new IllegalStateException("Usuario nao pertence a esse servidor"));
        membership.setNickname(blankToNull(nickname));
        membershipRepository.save(membership);
    }

    public Set<ServerPermission> getMyPermissions(Long serverId, Long userId) {
        assertMember(serverId, userId);
        return permissionService.effectivePermissions(serverId, userId);
    }

    public List<RoleResponse> listRoles(Long serverId, Long userId) {
        assertMember(serverId, userId);
        return serverRoleRepository.findByServerId(serverId).stream().map(this::toResponse).toList();
    }

    @Transactional
    public RoleResponse createRole(Long requesterId, Long serverId, CreateRoleRequest req) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_ROLES);
        ServerRole role = ServerRole.builder()
                .serverId(serverId)
                .name(req.name())
                .color(blankToNull(req.color()))
                .permissions(req.permissions() == null ? new HashSet<>() : new HashSet<>(req.permissions()))
                .build();
        return toResponse(serverRoleRepository.save(role));
    }

    @Transactional
    public RoleResponse updateRole(Long requesterId, Long serverId, Long roleId, UpdateRoleRequest req) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_ROLES);
        ServerRole role = requireRoleOfServer(serverId, roleId);
        role.setName(req.name());
        role.setColor(blankToNull(req.color()));
        role.setPermissions(req.permissions() == null ? new HashSet<>() : new HashSet<>(req.permissions()));
        return toResponse(serverRoleRepository.save(role));
    }

    @Transactional
    public void deleteRole(Long requesterId, Long serverId, Long roleId) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_ROLES);
        ServerRole role = requireRoleOfServer(serverId, roleId);
        membershipRepository.findByServerId(serverId).forEach(m -> {
            if (m.getRoleIds().remove(roleId)) {
                membershipRepository.save(m);
            }
        });
        serverRoleRepository.delete(role);
    }

    @Transactional
    public void setMemberRoles(Long requesterId, Long serverId, Long targetUserId, Set<Long> roleIds) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_ROLES);
        Membership membership = membershipRepository.findByServerIdAndUserId(serverId, targetUserId)
                .orElseThrow(() -> new IllegalStateException("Usuario nao pertence a esse servidor"));
        Set<Long> validIds = roleIds == null ? Set.of() : roleIds;
        Set<Long> existingIdsOfServer = serverRoleRepository.findByServerId(serverId).stream()
                .map(ServerRole::getId)
                .collect(java.util.stream.Collectors.toSet());
        Set<Long> filtered = new HashSet<>(validIds);
        filtered.retainAll(existingIdsOfServer);
        membership.setRoleIds(filtered);
        membershipRepository.save(membership);
    }

    private ServerRole requireRoleOfServer(Long serverId, Long roleId) {
        ServerRole role = serverRoleRepository.findById(roleId)
                .orElseThrow(() -> new IllegalArgumentException("Perfil não encontrado"));
        if (!role.getServerId().equals(serverId)) {
            throw new IllegalArgumentException("Esse perfil não é desse servidor");
        }
        return role;
    }

    private RoleResponse toResponse(ServerRole role) {
        return new RoleResponse(role.getId(), role.getServerId(), role.getName(), role.getColor(), role.getPermissions());
    }

    private ServerResponse toResponse(Server server) {
        return new ServerResponse(server.getId(), server.getName(), server.getOwnerId(), server.getIconUrl(), server.getDescription());
    }

    private ChannelResponse toResponse(Channel channel) {
        return new ChannelResponse(channel.getId(), channel.getServerId(), channel.getName(), channel.getType(), channel.isAdminOnly());
    }
}
