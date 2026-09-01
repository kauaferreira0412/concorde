package com.codagis.concorde.service;

import com.codagis.concorde.domain.*;
import com.codagis.concorde.enums.ChannelType;
import com.codagis.concorde.enums.PresenceStatus;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.enums.ServerType;
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
    private final ChannelCategoryRepository channelCategoryRepository;
    private final MembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final ServerRoleRepository serverRoleRepository;
    private final MessageRepository messageRepository;
    private final AdminGuard adminGuard;
    private final OnlinePresenceService presenceService;
    private final PermissionService permissionService;
    private final VoicePresenceService voicePresenceService;
    private final AuditLogService auditLogService;
    private final CustomEmojiRepository customEmojiRepository;
    private final CategoryAccessRepository categoryAccessRepository;

    public ServerService(ServerRepository serverRepository, ChannelRepository channelRepository,
                          ChannelCategoryRepository channelCategoryRepository,
                          MembershipRepository membershipRepository, UserRepository userRepository,
                          ServerRoleRepository serverRoleRepository, MessageRepository messageRepository,
                          AdminGuard adminGuard, OnlinePresenceService presenceService,
                          PermissionService permissionService, VoicePresenceService voicePresenceService,
                          AuditLogService auditLogService, CustomEmojiRepository customEmojiRepository,
                          CategoryAccessRepository categoryAccessRepository) {
        this.serverRepository = serverRepository;
        this.channelRepository = channelRepository;
        this.channelCategoryRepository = channelCategoryRepository;
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.serverRoleRepository = serverRoleRepository;
        this.messageRepository = messageRepository;
        this.adminGuard = adminGuard;
        this.presenceService = presenceService;
        this.permissionService = permissionService;
        this.voicePresenceService = voicePresenceService;
        this.customEmojiRepository = customEmojiRepository;
        this.auditLogService = auditLogService;
        this.categoryAccessRepository = categoryAccessRepository;
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
        ServerType type = req.type() != null ? req.type() : ServerType.NORMAL;
        Server server = serverRepository.save(Server.builder()
                .name(req.name())
                .ownerId(ownerId)
                .type(type)
                .build());

        membershipRepository.save(Membership.builder().serverId(server.getId()).userId(ownerId).build());

        channelRepository.save(Channel.builder().serverId(server.getId()).name("geral").type(ChannelType.TEXT).build());
        // RPG: o canal de voz padrao vira "Sessão" (a primeira sessao de jogo) em vez de
        // "Geral" - o mestre cria mais sessoes depois do mesmo jeito que cria qualquer outro
        // canal de voz (ver ChannelSidebar.jsx "+ canal de voz"), so' muda o nome padrao pra
        // deixar claro o proposito (pedido explicito do usuario).
        String voiceChannelName = type == ServerType.RPG ? "Sessão" : "Geral";
        channelRepository.save(Channel.builder().serverId(server.getId()).name(voiceChannelName).type(ChannelType.VOICE).build());
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
        channelCategoryRepository.deleteByServerId(serverId);
        serverRoleRepository.deleteByServerId(serverId);
        membershipRepository.deleteByServerId(serverId);
        auditLogService.deleteAllForServer(serverId);
        customEmojiRepository.deleteByServerId(serverId);
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
        List<Channel> channels = channelRepository.findByServerIdOrderByIdAsc(serverId);
        // So' precisa ir no banco pelas categorias RESTRITAS (a maioria dos servidores nunca
        // configurou nenhuma) - ver canAccessCategory/setCategoryAccess. Categoria sem nenhuma
        // linha em CategoryAccessEntry continua aberta pra todo mundo, comportamento de sempre.
        List<Long> categoryIds = channels.stream().map(Channel::getCategoryId).filter(java.util.Objects::nonNull).distinct().toList();
        Set<Long> restrictedCategoryIds = categoryIds.isEmpty() ? Set.of() : categoryAccessRepository.findRestrictedCategoryIds(categoryIds);
        return channels.stream()
                .filter(c -> c.getCategoryId() == null || !restrictedCategoryIds.contains(c.getCategoryId())
                        || categoryAccessRepository.existsByCategoryIdAndUserId(c.getCategoryId(), userId))
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public ChannelResponse createChannel(Long serverId, Long userId, CreateChannelRequest req) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        Long categoryId = req.categoryId() != null ? requireCategoryOfServer(serverId, req.categoryId()).getId() : null;
        int position = (int) channelRepository.findByServerIdOrderByIdAsc(serverId).stream()
                .filter(c -> java.util.Objects.equals(c.getCategoryId(), categoryId))
                .count();
        Channel channel = channelRepository.save(Channel.builder()
                .serverId(serverId)
                .name(req.name())
                .type(req.type() == null ? ChannelType.TEXT : req.type())
                .categoryId(categoryId)
                .position(position)
                .build());
        auditLogService.log(serverId, userId, "CREATE_CHANNEL", null, "CHANNEL", channel.getId(), channel.getName());
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
        auditLogService.log(serverId, userId, "DELETE_CHANNEL", null, "CHANNEL", channelId, channel.getName());
    }

    @Transactional
    public ChannelResponse moveChannelToCategory(Long serverId, Long userId, Long channelId, Long categoryId) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        if (!channel.getServerId().equals(serverId)) {
            throw new IllegalArgumentException("Canal não pertence a esse servidor");
        }
        Long validCategoryId = categoryId != null ? requireCategoryOfServer(serverId, categoryId).getId() : null;
        channel.setCategoryId(validCategoryId);
        channel.setPosition((int) channelRepository.findByServerIdOrderByIdAsc(serverId).stream()
                .filter(c -> java.util.Objects.equals(c.getCategoryId(), validCategoryId) && !c.getId().equals(channelId))
                .count());
        return toResponse(channelRepository.save(channel));
    }

    public List<CategoryResponse> listCategories(Long serverId, Long userId) {
        assertMember(serverId, userId);
        List<ChannelCategory> categories = channelCategoryRepository.findByServerIdOrderByPositionAsc(serverId);
        List<Long> categoryIds = categories.stream().map(ChannelCategory::getId).toList();
        Set<Long> restrictedCategoryIds = categoryIds.isEmpty() ? Set.of() : categoryAccessRepository.findRestrictedCategoryIds(categoryIds);
        return categories.stream()
                // Categoria restrita que esse usuario nao tem acesso simplesmente NAO aparece -
                // nem o nome dela vaza (mesma logica de listChannels acima).
                .filter(c -> !restrictedCategoryIds.contains(c.getId())
                        || categoryAccessRepository.existsByCategoryIdAndUserId(c.getId(), userId))
                .map(c -> toResponse(c, restrictedCategoryIds.contains(c.getId())))
                .toList();
    }

    /** Quem tem acesso HOJE a essa categoria (lista de userId) - so' pra quem pode gerenciar
     *  canais montar a UI de "restringir acesso" (ver CategoryAccessModal.jsx). Lista vazia
     *  quer dizer "sem restricao nenhuma configurada" (aberta pra todo mundo). */
    public List<Long> getCategoryAccess(Long serverId, Long userId, Long categoryId) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        requireCategoryOfServer(serverId, categoryId);
        return categoryAccessRepository.findByCategoryId(categoryId).stream()
                .map(CategoryAccessEntry::getUserId)
                .toList();
    }

    /** Substitui a lista de quem pode ver essa categoria - lista vazia REMOVE a restricao (fica
     *  aberta de novo pra todo mundo do servidor), sem precisar de um endpoint separado pra
     *  "desfazer". Ignora silenciosamente qualquer userId que nao seja membro do servidor (ex:
     *  alguem que saiu entre a busca da lista e o salvar). */
    @Transactional
    public void setCategoryAccess(Long serverId, Long userId, Long categoryId, List<Long> allowedUserIds) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        requireCategoryOfServer(serverId, categoryId);
        categoryAccessRepository.deleteByCategoryId(categoryId);
        List<Long> validUserIds = (allowedUserIds == null ? List.<Long>of() : allowedUserIds).stream()
                .distinct()
                .filter(uid -> membershipRepository.existsByServerIdAndUserId(serverId, uid))
                .toList();
        validUserIds.forEach(uid -> categoryAccessRepository.save(
                CategoryAccessEntry.builder().categoryId(categoryId).userId(uid).build()));
        ChannelCategory category = requireCategoryOfServer(serverId, categoryId);
        auditLogService.log(serverId, userId, "SET_CATEGORY_ACCESS", null, "CATEGORY", categoryId, category.getName());
    }

    @Transactional
    public CategoryResponse createCategory(Long serverId, Long userId, CreateCategoryRequest req) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        int position = channelCategoryRepository.findByServerIdOrderByPositionAsc(serverId).size();
        ChannelCategory category = channelCategoryRepository.save(ChannelCategory.builder()
                .serverId(serverId)
                .name(req.name())
                .position(position)
                .build());
        auditLogService.log(serverId, userId, "CREATE_CATEGORY", null, "CATEGORY", category.getId(), category.getName());
        return toResponse(category);
    }

    @Transactional
    public CategoryResponse updateCategory(Long serverId, Long userId, Long categoryId, UpdateCategoryRequest req) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        ChannelCategory category = requireCategoryOfServer(serverId, categoryId);
        category.setName(req.name());
        return toResponse(channelCategoryRepository.save(category));
    }

    @Transactional
    public void deleteCategory(Long serverId, Long userId, Long categoryId) {
        assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        ChannelCategory category = requireCategoryOfServer(serverId, categoryId);
        channelRepository.findByServerIdOrderByIdAsc(serverId).stream()
                .filter(c -> categoryId.equals(c.getCategoryId()))
                .forEach(c -> {
                    c.setCategoryId(null);
                    channelRepository.save(c);
                });
        categoryAccessRepository.deleteByCategoryId(categoryId);
        channelCategoryRepository.delete(category);
        auditLogService.log(serverId, userId, "DELETE_CATEGORY", null, "CATEGORY", categoryId, category.getName());
    }

    private ChannelCategory requireCategoryOfServer(Long serverId, Long categoryId) {
        ChannelCategory category = channelCategoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Categoria não encontrada"));
        if (!category.getServerId().equals(serverId)) {
            throw new IllegalArgumentException("Essa categoria não é desse servidor");
        }
        return category;
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
        auditLogService.log(serverId, requesterId, "REMOVE_MEMBER", targetUserId, "MEMBER", targetUserId, null);
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
        ServerRole saved = serverRoleRepository.save(role);
        auditLogService.log(serverId, requesterId, "CREATE_ROLE", null, "ROLE", saved.getId(), saved.getName());
        return toResponse(saved);
    }

    @Transactional
    public RoleResponse updateRole(Long requesterId, Long serverId, Long roleId, UpdateRoleRequest req) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.MANAGE_ROLES);
        ServerRole role = requireRoleOfServer(serverId, roleId);
        role.setName(req.name());
        role.setColor(blankToNull(req.color()));
        role.setPermissions(req.permissions() == null ? new HashSet<>() : new HashSet<>(req.permissions()));
        ServerRole saved = serverRoleRepository.save(role);
        auditLogService.log(serverId, requesterId, "UPDATE_ROLE", null, "ROLE", saved.getId(), saved.getName());
        return toResponse(saved);
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
        auditLogService.log(serverId, requesterId, "DELETE_ROLE", null, "ROLE", roleId, role.getName());
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
        auditLogService.log(serverId, requesterId, "SET_MEMBER_ROLES", targetUserId, "MEMBER", targetUserId,
                filtered.size() + " perfil(is)");
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
        return new ServerResponse(server.getId(), server.getName(), server.getOwnerId(), server.getIconUrl(),
                server.getDescription(), server.getType());
    }

    private ChannelResponse toResponse(Channel channel) {
        return new ChannelResponse(channel.getId(), channel.getServerId(), channel.getName(), channel.getType(),
                channel.isAdminOnly(), channel.getCategoryId(), channel.getPosition());
    }

    private CategoryResponse toResponse(ChannelCategory category) {
        return toResponse(category, categoryAccessRepository.findByCategoryId(category.getId()).size() > 0);
    }

    private CategoryResponse toResponse(ChannelCategory category, boolean restricted) {
        return new CategoryResponse(category.getId(), category.getServerId(), category.getName(), category.getPosition(), restricted);
    }
}
