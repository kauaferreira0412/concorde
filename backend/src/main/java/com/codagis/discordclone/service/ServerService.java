package com.codagis.discordclone.service;

import com.codagis.discordclone.domain.*;
import com.codagis.discordclone.dto.ServerDtos.*;
import com.codagis.discordclone.repository.*;
import com.codagis.discordclone.security.AdminGuard;
import com.codagis.discordclone.ws.OnlinePresenceService;
import com.codagis.discordclone.ws.PresenceStatus;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ServerService {

    private final ServerRepository serverRepository;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final UserRepository userRepository;
    private final AdminGuard adminGuard;
    private final OnlinePresenceService presenceService;

    public ServerService(ServerRepository serverRepository, ChannelRepository channelRepository,
                          MembershipRepository membershipRepository, UserRepository userRepository,
                          AdminGuard adminGuard, OnlinePresenceService presenceService) {
        this.serverRepository = serverRepository;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.userRepository = userRepository;
        this.adminGuard = adminGuard;
        this.presenceService = presenceService;
    }

    /** So o ADMIN pode criar servidores. */
    @Transactional
    public ServerResponse createServer(Long ownerId, CreateServerRequest req) {
        adminGuard.assertAdmin(ownerId);
        Server server = serverRepository.save(Server.builder()
                .name(req.name())
                .ownerId(ownerId)
                .build());

        membershipRepository.save(Membership.builder().serverId(server.getId()).userId(ownerId).build());

        // Canais padrao, igual ao Discord quando voce cria um servidor novo
        channelRepository.save(Channel.builder().serverId(server.getId()).name("geral").type(ChannelType.TEXT).build());
        channelRepository.save(Channel.builder().serverId(server.getId()).name("Geral").type(ChannelType.VOICE).build());

        return toResponse(server);
    }

    public List<ServerResponse> listServersOfUser(Long userId) {
        return membershipRepository.findByUserId(userId).stream()
                .map(m -> serverRepository.findById(m.getServerId()).orElse(null))
                .filter(s -> s != null)
                .map(this::toResponse)
                .toList();
    }

    /** ADMIN libera o acesso de um usuario a um servidor, sem precisar de link de convite. */
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
                // ja virou membro por outra requisicao concorrente - resultado desejado alcancado, ignora
            }
        }
    }

    public void assertMember(Long serverId, Long userId) {
        if (!membershipRepository.existsByServerIdAndUserId(serverId, userId)) {
            throw new IllegalStateException("Usuario nao pertence a esse servidor");
        }
    }

    /** Todo mundo com acesso ao servidor (inclusive a esse canal de voz - hoje nao existe
     * permissao por canal, todo membro ve todos os canais), com o status de cada um agora. */
    public List<MemberResponse> listMembers(Long serverId, Long userId) {
        assertMember(serverId, userId);
        List<Membership> memberships = membershipRepository.findByServerId(serverId);
        List<Long> userIds = memberships.stream().map(Membership::getUserId).toList();
        // Nao da pra usar Collectors.toMap aqui - ele chama Objects.requireNonNull() no valor
        // por baixo dos panos e explode com NullPointerException assim que algum apelido
        // (o caso comum) estiver em branco. Um HashMap comum aceita valor null numa boa.
        var nicknameByUserId = new java.util.HashMap<Long, String>();
        memberships.forEach(m -> nicknameByUserId.put(m.getUserId(), m.getNickname()));
        var statusById = presenceService.effectiveStatusOf(userIds);
        return userRepository.findAllById(userIds).stream()
                .map(u -> new MemberResponse(u.getId(), u.getUsername(), nicknameByUserId.get(u.getId()),
                        u.getAvatarUrl(), statusById.get(u.getId()), u.getRole()))
                .sorted((a, b) -> {
                    boolean aOffline = a.status() == PresenceStatus.OFFLINE;
                    boolean bOffline = b.status() == PresenceStatus.OFFLINE;
                    if (aOffline != bOffline) return aOffline ? 1 : -1; // offline por ultimo
                    return a.username().compareToIgnoreCase(b.username());
                })
                .toList();
    }

    /** So o dono do servidor (ou o ADMIN) pode editar nome/descricao - mesmo criterio de
     * quem pode criar servidor pra comecar (ver AdminGuard). */
    @Transactional
    public ServerResponse updateServer(Long requesterId, Long serverId, UpdateServerRequest req) {
        adminGuard.assertAdmin(requesterId);
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalArgumentException("Servidor nao encontrado"));
        server.setName(req.name());
        server.setDescription(blankToNull(req.description()));
        return toResponse(serverRepository.save(server));
    }

    @Transactional
    public ServerResponse updateServerIcon(Long requesterId, Long serverId, String iconUrl) {
        adminGuard.assertAdmin(requesterId);
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

    /** Qualquer MEMBRO do servidor pode escolher o proprio apelido ali dentro (nao precisa
     * ser dono/admin - e' uma preferencia pessoal, igual o apelido global do usuario). */
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
        Channel channel = channelRepository.save(Channel.builder()
                .serverId(serverId)
                .name(req.name())
                .type(req.type() == null ? ChannelType.TEXT : req.type())
                .build());
        return toResponse(channel);
    }

    private ServerResponse toResponse(Server server) {
        return new ServerResponse(server.getId(), server.getName(), server.getOwnerId(), server.getIconUrl(), server.getDescription());
    }

    private ChannelResponse toResponse(Channel channel) {
        return new ChannelResponse(channel.getId(), channel.getServerId(), channel.getName(), channel.getType());
    }
}
