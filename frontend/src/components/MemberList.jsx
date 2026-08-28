import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useServerMembers } from "../utils/useServerMembers";
import { useSpotifyNowPlaying } from "../utils/useSpotifyNowPlaying";
import { useProfile } from "../context/ProfileContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { ChevronsLeftIcon, ChevronsRightIcon, MusicNoteIcon, PencilIcon, TrashIcon, UsersIcon } from "./icons.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import PotatoMafiaBanner from "./PotatoMafiaBanner.jsx";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

/**
 * Lista de TODOS os membros do servidor (nao so' quem esta numa call de voz - isso ja e'
 * o "CONECTADOS AGORA" do ChannelSidebar), com o status de cada um (Online/Ausente/Nao
 * perturbe/Offline - ver PresenceStatus no backend). "Invisível" (escolha do proprio
 * usuario em Configuracoes) sempre aparece como Offline pra todo mundo, de propositio.
 */
export default function MemberList({ serverId, stompClient, stompConnected, showPotatoBanner }) {
  const members = useServerMembers(serverId, stompClient, stompConnected);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("memberListCollapsed") === "true");
  // MANAGE_MEMBERS - controla se "Remover do servidor"/"Editar apelido" aparecem no clique
  // direito de cada membro (ver MemberRow). O backend confere a permissao de novo em cada
  // chamada, entao mesmo sem os botoes aparecerem ninguem sem permissao consegue nada.
  const [myServerPermissions, setMyServerPermissions] = useState(new Set());

  useEffect(() => {
    if (!serverId) {
      setMyServerPermissions(new Set());
      return;
    }
    let cancelled = false;
    api
      .get(`/api/servers/${serverId}/me/permissions`)
      .then(({ data }) => {
        if (!cancelled) setMyServerPermissions(new Set(data));
      })
      .catch(() => {
        if (!cancelled) setMyServerPermissions(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("memberListCollapsed", String(next));
      return next;
    });
  }

  const online = members.filter((m) => m.status !== "OFFLINE");
  const offline = members.filter((m) => m.status === "OFFLINE");
  // "Ouvindo Spotify" de quem conectou a conta (opt-in, ver Configurações > Conexões) - so' os
  // ONLINE entram no poll (quem esta' offline nao teria como estar ouvindo nada mesmo, e' inutil
  // gastar chamada com eles). PRECISA vir antes do "if (!serverId) return null" abaixo - hook
  // chamado depois de um return condicional quebra a ordem dos hooks entre renders (na primeira
  // renderizacao, antes dos servidores carregarem, serverId ainda e' null) e derruba o React
  // inteiro (tela em branco, sem erro nenhum visivel pro usuario - so' no console/DevTools:
  // "Rendered fewer hooks than expected"). Reportado: "abro no desktop ou web, nada aparece".
  const nowPlayingByUser = useSpotifyNowPlaying(online.map((m) => m.userId));

  if (!serverId) return null;

  const canManage = myServerPermissions.has("MANAGE_MEMBERS");

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
          {showPotatoBanner && <PotatoMafiaBanner />}
          {online.length > 0 && (
            <>
              <p className="channel-group-title member-list-group">ONLINE — {online.length}</p>
              {online.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  serverId={serverId}
                  canManage={canManage}
                  nowPlaying={nowPlayingByUser[m.userId]}
                />
              ))}
            </>
          )}
          {offline.length > 0 && (
            <>
              <p className="channel-group-title member-list-group">OFFLINE — {offline.length}</p>
              {offline.map((m) => (
                <MemberRow key={m.userId} member={m} serverId={serverId} canManage={canManage} />
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

/**
 * `serverId`/`canManage` sao opcionais - so' passados por MemberList (onde faz sentido
 * gerenciar). Em outros lugares que reaproveitam esse componente (ex: VoiceChannel.jsx,
 * "Membros com acesso a esse canal") o clique direito simplesmente nao faz nada.
 */
export function MemberRow({ member, serverId, canManage, nowPlaying }) {
  const { openProfile } = useProfile();
  const { showAlert } = useAlert();
  const [menu, setMenu] = useState(null); // { x, y }
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(member.nickname || "");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removed, setRemoved] = useState(false); // otimista - some da lista sem esperar recarregar tudo
  const [nicknameOverride, setNicknameOverride] = useState(undefined); // otimista - ver handleSaveNickname
  const menuRef = useRef(null);
  const displayNickname = nicknameOverride !== undefined ? nicknameOverride : member.nickname;

  useEffect(() => {
    if (!menu) return;
    function handlePointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu]);

  async function handleSaveNickname() {
    setNicknameSaving(true);
    setNicknameError("");
    try {
      await api.put(`/api/servers/${serverId}/members/${member.userId}/nickname`, { nickname: nicknameDraft.trim() });
      setNicknameOverride(nicknameDraft.trim() || null); // ajuste otimista - a lista de verdade so' atualiza no proximo fetch
      setEditingNickname(false);
    } catch (err) {
      setNicknameError(err.response?.data?.error || "Não foi possível salvar o apelido");
    } finally {
      setNicknameSaving(false);
    }
  }

  async function handleRemove() {
    try {
      await api.delete(`/api/servers/${serverId}/members/${member.userId}`);
      setRemoved(true);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível remover esse membro");
    }
  }

  if (removed) return null;

  return (
    <>
      <button
        type="button"
        className={"member-row" + (member.status === "OFFLINE" ? " offline" : "")}
        onClick={() => openProfile(member.userId)}
        onContextMenu={(e) => {
          if (!canManage || !serverId) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={
          canManage ? `Ver perfil de ${member.username} (botão direito pra gerenciar)` : `Ver perfil de ${member.username}`
        }
      >
        <div className="member-avatar-wrap">
          <Avatar name={member.username} url={member.avatarUrl} className="voice-avatar small" />
          <span className={"status-dot " + STATUS_DOT_CLASS[member.status]} title={STATUS_LABEL[member.status]} />
        </div>
        <span className="member-row-info">
          <span className="member-row-name-line">
            {/* Apelido DESSE servidor (ver Configurações > Perfil) tem prioridade sobre o
                username - mesma logica do Discord: e' local aquele servidor, so' quem esta
                nele ve. */}
            <span className="member-row-name">{displayNickname || member.username}</span>
            {member.role === "ADMIN" && <span className="admin-badge">ADMIN</span>}
          </span>
          {/* "Ouvindo Spotify" (ver useSpotifyNowPlaying/Configurações > Conexões) - so' aparece
              se essa pessoa CONECTOU a conta E esta' tocando algo agora mesmo. */}
          {nowPlaying && (
            <span className="member-row-spotify" title={`Ouvindo ${nowPlaying.trackName} — ${nowPlaying.artistNames}`}>
              <MusicNoteIcon size={11} />
              {nowPlaying.trackName} — {nowPlaying.artistNames}
            </span>
          )}
        </span>
      </button>

      {menu && (
        <div
          className="volume-popover"
          ref={menuRef}
          style={{ left: Math.min(menu.x, window.innerWidth - 232), top: Math.min(menu.y, window.innerHeight - 100) }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="volume-popover-title">{displayNickname || member.username}</p>
          <div className="participant-mod-actions" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <button
              type="button"
              className="participant-mod-btn"
              onClick={() => {
                setMenu(null);
                setEditingNickname(true);
              }}
            >
              <PencilIcon size={14} /> Editar apelido aqui
            </button>
            <button
              type="button"
              className="participant-mod-btn danger"
              onClick={() => {
                setMenu(null);
                setConfirmRemove(true);
              }}
            >
              <TrashIcon size={14} /> Remover do servidor
            </button>
          </div>
        </div>
      )}

      {editingNickname && (
        <div className="modal-backdrop" onClick={() => setEditingNickname(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Apelido de {member.username} nesse servidor</h2>
            <div className="settings-field">
              <input
                autoFocus
                value={nicknameDraft}
                onChange={(e) => setNicknameDraft(e.target.value)}
                maxLength={32}
                placeholder={member.username}
              />
              <p className="admin-hint" style={{ margin: 0 }}>
                Em branco = volta a mostrar o apelido global/username dessa pessoa.
              </p>
            </div>
            {nicknameError && <p className="auth-error">{nicknameError}</p>}
            <div className="settings-actions">
              <button type="button" className="link-btn" onClick={() => setEditingNickname(false)} disabled={nicknameSaving}>
                Cancelar
              </button>
              <button type="button" onClick={handleSaveNickname} disabled={nicknameSaving}>
                {nicknameSaving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRemove && (
        <ConfirmModal
          title="Remover do servidor"
          message={`Tem certeza que quer remover ${member.username} desse servidor? A conta continua existindo, só perde o acesso a esse servidor.`}
          confirmLabel="Remover"
          danger
          onClose={() => setConfirmRemove(false)}
          onConfirm={handleRemove}
        />
      )}
    </>
  );
}
