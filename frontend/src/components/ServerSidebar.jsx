import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDmNotifications } from "../context/DmNotificationsContext.jsx";
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import { HeadphonesIcon } from "./icons.jsx";

const MAX_AVATARS = 8;

export default function ServerSidebar({ servers, selectedServerId, homeActive, onSelect, onHome, onCreateServer }) {
  const { hasUnreadDm } = useDmNotifications();
  const [hoveredServerId, setHoveredServerId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [voicePresence, setVoicePresence] = useState(null);
  const hoverTimeoutRef = useRef(null);

  function handleHoverStart(serverId, iconEl) {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      const rect = iconEl.getBoundingClientRect();
      setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 14 });
      setHoveredServerId(serverId);
      setVoicePresence(null);
      api
        .get(`/api/servers/${serverId}/voice-presence`)
        .then(({ data }) => setVoicePresence(data || []))
        .catch(() => setVoicePresence([]));
    }, 200);
  }

  function handleHoverEnd() {
    clearTimeout(hoverTimeoutRef.current);
    setHoveredServerId(null);
  }

  const hoveredServer = servers.find((s) => s.id === hoveredServerId);

  return (
    <div className="server-sidebar">
      <div className="server-icon-wrap">
        <span className={"server-icon-pill" + (homeActive ? " active" : "")} />
        <button
          className={"server-icon home has-icon" + (homeActive ? " active" : "")}
          onClick={onHome}
          title="Página inicial (amigos e mensagens)"
        >
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="server-icon-img" />
        </button>
        {hasUnreadDm && <span className="server-icon-unread-dot" title="Você tem mensagens privadas não lidas" />}
      </div>
      <div className="server-sidebar-divider" />
      {servers.map((s) => {
        const isActive = s.id === selectedServerId;
        return (
          <div
            key={s.id}
            className="server-icon-wrap"
            onMouseEnter={(e) => handleHoverStart(s.id, e.currentTarget)}
            onMouseLeave={handleHoverEnd}
          >
            <span className={"server-icon-pill" + (isActive ? " active" : "")} />
            <button
              className={"server-icon" + (isActive ? " active" : "") + (s.iconUrl ? " has-icon" : "")}
              onClick={() => onSelect(s.id)}
            >
              {s.iconUrl ? <img src={s.iconUrl} alt="" className="server-icon-img" /> : s.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        );
      })}
      <button className="server-icon add" title="Criar servidor" onClick={onCreateServer}>
        +
      </button>

      {hoveredServer &&
        tooltipPos &&
        createPortal(
          <div className="server-hover-tooltip" style={{ top: tooltipPos.top, left: tooltipPos.left }}>
            <p className="server-hover-tooltip-name">{hoveredServer.name}</p>
            {Array.isArray(voicePresence) && voicePresence.length > 0 && (
              <div className="server-hover-tooltip-voice">
                <HeadphonesIcon size={12} className="server-hover-tooltip-voice-icon" />
                <div className="server-hover-tooltip-avatars">
                  {voicePresence.slice(0, MAX_AVATARS).map((p) => (
                    <Avatar
                      key={p.userId}
                      name={p.username}
                      url={p.avatarUrl}
                      className="voice-avatar small server-hover-tooltip-avatar"
                    />
                  ))}
                  {voicePresence.length > MAX_AVATARS && (
                    <span className="server-hover-tooltip-avatar-more">+{voicePresence.length - MAX_AVATARS}</span>
                  )}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
