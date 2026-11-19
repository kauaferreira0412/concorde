import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useDmNotifications } from "../context/DmNotificationsContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import { LogOutIcon, MessageSquareIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons.jsx";

const LAST_SERVER_KEY = "concorde:last-server";
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", INVISIBLE: "offline" };
const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", INVISIBLE: "Invisível" };

export function rememberLastServer(id) {
  try {
    if (id) localStorage.setItem(LAST_SERVER_KEY, String(id));
  } catch {
    // sem storage: tudo bem
  }
}

function lastServerPath() {
  try {
    const id = localStorage.getItem(LAST_SERVER_KEY);
    return id ? `/servers/${id}` : "/servers";
  } catch {
    return "/servers";
  }
}

function ServersIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2.2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2" />
    </svg>
  );
}

/**
 * Barra de abas do celular (só aparece em telas pequenas, pelo CSS).
 * active: "servers" | "dms" | "friends"
 */
export default function MobileTabBar({ active, onFriends, onDms, onOpenSettings, onLogout, friendsBadge = 0, persistent = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasUnreadDm } = useDmNotifications();
  const [youOpen, setYouOpen] = useState(false);

  const tabs = [
    { key: "servers", label: "Servidores", icon: <ServersIcon />, onClick: () => navigate(lastServerPath()) },
    {
      key: "dms",
      label: "Mensagens",
      icon: <MessageSquareIcon size={22} />,
      dot: hasUnreadDm,
      onClick: () => (onDms ? onDms() : navigate("/channels/@me")),
    },
    {
      key: "friends",
      label: "Amigos",
      icon: <UsersIcon size={22} />,
      badge: friendsBadge,
      onClick: () => (onFriends ? onFriends() : navigate("/channels/@me", { state: { friends: true } })),
    },
  ];

  return (
    <>
      <nav className={"mobile-tabbar" + (persistent ? " persistent" : "")} aria-label="Navegação principal">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"mobile-tab" + (active === t.key ? " active" : "")}
            onClick={t.onClick}
            aria-current={active === t.key ? "page" : undefined}
          >
            <span className="mobile-tab-icon">
              {t.icon}
              {t.dot && <span className="mobile-tab-dot" aria-label="não lidas" />}
              {t.badge > 0 && <span className="mobile-tab-badge">{t.badge > 9 ? "9+" : t.badge}</span>}
            </span>
            <span className="mobile-tab-label">{t.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={"mobile-tab" + (youOpen ? " active" : "")}
          onClick={() => setYouOpen(true)}
          aria-haspopup="dialog"
        >
          <span className="mobile-tab-icon mobile-tab-you">
            <Avatar name={user?.username} url={user?.avatarUrl} className="mobile-tab-avatar" />
            <span className={"status-dot " + (STATUS_DOT_CLASS[user?.status] || "online")} />
          </span>
          <span className="mobile-tab-label">Você</span>
        </button>
      </nav>
      {youOpen && <YouSheet onClose={() => setYouOpen(false)} onOpenSettings={onOpenSettings} onLogout={onLogout} />}
    </>
  );
}

function YouSheet({ onClose, onOpenSettings, onLogout }) {
  const { user, isAdmin } = useAuth();
  const { openProfile } = useProfile();
  const { activeChannel, leaveChannel } = useVoiceCall();
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop you-sheet-backdrop" onClick={onClose}>
      <div className="modal you-sheet" role="dialog" aria-label="Você" onClick={(e) => e.stopPropagation()}>
        <span className="you-sheet-grabber" aria-hidden="true" />
        <div
          className={"you-sheet-banner" + (user?.bannerUrl ? " has-image" : "")}
          style={{
            ...(user?.bannerUrl ? { backgroundImage: `url("${user.bannerUrl}")` } : null),
            ...(user?.accentColor ? { "--profile-accent": user.accentColor } : null),
          }}
        />
        <div className="you-sheet-head">
          <span className="member-avatar-wrap">
            <Avatar name={user?.username} url={user?.avatarUrl} className="you-sheet-avatar" />
            <span className={"status-dot " + (STATUS_DOT_CLASS[user?.status] || "online")} />
          </span>
          <div className="you-sheet-name">
            <strong>{user?.nickname || user?.username}</strong>
            <span>@{user?.username}</span>
            <span className="you-sheet-status">
              {user?.customStatus || (isAdmin ? "Administrador" : STATUS_LABEL[user?.status] || "Online")}
            </span>
          </div>
        </div>
        <div className="you-sheet-actions">
          <button
            type="button"
            className="you-sheet-item"
            onClick={() => {
              onClose();
              openProfile(user?.id);
            }}
          >
            <UserIcon size={18} /> Meu perfil
          </button>
          <button
            type="button"
            className="you-sheet-item"
            onClick={() => {
              onClose();
              onOpenSettings?.();
            }}
          >
            <SettingsIcon size={18} /> Configurações
          </button>
          <button type="button" className="you-sheet-item danger" onClick={() => setConfirmLogout(true)}>
            <LogOutIcon size={18} /> Sair da conta
          </button>
        </div>
      </div>
      {confirmLogout && (
        <ConfirmModal
          title="Sair da conta"
          message={
            activeChannel
              ? "Você está numa call de voz agora - sair da conta também vai te desconectar dela. Tem certeza?"
              : "Tem certeza que quer sair da sua conta?"
          }
          confirmLabel="Sair"
          danger
          onClose={() => setConfirmLogout(false)}
          onConfirm={async () => {
            if (activeChannel) await leaveChannel();
            onLogout?.();
          }}
        />
      )}
    </div>,
    document.body
  );
}
