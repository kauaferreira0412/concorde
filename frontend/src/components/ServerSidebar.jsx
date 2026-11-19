import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useDmNotifications } from "../context/DmNotificationsContext.jsx";
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import { HeadphonesIcon, PlusIcon } from "./icons.jsx";

const MAX_AVATARS = 8;

export default function ServerSidebar({ servers, selectedServerId, homeActive, onSelect, onHome, onCreateServer }) {
  const { hasUnreadDm } = useDmNotifications();
  const [hoveredServerId, setHoveredServerId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [voicePresence, setVoicePresence] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const { user, updateUser } = useAuth();
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, after }

  // Ordem pessoal (salva no perfil, vale em qualquer aparelho); servidores novos vão pro fim.
  const orderedServers = useMemo(() => {
    const order = user?.serverOrder || [];
    const pos = new Map(order.map((id, i) => [String(id), i]));
    return [...servers].sort((a, b) => {
      const pa = pos.has(String(a.id)) ? pos.get(String(a.id)) : Infinity;
      const pb = pos.has(String(b.id)) ? pos.get(String(b.id)) : Infinity;
      return pa === pb ? 0 : pa - pb;
    });
  }, [servers, user?.serverOrder]);

  function dropOn(targetId, after) {
    const from = dragId;
    setDragId(null);
    setDropTarget(null);
    if (from == null || from === targetId) return;
    const ids = orderedServers.map((s) => s.id).filter((id) => id !== from);
    let idx = ids.indexOf(targetId);
    if (idx < 0) return;
    if (after) idx += 1;
    ids.splice(idx, 0, from);
    const prev = user?.serverOrder || [];
    updateUser({ serverOrder: ids });
    api.put("/api/users/me/server-order", { ids }).catch(() => updateUser({ serverOrder: prev }));
  }

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
          aria-label="Mensagens diretas"
        >
          <img src={`${import.meta.env.BASE_URL}logo-badge.png`} alt="" className="server-icon-img" />
        </button>
        {hasUnreadDm && <span className="server-icon-unread-dot" title="Você tem mensagens privadas não lidas" />}
      </div>
      <div className="server-sidebar-divider" />
      {orderedServers.map((s) => {
        const isActive = s.id === selectedServerId;
        const drop = dropTarget?.id === s.id ? (dropTarget.after ? " drop-after" : " drop-before") : "";
        return (
          <div
            key={s.id}
            className={"server-icon-wrap" + (dragId === s.id ? " dragging" : "") + drop}
            // tooltip só com mouse: no toque ele ficava preso na tela até clicar fora
            onPointerEnter={(e) => e.pointerType === "mouse" && !dragId && handleHoverStart(s.id, e.currentTarget)}
            onPointerLeave={handleHoverEnd}
            draggable
            onDragStart={(e) => {
              handleHoverEnd();
              setDragId(s.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(s.id));
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropTarget(null);
            }}
            onDragOver={(e) => {
              if (dragId == null) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > r.top + r.height / 2;
              if (dropTarget?.id !== s.id || dropTarget.after !== after) setDropTarget({ id: s.id, after });
            }}
            onDrop={(e) => {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              dropOn(s.id, e.clientY > r.top + r.height / 2);
            }}
            title="Arraste pra reordenar"
          >
            <span className={"server-icon-pill" + (isActive ? " active" : "")} />
            <button
              className={"server-icon" + (isActive ? " active" : "") + (s.iconUrl ? " has-icon" : "")}
              onClick={() => {
                handleHoverEnd();
                onSelect(s.id);
              }}
              aria-label={s.name}
            >
              {s.iconUrl ? <img src={s.iconUrl} alt="" className="server-icon-img" /> : s.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        );
      })}
      <button className="server-icon add" title="Criar servidor" aria-label="Criar servidor" onClick={onCreateServer}>
        <PlusIcon size={22} />
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
