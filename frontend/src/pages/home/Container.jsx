import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const { user, token, logout } = useAuth();
  const { unreadDmIds, latestDmMessages, markDmRead, setActiveDmChannel } = useDmNotifications();

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

  // Chegou aqui vindo do botao "Enviar mensagem" no perfil de um membro (ver ProfileModal.jsx,
  // "goToDm") - ja abre a conversa direto, sem precisar clicar de novo na lista depois de
  // navegar. Limpa o state logo em seguida (replace) pra nao reabrir sozinho de novo se o
  // usuario der F5 ou voltar por aqui de outro jeito.
  useEffect(() => {
    const openDm = location.state?.openDm;
    if (!openDm) return;
    setActiveDm(openDm);
    setView("dm");
    setActiveDmChannel(openDm.channelId);
    markDmRead(openDm.channelId);
    setDmChannels((prev) => (prev.some((c) => c.channelId === openDm.channelId) ? prev : [{ ...openDm, lastMessage: null }, ...prev]));
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Rede de seguranca alem do WebSocket acima - se por qualquer motivo esse evento nao chegar
  // (rede instavel, reconexao no meio, etc), a lista de qualquer forma se atualiza sozinha em
  // no maximo 15s, sem precisar de F5 (reportado pelo usuario: "so' atualiza se der F5").
  useEffect(() => {
    const interval = setInterval(() => {
      reloadFriends();
      reloadDmChannels();
      reloadBlocked();
    }, 15000);
    return () => clearInterval(interval);
  }, [reloadFriends, reloadDmChannels, reloadBlocked]);

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

  // Mescla a ultima mensagem AO VIVO (ver DmNotificationsContext.jsx) por cima do que veio da
  // API - sem isso, o texto embaixo do nome na lista de conversas so' atualizava dando F5
  // (reportado pelo usuario). Reordena pra' conversa com mensagem nova sempre subir, igual
  // Discord faz.
  const displayedDmChannels = useMemo(() => {
    return dmChannels
      .map((c) => (latestDmMessages[c.channelId] ? { ...c, lastMessage: latestDmMessages[c.channelId] } : c))
      .sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [dmChannels, latestDmMessages]);

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
    dmChannels: displayedDmChannels,
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
