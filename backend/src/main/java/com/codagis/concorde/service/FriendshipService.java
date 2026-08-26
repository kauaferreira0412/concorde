package com.codagis.concorde.service;

import com.codagis.concorde.domain.DirectChannel;
import com.codagis.concorde.domain.Friendship;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.FriendDtos.FriendEvent;
import com.codagis.concorde.dto.FriendDtos.FriendInfo;
import com.codagis.concorde.dto.FriendDtos.FriendRequestInfo;
import com.codagis.concorde.dto.FriendDtos.FriendRequestsResponse;
import com.codagis.concorde.enums.FriendshipStatus;
import com.codagis.concorde.repository.DirectChannelRepository;
import com.codagis.concorde.repository.FriendshipRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.ws.OnlinePresenceService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Pedido de amizade + lista de amigos - so' amigos ACEITOS conseguem abrir um chat privado (ver
 * DirectChannel/DirectMessageService). Toda amizade/pedido e' guardado com userAId < userBId
 * (normalizado aqui, nunca confiar na ordem que chegou do requester/alvo) pra nunca existir duas
 * linhas pro mesmo par de gente.
 */
@Service
public class FriendshipService {

    private final FriendshipRepository friendshipRepository;
    private final DirectChannelRepository directChannelRepository;
    private final UserRepository userRepository;
    private final OnlinePresenceService presenceService;
    private final SimpMessagingTemplate messagingTemplate;

    public FriendshipService(FriendshipRepository friendshipRepository, DirectChannelRepository directChannelRepository,
                              UserRepository userRepository, OnlinePresenceService presenceService,
                              SimpMessagingTemplate messagingTemplate) {
        this.friendshipRepository = friendshipRepository;
        this.directChannelRepository = directChannelRepository;
        this.userRepository = userRepository;
        this.presenceService = presenceService;
        this.messagingTemplate = messagingTemplate;
    }

    @Transactional
    public void sendRequest(Long requesterId, String targetUsername) {
        if (targetUsername == null || targetUsername.isBlank()) {
            throw new IllegalArgumentException("Digite o nome de usuário de quem você quer adicionar");
        }
        User target = userRepository.findByUsername(targetUsername.trim())
                .orElseThrow(() -> new IllegalArgumentException("Não existe usuário com esse nome"));
        if (target.getId().equals(requesterId)) {
            throw new IllegalArgumentException("Você não pode adicionar a si mesmo");
        }
        long a = Math.min(requesterId, target.getId());
        long b = Math.max(requesterId, target.getId());
        Friendship existing = friendshipRepository.findByUserAIdAndUserBId(a, b).orElse(null);
        if (existing != null) {
            if (existing.getStatus() == FriendshipStatus.ACCEPTED) {
                throw new IllegalArgumentException("Vocês já são amigos");
            }
            if (existing.getRequestedBy().equals(requesterId)) {
                throw new IllegalArgumentException("Você já enviou um pedido - espere a resposta");
            }
            // O outro ja tinha te mandado um pedido - mandar de volta e' o mesmo que aceitar.
            acceptInternal(existing);
            return;
        }
        friendshipRepository.save(Friendship.builder()
                .userAId(a).userBId(b).status(FriendshipStatus.PENDING).requestedBy(requesterId).build());
        notify(target.getId());
        notify(requesterId);
    }

    @Transactional
    public void accept(Long requesterId, Long otherUserId) {
        Friendship f = requirePending(requesterId, otherUserId);
        if (f.getRequestedBy().equals(requesterId)) {
            throw new IllegalStateException("Você não pode aceitar seu próprio pedido");
        }
        acceptInternal(f);
    }

    private void acceptInternal(Friendship f) {
        f.setStatus(FriendshipStatus.ACCEPTED);
        f.setRespondedAt(Instant.now());
        friendshipRepository.save(f);
        getOrCreateChannel(f.getUserAId(), f.getUserBId());
        notify(f.getUserAId());
        notify(f.getUserBId());
    }

    /** Serve tanto pra recusar um pedido recebido quanto pra cancelar um que voce mandou -
     *  simetrico, so' apaga a linha pendente de qualquer um dos dois lados. */
    @Transactional
    public void decline(Long requesterId, Long otherUserId) {
        Friendship f = requirePending(requesterId, otherUserId);
        friendshipRepository.delete(f);
        notify(f.getUserAId());
        notify(f.getUserBId());
    }

    @Transactional
    public void remove(Long requesterId, Long friendUserId) {
        long a = Math.min(requesterId, friendUserId);
        long b = Math.max(requesterId, friendUserId);
        Friendship f = friendshipRepository.findByUserAIdAndUserBId(a, b)
                .filter(x -> x.getStatus() == FriendshipStatus.ACCEPTED)
                .orElseThrow(() -> new IllegalArgumentException("Vocês não são amigos"));
        friendshipRepository.delete(f);
        notify(a);
        notify(b);
    }

    private Friendship requirePending(Long requesterId, Long otherUserId) {
        long a = Math.min(requesterId, otherUserId);
        long b = Math.max(requesterId, otherUserId);
        return friendshipRepository.findByUserAIdAndUserBId(a, b)
                .filter(x -> x.getStatus() == FriendshipStatus.PENDING)
                .orElseThrow(() -> new IllegalArgumentException("Não tem nenhum pedido pendente com esse usuário"));
    }

    public boolean areFriends(Long userIdA, Long userIdB) {
        long a = Math.min(userIdA, userIdB);
        long b = Math.max(userIdA, userIdB);
        return friendshipRepository.findByUserAIdAndUserBId(a, b)
                .map(f -> f.getStatus() == FriendshipStatus.ACCEPTED)
                .orElse(false);
    }

    @Transactional
    public DirectChannel getOrCreateChannel(Long userIdA, Long userIdB) {
        long a = Math.min(userIdA, userIdB);
        long b = Math.max(userIdA, userIdB);
        return directChannelRepository.findByUserAIdAndUserBId(a, b)
                .orElseGet(() -> directChannelRepository.save(DirectChannel.builder().userAId(a).userBId(b).build()));
    }

    public List<FriendInfo> listFriends(Long userId) {
        List<Friendship> rows = friendshipRepository.findAllForUserWithStatus(userId, FriendshipStatus.ACCEPTED);
        List<FriendInfo> result = new ArrayList<>();
        for (Friendship f : rows) {
            Long otherId = f.getUserAId().equals(userId) ? f.getUserBId() : f.getUserAId();
            User other = userRepository.findById(otherId).orElse(null);
            if (other == null) {
                continue;
            }
            DirectChannel channel = getOrCreateChannel(userId, otherId);
            result.add(new FriendInfo(other.getId(), other.getUsername(), other.getNickname(), other.getAvatarUrl(),
                    presenceService.effectiveStatus(other.getId()), channel.getId()));
        }
        return result;
    }

    public FriendRequestsResponse listRequests(Long userId) {
        List<Friendship> rows = friendshipRepository.findAllForUserWithStatus(userId, FriendshipStatus.PENDING);
        List<FriendRequestInfo> incoming = new ArrayList<>();
        List<FriendRequestInfo> outgoing = new ArrayList<>();
        for (Friendship f : rows) {
            Long otherId = f.getUserAId().equals(userId) ? f.getUserBId() : f.getUserAId();
            User other = userRepository.findById(otherId).orElse(null);
            if (other == null) {
                continue;
            }
            FriendRequestInfo info = new FriendRequestInfo(other.getId(), other.getUsername(), other.getNickname(),
                    other.getAvatarUrl(), f.getCreatedAt());
            if (f.getRequestedBy().equals(userId)) {
                outgoing.add(info);
            } else {
                incoming.add(info);
            }
        }
        return new FriendRequestsResponse(incoming, outgoing);
    }

    private void notify(Long userId) {
        messagingTemplate.convertAndSendToUser(String.valueOf(userId), "/queue/friends", new FriendEvent("UPDATED"));
    }
}
