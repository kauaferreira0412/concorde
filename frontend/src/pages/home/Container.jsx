import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";
import { useDmNotifications } from "../../context/DmNotificationsContext.jsx";
import { createChatClient, subscribeToFriends } from "../../ws/chatSocket";

/**
 * Home ("/channels/@me", equivalente ao clique na logo do Concorde) - amigos + chats privados,
 * fora de qualquer servidor. Mesma ideia de pages/servers/Container.jsx (fetch de servidores +
 * cliente STOMP proprios), so' que o conteudo principal e' Amigos/DM em vez de canal/servidor -
 * arquivo/rota SEPARADOS de proposito (ver pages/home/index.jsx), pra nao empurrar estado de DM
 * pra dentro do Container de servidor que ja' e' grande o suficiente.
 */
export function useHomeContainer() {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { unreadDmIds, markDmRead, setActiveDmChannel } = useDmNotifications();

  // Ao SAIR da Home (fechar a aba, trocar de servidor) a conversa que estava aberta deixa de
  // estar "sendo vista" - senao mensagem nova nela nunca mais contaria como nao lida, mesmo
  // com o usuario navegando pra outro lugar (ver DmNotificationsContext.jsx, provider GLOBAL
  // que sobrevive a troca de pagina).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => setActiveDmChannel(null), []);

  const [servers, setServers] = useState([]);
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [stompError, setStompError] = useState("");

  const [view, setView] = useState("friends"); // "friends" | "dm"
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [dmChannels, setDmChannels] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [activeDm, setActiveDm] = useState(null); // { channelId, otherUserId, otherUsername, ... }
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!token) return;
    const client = createChatClient(token);
    client.onConnect = () => {
      setStompConnected(true);
      setStompError("");
    };
    client.onDisconnect = () => setStompConnected(false);
    client.onStompError = (frame) => {
      setStompConnected(false);
      setStompError(frame.headers["message"] || "Erro ao conectar no chat");
    };
    client.onWebSocketError = () => {
      setStompConnected(false);
      setStompError("Não foi possível abrir o WebSocket com o backend (ele está rodando em :8080?)");
    };
    client.activate();
    setStompClient(client);
    return () => client.deactivate();
  }, [token]);

  useEffect(() => {
    api.get("/api/servers").then(({ data }) => setServers(data));
  }, []);

  const reloadFriends = useCallback(() => {
    api.get("/api/friends").then(({ data }) => setFriends(data));
    api.get("/api/friends/requests").then(({ data }) => setRequests(data));
  }, []);

  const reloadDmChannels = useCallback(() => {
    api.get("/api/dm/channels").then(({ data }) => setDmChannels(data));
  }, []);

  const reloadBlocked = useCallback(() => {
    api.get("/api/friends/blocked").then(({ data }) => setBlocked(data));
  }, []);

  useEffect(() => {
    reloadFriends();
    reloadDmChannels();
    reloadBlocked();
  }, [reloadFriends, reloadDmChannels, reloadBlocked]);

  // Pedido/aceite/recusa/bloqueio de amizade em QUALQUER uma das minhas sessoes (ver
  // FriendshipService.notify no backend) - recarrega tudo de novo, mais simples e sem risco de
  // o estado local dessincronizar do banco.
  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToFriends(stompClient, () => {
      reloadFriends();
      reloadDmChannels();
      reloadBlocked();
    });
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected, reloadFriends, reloadDmChannels, reloadBlocked]);

  useEffect(() => {
    function handleOpenSettings() {
      setShowSettings(true);
    }
    window.addEventListener("concorde:open-settings", handleOpenSettings);
    return () => window.removeEventListener("concorde:open-settings", handleOpenSettings);
  }, []);

  async function sendFriendRequest(username) {
    await api.post("/api/friends/requests", { username });
    reloadFriends();
  }

  async function acceptFriendRequest(otherUserId) {
    await api.post(`/api/friends/requests/${otherUserId}/accept`);
    reloadFriends();
    reloadDmChannels();
  }

  async function declineFriendRequest(otherUserId) {
    await api.post(`/api/friends/requests/${otherUserId}/decline`);
    reloadFriends();
  }

  async function removeFriend(friendUserId) {
    await api.delete(`/api/friends/${friendUserId}`);
    reloadFriends();
    setActiveDm((prev) => (prev?.otherUserId === friendUserId ? null : prev));
  }

  async function blockUser(userId) {
    await api.post(`/api/friends/${userId}/block`);
    reloadFriends();
    reloadBlocked();
    setActiveDm((prev) => (prev?.otherUserId === userId ? null : prev));
  }

  async function unblockUser(userId) {
    await api.post(`/api/friends/${userId}/unblock`);
    reloadBlocked();
  }

  /** Abre a conversa com esse amigo - o backend ja' garante que o DirectChannel existe desde
   *  que a amizade foi aceita (ver FriendshipService.acceptInternal), entao aqui e' so' montar
   *  o objeto de canal a partir do que a lista de amigos ja' trouxe (sem round-trip extra) e
   *  fazer ele aparecer na lista de conversas na hora, mesmo antes do proximo reloadDmChannels. */
  function openDmWithFriend(friend) {
    const channel = {
      channelId: friend.dmChannelId,
      otherUserId: friend.userId,
      otherUsername: friend.username,
      otherNickname: friend.nickname,
      otherAvatarUrl: friend.avatarUrl,
      otherStatus: friend.status,
    };
    setActiveDm(channel);
    setView("dm");
    setDmChannels((prev) => {
      if (prev.some((c) => c.channelId === channel.channelId)) return prev;
      return [{ ...channel, lastMessage: null }, ...prev];
    });
    setActiveDmChannel(channel.channelId);
    markDmRead(channel.channelId);
  }

  function openDmChannel(dmChannelInfo) {
    setActiveDm({
      channelId: dmChannelInfo.channelId,
      otherUserId: dmChannelInfo.otherUserId,
      otherUsername: dmChannelInfo.otherUsername,
      otherNickname: dmChannelInfo.otherNickname,
      otherAvatarUrl: dmChannelInfo.otherAvatarUrl,
      otherStatus: dmChannelInfo.otherStatus,
    });
    setView("dm");
    setActiveDmChannel(dmChannelInfo.channelId);
    markDmRead(dmChannelInfo.channelId, dmChannelInfo.lastMessage?.id);
  }

  function openFriendsView() {
    setView("friends");
    setActiveDmChannel(null);
  }

  return {
    user,
    logout,
    navigate,
    servers,
    stompClient,
    stompConnected,
    stompError,
    view,
    friends,
    requests,
    dmChannels,
    unreadDmIds,
    blocked,
    activeDm,
    showSettings,
    setShowSettings,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    blockUser,
    unblockUser,
    openDmWithFriend,
    openDmChannel,
    openFriendsView,
  };
}
