import { useState } from "react";
import ServerSidebar from "../../components/ServerSidebar.jsx";
import FriendsPanel from "../../components/FriendsPanel.jsx";
import DmChatWindow from "../../components/DmChatWindow.jsx";
import Avatar from "../../components/Avatar.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import SettingsModal from "../../components/SettingsModal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useProfile } from "../../context/ProfileContext.jsx";
import { attachmentSummary } from "../../utils/attachmentSummary";
import { LogOutIcon, MessageSquareIcon, SettingsIcon, UsersIcon } from "../../components/icons.jsx";
import { useHomeContainer } from "./Container.jsx";
import "./style.css";

const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

/**
 * Home ("/channels/@me") - o que aparece ao clicar na logo do Concorde no topo da barra de
 * servidores (ver ServerSidebar.jsx): amigos + chats privados, fora de qualquer servidor. Mesma
 * composicao de pages/servers/index.jsx (ServerSidebar na barra da esquerda + uma coluna do
 * meio + o conteudo principal), so' que a coluna do meio e' a lista de conversas diretas em vez
 * de canais, e o conteudo principal e' o painel de Amigos ou uma DmChatWindow.
 */
export default function HomePage() {
  const { user, isAdmin, logout } = useAuth();
  const { openProfile } = useProfile();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const {
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
  } = useHomeContainer();

  return (
    <div className="app-shell">
      <ServerSidebar
        servers={servers}
        selectedServerId={null}
        homeActive
        onSelect={(id) => navigate(`/servers/${id}`)}
        onHome={() => {}}
        onCreateServer={() => navigate("/servers?create=1")}
      />

      <div className="home-sidebar">
        <div className="home-sidebar-header">
          <strong>Concorde</strong>
        </div>
        <button type="button" className={"home-nav-item" + (view === "friends" ? " active" : "")} onClick={openFriendsView}>
          <UsersIcon size={17} />
          Amigos
          {requests.incoming.length > 0 && <span className="home-nav-badge">{requests.incoming.length}</span>}
        </button>

        <p className="home-dm-list-title">CONVERSAS DIRETAS</p>
        <div className="home-dm-list">
          {dmChannels.length === 0 ? (
            <p className="friends-panel-empty" style={{ padding: "0 12px" }}>
              Adicione um amigo pra começar a conversar.
            </p>
          ) : (
            dmChannels.map((c) => {
              const isUnread = unreadDmIds.has(c.channelId);
              return (
                <button
                  type="button"
                  key={c.channelId}
                  className={
                    "home-dm-item" +
                    (view === "dm" && activeDm?.channelId === c.channelId ? " active" : "") +
                    (isUnread ? " unread" : "")
                  }
                  onClick={() => openDmChannel(c)}
                >
                  <span className="member-avatar-wrap">
                    <Avatar name={c.otherUsername} url={c.otherAvatarUrl} className="voice-avatar" />
                    <span className={"status-dot " + (STATUS_DOT_CLASS[c.otherStatus] || "offline")} />
                  </span>
                  <span className="home-dm-item-info">
                    <strong>{c.otherNickname || c.otherUsername}</strong>
                    {c.lastMessage && (
                      <span className="home-dm-item-preview">
                        {attachmentSummary(c.lastMessage)}
                      </span>
                    )}
                  </span>
                  {/* Pontinho de mensagem nao lida - some ao abrir a conversa (ver
                      DmNotificationsContext.jsx). */}
                  {isUnread && <span className="home-dm-item-unread-dot" />}
                </button>
              );
            })
          )}
        </div>

        <div className="user-bar">
          <button type="button" className="user-bar-info" onClick={() => openProfile(user?.id)} title="Ver/editar seu perfil">
            <div className="member-avatar-wrap">
              <Avatar name={user?.username} url={user?.avatarUrl} className="user-bar-avatar" />
              <span className={"status-dot " + (STATUS_DOT_CLASS[user?.status] || "online")} />
            </div>
            <span className="user-bar-text">
              <span className="user-bar-name">{user?.nickname || user?.username}</span>
              {isAdmin && <span className="user-bar-role">Administrador</span>}
            </span>
          </button>
          <div className="user-bar-actions">
            <button className="icon-btn" onClick={() => setShowSettings(true)} title="Configurações">
              <SettingsIcon />
            </button>
            <button className="icon-btn icon-btn-danger" onClick={() => setShowLogoutConfirm(true)} title="Sair da conta">
              <LogOutIcon />
            </button>
          </div>
        </div>
      </div>

      {view === "friends" ? (
        <FriendsPanel
          friends={friends}
          requests={requests}
          blocked={blocked}
          onSendRequest={sendFriendRequest}
          onAccept={acceptFriendRequest}
          onDecline={declineFriendRequest}
          onRemove={removeFriend}
          onBlock={blockUser}
          onUnblock={unblockUser}
          onOpenDm={openDmWithFriend}
        />
      ) : activeDm ? (
        <DmChatWindow channel={activeDm} stompClient={stompClient} stompConnected={stompConnected} stompError={stompError} />
      ) : (
        <div className="chat-window empty">
          <MessageSquareIcon size={40} />
          <p>Selecione uma conversa</p>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showLogoutConfirm && (
        <ConfirmModal
          title="Sair da conta"
          message="Tem certeza que quer sair da sua conta?"
          confirmLabel="Sair"
          danger
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={logout}
        />
      )}
    </div>
  );
}
