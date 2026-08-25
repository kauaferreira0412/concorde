import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";
import { createChatClient } from "../../ws/chatSocket";

export function useServersContainer() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();

  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [rolesServer, setRolesServer] = useState(null);
  const [createChannelType, setCreateChannelType] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [stompError, setStompError] = useState("");

  const selectedServerId = serverId ? Number(serverId) : null;
  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const isPotatoMafiaServer = (selectedServer?.name || "").toLowerCase().includes("potato");

  useEffect(() => {
    if (!token) return;
    const client = createChatClient(token);
    client.onConnect = () => {
      setStompConnected(true);
      setStompError("");
    };
    client.onDisconnect = () => setStompConnected(false);
    client.onStompError = (frame) => {
      console.error("Erro STOMP:", frame.headers["message"], frame.body);
      setStompConnected(false);
      setStompError(frame.headers["message"] || "Erro ao conectar no chat");
    };
    client.onWebSocketError = (event) => {
      console.error("Erro de WebSocket:", event);
      setStompConnected(false);
      setStompError("Não foi possível abrir o WebSocket com o backend (ele está rodando em :8080?)");
    };
    client.activate();
    setStompClient(client);
    return () => client.deactivate();
  }, [token]);

  useEffect(() => {
    api.get("/api/servers").then(({ data }) => {
      setServers(data);
      if (!selectedServerId && data.length > 0) {
        navigate(`/servers/${data[0].id}`, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedServerId) return;
    setSelectedChannel(null);
    api.get(`/api/servers/${selectedServerId}/channels`).then(({ data }) => {
      setChannels(data);
      const firstText = data.find((c) => c.type === "TEXT");
      if (firstText) setSelectedChannel(firstText);
    });
  }, [selectedServerId]);

  useEffect(() => {
    function handleOpenSettings() {
      setShowSettings(true);
    }
    window.addEventListener("concorde:open-settings", handleOpenSettings);
    return () => window.removeEventListener("concorde:open-settings", handleOpenSettings);
  }, []);

  async function handleCreateServer(name) {
    const { data } = await api.post("/api/servers", { name });
    setServers((prev) => [...prev, data]);
    navigate(`/servers/${data.id}`);
  }

  function handleUpdateServer(updated) {
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleDeleteServer(deletedId) {
    const remaining = servers.filter((s) => s.id !== deletedId);
    setServers(remaining);
    if (selectedServerId === deletedId) {
      navigate(remaining.length > 0 ? `/servers/${remaining[0].id}` : "/servers", { replace: true });
    }
  }

  function openCreateChannel(type) {
    if (!selectedServerId) return;
    setCreateChannelType(type);
  }

  async function handleCreateChannel(name) {
    const { data } = await api.post(`/api/servers/${selectedServerId}/channels`, { name, type: createChannelType });
    setChannels((prev) => [...prev, data]);
  }

  async function handleDeleteChannel(channelId) {
    await api.delete(`/api/servers/${selectedServerId}/channels/${channelId}`);
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
    setSelectedChannel((prev) => {
      if (prev?.id !== channelId) return prev;
      const remaining = channels.filter((c) => c.id !== channelId);
      return remaining.find((c) => c.type === "TEXT") || null;
    });
  }

  return {
    user,
    logout,
    navigate,
    servers,
    channels,
    selectedChannel,
    setSelectedChannel,
    showCreateServer,
    setShowCreateServer,
    editingServer,
    setEditingServer,
    rolesServer,
    setRolesServer,
    createChannelType,
    setCreateChannelType,
    showSettings,
    setShowSettings,
    stompClient,
    stompConnected,
    stompError,
    selectedServerId,
    selectedServer,
    isPotatoMafiaServer,
    handleCreateServer,
    handleUpdateServer,
    handleDeleteServer,
    openCreateChannel,
    handleCreateChannel,
    handleDeleteChannel,
  };
}
