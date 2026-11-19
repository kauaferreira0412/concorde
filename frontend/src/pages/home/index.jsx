import { useEffect, useMemo, useState } from "react";
import ServerSidebar from "../../components/ServerSidebar.jsx";
import FriendsPanel from "../../components/FriendsPanel.jsx";
import DmChatWindow from "../../components/DmChatWindow.jsx";
import DmProfilePanel from "../../components/DmProfilePanel.jsx";
import Avatar from "../../components/Avatar.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import SettingsModal from "../../components/SettingsModal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useProfile } from "../../context/ProfileContext.jsx";
import { attachmentSummary } from "../../utils/attachmentSummary";
import { LogOutIcon, MessageSquareIcon, SearchIcon, SettingsIcon, UsersIcon } from "../../components/icons.jsx";
import { useHomeContainer } from "./Container.jsx";
import { LayoutProvider, usePageLayout } from "../../context/LayoutContext.jsx";
import MobileTabBar from "../../components/MobileTabBar.jsx";
import { useLocation } from "react-router-dom";
import "./style.css";

const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };
const STATUS_LABEL = { ONLINE: "online", AWAY: "ausente", DND: "não perturbe", OFFLINE: "invisível" };

export default function HomePage() {
  const { user, isAdmin, logout } = useAuth();
  const { openProfile } = useProfile();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [dmFilter, setDmFilter] = useState("");
  const layout = usePageLayout();
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

  // aba "Amigos" do celular vinda de outra página
  const location = useLocation();
  useEffect(() => {
    if (!location.state?.friends) return;
    openFriendsView();
    layout.showMain();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const mobileTab = layout.value.pane === "main" && view === "friends" ? "friends" : "dms";

  const visibleDms = useMemo(() => {
    const q = dmFilter.trim().toLowerCase();
    if (!q) return dmChannels;
    return dmChannels.filter((c) =>
      [c.otherNickname, c.otherUsername].some((n) => n && n.toLowerCase().includes(q))
    );
  }, [dmChannels, dmFilter]);

  return (
    <LayoutProvider value={layout.value}>
    <div {...layout.shellProps}>
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
          <strong>CONCORDE</strong>
          <span>suas conversas</span>
        </div>
        <label className="home-dm-search">
          <SearchIcon size={16} />
          <input
            placeholder="Achar conversa"
            value={dmFilter}
            onChange={(e) => setDmFilter(e.target.value)}
            aria-label="Achar conversa"
          />
        </label>
        <div className="home-nav">
        <button type="button" className={"home-nav-item" + (view === "friends" ? " active" : "")} onClick={() => {
            openFriendsView();
            layout.showMain();
          }}>
          <UsersIcon size={20} />
          Amigos
          {requests.incoming.length > 0 && <span className="home-nav-badge">{requests.incoming.length}</span>}
        </button>

        <p className="home-dm-list-title">CONVERSAS DIRETAS</p>
        <div className="home-dm-list">
          {visibleDms.length === 0 ? (
            <EmptyState
              size="sm"
              tone={dmChannels.length === 0 ? "accent" : "orange"}
              icon={dmChannels.length === 0 ? <MessageSquareIcon size={22} /> : <SearchIcon size={22} />}
              title={dmChannels.length === 0 ? "SEM CONVERSAS" : "NADA ENCONTRADO"}
              hint={
                dmChannels.length === 0
                  ? "Abre o perfil de um amigo e manda a primeira mensagem."
                  : `Nenhuma conversa com "${dmFilter.trim()}".`
              }
            />
          ) : (
            visibleDms.map((c) => {
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
                  onClick={() => {
                    openDmChannel(c);
                    layout.showMain();
                  }}
                >
                  <span className="member-avatar-wrap">
                    <Avatar name={c.otherUsername} url={c.otherAvatarUrl} className="home-dm-avatar" />
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
                  {isUnread && <span className="home-dm-item-unread-dot" title="Mensagens novas" />}
                </button>
              );
            })
          )}
        </div>
        </div>

        <div className="user-bar">
          <button type="button" className="user-bar-info" onClick={() => openProfile(user?.id)} title="Ver/editar seu perfil">
            <div className="member-avatar-wrap">
              <Avatar name={user?.username} url={user?.avatarUrl} className="user-bar-avatar" />
              <span className={"status-dot " + (STATUS_DOT_CLASS[user?.status] || "online")} />
            </div>
            <span className="user-bar-text">
              <span className="user-bar-name">{user?.nickname || user?.username}</span>
              <span className={"user-bar-role" + (user?.customStatus ? " user-bar-custom" : "")} title={user?.customStatus || undefined}>
                {user?.customStatus || (isAdmin ? "administrador" : STATUS_LABEL[user?.status] || "online")}
              </span>
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
          onOpenDm={(f) => {
            openDmWithFriend(f);
            layout.showMain();
          }}
        />
      ) : activeDm ? (
        <>
          <DmChatWindow channel={activeDm} stompClient={stompClient} stompConnected={stompConnected} stompError={stompError} />
          <DmProfilePanel channel={activeDm} />
        </>
      ) : (
        <div className="chat-window empty">
          <EmptyState
            icon={<MessageSquareIcon size={30} />}
            tone="accent"
            title="BORA PROSEAR?"
            hint="Escolhe uma conversa aí do lado ou abre Amigos pra chamar alguém."
          />
        </div>
      )}

      {layout.isMobile && (
        <MobileTabBar
          active={mobileTab}
          persistent={mobileTab === "friends"}
          friendsBadge={requests.incoming.length}
          onDms={() => layout.showNav()}
          onFriends={() => {
            openFriendsView();
            layout.showMain();
          }}
          onOpenSettings={() => setShowSettings(true)}
          onLogout={logout}
        />
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
    </LayoutProvider>
  );
}
