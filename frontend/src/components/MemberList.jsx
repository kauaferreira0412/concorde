import { useState } from "react";
import { useServerMembers } from "../utils/useServerMembers";
import { useProfile } from "../context/ProfileContext.jsx";
import { ChevronsLeftIcon, ChevronsRightIcon, UsersIcon } from "./icons.jsx";
import Avatar from "./Avatar.jsx";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

/**
 * Lista de TODOS os membros do servidor (nao so' quem esta numa call de voz - isso ja e'
 * o "CONECTADOS AGORA" do ChannelSidebar), com o status de cada um (Online/Ausente/Nao
 * perturbe/Offline - ver PresenceStatus no backend). "Invisível" (escolha do proprio
 * usuario em Configuracoes) sempre aparece como Offline pra todo mundo, de propositio.
 */
export default function MemberList({ serverId, stompClient, stompConnected }) {
  const members = useServerMembers(serverId, stompClient, stompConnected);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("memberListCollapsed") === "true");

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("memberListCollapsed", String(next));
      return next;
    });
  }

  if (!serverId) return null;

  const online = members.filter((m) => m.status !== "OFFLINE");
  const offline = members.filter((m) => m.status === "OFFLINE");

  return (
    <div className={"member-list" + (collapsed ? " collapsed" : "")}>
      <div className="member-list-header">
        {!collapsed && <span className="channel-group-title">MEMBROS — {members.length}</span>}
        <button
          className="icon-btn"
          onClick={toggleCollapsed}
          title={collapsed ? "Abrir lista de membros" : "Fechar lista de membros"}
        >
          {collapsed ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
        </button>
      </div>

      {!collapsed && (
        <div className="member-list-body">
          {online.length > 0 && (
            <>
              <p className="channel-group-title member-list-group">ONLINE — {online.length}</p>
              {online.map((m) => (
                <MemberRow key={m.userId} member={m} />
              ))}
            </>
          )}
          {offline.length > 0 && (
            <>
              <p className="channel-group-title member-list-group">OFFLINE — {offline.length}</p>
              {offline.map((m) => (
                <MemberRow key={m.userId} member={m} />
              ))}
            </>
          )}
          {members.length === 0 && (
            <div className="member-list-empty">
              <UsersIcon size={22} />
              <p>Nenhum membro ainda</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MemberRow({ member }) {
  const { openProfile } = useProfile();
  return (
    <button
      type="button"
      className={"member-row" + (member.status === "OFFLINE" ? " offline" : "")}
      onClick={() => openProfile(member.userId)}
      title={`Ver perfil de ${member.username}`}
    >
      <div className="member-avatar-wrap">
        <Avatar name={member.username} url={member.avatarUrl} className="voice-avatar small" />
        <span className={"status-dot " + STATUS_DOT_CLASS[member.status]} title={STATUS_LABEL[member.status]} />
      </div>
      {/* Apelido DESSE servidor (ver Configurações > Perfil) tem prioridade sobre o username -
          mesma logica do Discord: e' local aquele servidor, so' quem esta nele ve. */}
      <span className="member-row-name">{member.nickname || member.username}</span>
      {member.role === "ADMIN" && <span className="admin-badge">ADMIN</span>}
    </button>
  );
}
