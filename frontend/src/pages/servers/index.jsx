import ServerSidebar from "../../components/ServerSidebar.jsx";
import ChannelSidebar from "../../components/ChannelSidebar.jsx";
import ChatWindow from "../../components/ChatWindow.jsx";
import VoiceChannel from "../../components/VoiceChannel.jsx";
import MemberList from "../../components/MemberList.jsx";
import CreateServerModal from "../../components/CreateServerModal.jsx";
import CreateChannelModal from "../../components/CreateChannelModal.jsx";
import EditServerModal from "../../components/EditServerModal.jsx";
import ServerRolesModal from "../../components/ServerRolesModal.jsx";
import AuditLogModal from "../../components/AuditLogModal.jsx";
import CustomEmojiModal from "../../components/CustomEmojiModal.jsx";
import SettingsModal from "../../components/SettingsModal.jsx";
import { useServersContainer } from "./Container.jsx";
import "./style.css";

export default function ServerPage() {
  const {
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
  } = useServersContainer();

  return (
    <>
      <div className="app-shell">
        <ServerSidebar
          servers={servers}
          selectedServerId={selectedServerId}
          onSelect={(id) => navigate(`/servers/${id}`)}
          onHome={() => navigate("/channels/@me")}
          onCreateServer={() => setShowCreateServer(true)}
        />
        <ChannelSidebar
          server={selectedServer}
          channels={channels}
          selectedChannelId={selectedChannel?.id}
          onSelectChannel={setSelectedChannel}
          onCreateChannel={openCreateChannel}
          onDeleteChannel={handleDeleteChannel}
          onOpenSettings={() => setShowSettings(true)}
          onEditServer={setEditingServer}
          onOpenRoles={setRolesServer}
          onOpenAuditLog={setAuditLogServer}
          onOpenEmojis={setEmojiServer}
          onMoveChannelCategory={handleMoveChannelCategory}
          onCategoryDeleted={handleCategoryDeleted}
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
          <EditServerModal
            server={editingServer}
            onClose={() => setEditingServer(null)}
            onUpdate={handleUpdateServer}
            onDelete={handleDeleteServer}
          />
        )}
        {rolesServer && (
          <ServerRolesModal
            server={rolesServer}
            stompClient={stompClient}
            stompConnected={stompConnected}
            onClose={() => setRolesServer(null)}
          />
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {auditLogServer && <AuditLogModal server={auditLogServer} onClose={() => setAuditLogServer(null)} />}
        {emojiServer && <CustomEmojiModal server={emojiServer} onClose={() => setEmojiServer(null)} />}
      </div>
    </>
  );
}
