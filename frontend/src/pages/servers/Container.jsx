import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";
import { createChatClient } from "../../ws/chatSocket";
import { fetchWithRetry } from "../../utils/fetchWithRetry";

export function useServersContainer() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, logout } = useAuth();

  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [rolesServer, setRolesServer] = useState(null);
  const [auditLogServer, setAuditLogServer] = useState(null);
  const [emojiServer, setEmojiServer] = useState(null);
  const [createChannelType, setCreateChannelType] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [stompError, setStompError] = useState("");
  // true so' quando o carregamento inicial da lista de servidores falhou de vez (depois de 3
  // tentativas) - distingue de "voce realmente nao tem nenhum servidor ainda" (ver
  // ChannelSidebar.jsx). Reportado pelo usuario: um soluco de rede deixava a tela vazia pra
  // sempre, parecendo "sem acesso", sem jeito de saber que era so' falha de carregar.
  const [serversLoadError, setServersLoadError] = useState(false);
  const [channelsLoadError, setChannelsLoadError] = useState(false);

  const selectedServerId = serverId ? Number(serverId) : null;
  const selectedServer = servers.find((s) => s.id === selectedServerId);

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

  function loadServers() {
    setServersLoadError(false);
    return fetchWithRetry(() => api.get("/api/servers"))
      .then(({ data }) => {
        setServers(data);
        if (!selectedServerId && data.length > 0) {
          navigate(`/servers/${data[0].id}`, { replace: true });
        }
      })
      .catch((err) => {
        console.error("Não foi possível carregar seus servidores depois de várias tentativas:", err);
        setServersLoadError(true);
      });
  }

  useEffect(() => {
    loadServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadChannels() {
    if (!selectedServerId) return;
    setChannelsLoadError(false);
    setSelectedChannel(null);
    fetchWithRetry(() => api.get(`/api/servers/${selectedServerId}/channels`))
      .then(({ data }) => {
        setChannels(data);
        const firstText = data.find((c) => c.type === "TEXT");
        if (firstText) setSelectedChannel(firstText);
      })
      .catch((err) => {
        console.error("Não foi possível carregar os canais desse servidor depois de várias tentativas:", err);
        setChannelsLoadError(true);
      });
  }

  useEffect(() => {
    loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServerId]);

  // Veio do Home (fora de qualquer servidor - la' nao tem onde abrir o modal, ver
  // pages/home/index.jsx "onCreateServer") com "?create=1" - abre o modal aqui e limpa a
  // query pra nao reabrir sozinho num F5.
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowCreateServer(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    function handleOpenSettings() {
      setShowSettings(true);
    }
    window.addEventListener("concorde:open-settings", handleOpenSettings);
    return () => window.removeEventListener("concorde:open-settings", handleOpenSettings);
  }, []);

  async function handleCreateServer(name, type) {
    const { data } = await api.post("/api/servers", { name, type });
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

  async function handleMoveChannelCategory(channelId, categoryId) {
    const { data } = await api.put(`/api/servers/${selectedServerId}/channels/${channelId}/category`, { categoryId });
    setChannels((prev) => prev.map((c) => (c.id === channelId ? data : c)));
  }

  /** Categoria excluida (ver ChannelSidebar.jsx) - o backend ja' solta os canais que estavam
   *  dentro dela (so' zera categoryId, nao apaga ninguem, ver ServerService.deleteCategory), mas
   *  o "channels" daqui continuava com o categoryId VELHO ate' o proximo F5 - os canais somem
   *  da tela sozinhos (nenhum grupo mais os renderiza), parecendo que foram apagados junto com a
   *  categoria (reportado pelo usuario). So' espelha aqui o que o backend ja' fez de verdade. */
  function handleCategoryDeleted(categoryId) {
    setChannels((prev) => prev.map((c) => (c.categoryId === categoryId ? { ...c, categoryId: null } : c)));
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
    auditLogServer,
    setAuditLogServer,
    emojiServer,
    setEmojiServer,
    createChannelType,
    setCreateChannelType,
    showSettings,
    setShowSettings,
    stompClient,
    stompConnected,
    stompError,
    serversLoadError,
    channelsLoadError,
    onRetryLoadServers: loadServers,
    onRetryLoadChannels: loadChannels,
    selectedServerId,
    selectedServer,
    handleCreateServer,
    handleUpdateServer,
    handleDeleteServer,
    openCreateChannel,
    handleCreateChannel,
    handleDeleteChannel,
    handleMoveChannelCategory,
    handleCategoryDeleted,
  };
}
