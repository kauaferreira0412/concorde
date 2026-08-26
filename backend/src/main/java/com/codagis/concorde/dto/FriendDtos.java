package com.codagis.concorde.dto;

import com.codagis.concorde.enums.PresenceStatus;

import java.time.Instant;
import java.util.List;

public class FriendDtos {

    public record FriendInfo(Long userId, String username, String nickname, String avatarUrl,
                              PresenceStatus status, Long dmChannelId) {}

    public record FriendRequestInfo(Long userId, String username, String nickname, String avatarUrl, Instant createdAt) {}

    public record FriendRequestsResponse(List<FriendRequestInfo> incoming, List<FriendRequestInfo> outgoing) {}

    public record SendFriendRequestBody(String username) {}

    // "SELF" (e' voce mesmo), "NONE" (estranhos), "OUTGOING" (voce mandou pedido, esperando),
    // "INCOMING" (ele mandou pedido pra voce), "FRIENDS" (amigos - dmChannelId preenchido),
    // "BLOCKED_BY_ME"/"BLOCKED_BY_THEM". Usado no perfil de um membro (ver ProfileModal.jsx)
    // pra decidir se mostra "Adicionar amigo" ou "Enviar mensagem".
    public record FriendStatusResponse(String status, Long dmChannelId) {}

    // Evento generico via /user/queue/friends - o frontend so' reage recarregando a lista de
    // amigos/pedidos (ver FriendsPage), sem tentar aplicar patch incremental no estado.
    public record FriendEvent(String type) {}
}
