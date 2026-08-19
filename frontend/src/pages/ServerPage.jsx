import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import { createChatClient } from "../ws/chatSocket";
import ServerSidebar from "../components/ServerSidebar.jsx";
import ChannelSidebar from "../components/ChannelSidebar.jsx";
import ChatWindow from "../components/ChatWindow.jsx";
import VoiceChannel from "../components/VoiceChannel.jsx";
import MemberList from "../components/MemberList.jsx";
import CreateServerModal from "../components/CreateServerModal.jsx";
import CreateChannelModal from "../components/CreateChannelModal.jsx";
import EditServerModal from "../components/EditServerModal.jsx";
import SettingsModal from "../components/SettingsModal.jsx";
import { VoiceCallProvider } from "../context/VoiceCallContext.jsx";

export default function ServerPage() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();

  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [editingServer, setEditingServer] = useState(null); // server sendo editado, null = fechado
  const [createChannelType, setCreateChannelType] = useState(null); // null | "TEXT" | "VOICE"
  const [showSettings, setShowSettings] = useState(false);
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [stompError, setStompError] = useState("");

  const selectedServerId = serverId ? Number(serverId) : null;
  const selectedServer = servers.find((s) => s.id === selectedServerId);

  // Conecta o WebSocket de chat uma vez, assim que autenticado
  useEffect(() => {
    if (!token) return;
    const client = createChatClient(token);
    client.onConnect = () => {
      setStompConnected(true);
      setStompError("");
    };
    client.onDisconnect = () => setStompConnected(false);
    // Sem isso, uma falha (ex: token invalido, backend fora do ar) fica muda -
    // a UI so mostrava o input desabilitado, sem dizer por que.
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

  // A edicao do PROPRIO perfil (apelido/foto/bio) vive dentro de Configuracoes agora (nao
  // tem mais uma tela separada de "editar perfil") - o cartao de perfil (ProfileModal.jsx,
  // aberto de qualquer lugar via ProfileContext) so' te manda pra ca quando e' voce mesmo.
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

  /** Depois de editar nome/icone/descricao (EditServerModal) - atualiza so' esse servidor
   *  na lista, sem precisar recarregar tudo de novo. */
  function handleUpdateServer(updated) {
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function openCreateChannel(type) {
    if (!selectedServerId) return;
    setCreateChannelType(type);
  }

  async function handleCreateChannel(name) {
    const { data } = await api.post(`/api/servers/${selectedServerId}/channels`, { name, type: createChannelType });
    setChannels((prev) => [...prev, data]);
  }

  return (
    <VoiceCallProvider stompClient={stompClient} stompConnected={stompConnected}>
      <div className="app-shell">
        <ServerSidebar
          servers={servers}
          selectedServerId={selectedServerId}
          onSelect={(id) => navigate(`/servers/${id}`)}
          onCreateServer={() => setShowCreateServer(true)}
        />
        <ChannelSidebar
          server={selectedServer}
          channels={channels}
          selectedChannelId={selectedChannel?.id}
          onSelectChannel={setSelectedChannel}
          onCreateChannel={openCreateChannel}
          onOpenSettings={() => setShowSettings(true)}
          onEditServer={setEditingServer}
          stompClient={stompClient}
          stompConnected={stompConnected}
          user={user}
          onLogout={logout}
        />

        {selectedChannel?.type === "VOICE" ? (
          <VoiceChannel
            channel={selectedChannel}
            serverName={selectedServer?.name}
            stompClient={stompClient}
            stompConnected={stompConnected}
          />
        ) : (
          <ChatWindow
            channel={selectedChannel}
            stompClient={stompClient}
            stompConnected={stompConnected}
            stompError={stompError}
          />
        )}

        <MemberList serverId={selectedServerId} stompClient={stompClient} stompConnected={stompConnected} />

        {showCreateServer && (
          <CreateServerModal onClose={() => setShowCreateServer(false)} onCreate={handleCreateServer} />
        )}
        {createChannelType && (
          <CreateChannelModal
            type={createChannelType}
            onClose={() => setCreateChannelType(null)}
            onCreate={handleCreateChannel}
          />
        )}
        {editingServer && (
          <EditServerModal server={editingServer} onClose={() => setEditingServer(null)} onUpdate={handleUpdateServer} />
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </VoiceCallProvider>
  );
}
