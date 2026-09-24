import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";
import { useDmNotifications } from "../../context/DmNotificationsContext.jsx";
import { createChatClient, subscribeToFriends } from "../../ws/chatSocket";

export function useHomeContainer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, logout } = useAuth();
  const { unreadDmIds, latestDmMessages, markDmRead, setActiveDmChannel } = useDmNotifications();

  useEffect(() => () => setActiveDmChannel(null), []);

  const [servers, setServers] = useState([]);
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [stompError, setStompError] = useState("");

  const [view, setView] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [dmChannels, setDmChannels] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [activeDm, setActiveDm] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const openDm = location.state?.openDm;
    if (!openDm) return;
    setActiveDm(openDm);
    setView("dm");
    setActiveDmChannel(openDm.channelId);
    markDmRead(openDm.channelId);
    setDmChannels((prev) => (prev.some((c) => c.channelId === openDm.channelId) ? prev : [{ ...openDm, lastMessage: null }, ...prev]));
    navigate(location.pathname, { replace: true, state: null });
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
