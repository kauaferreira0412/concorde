import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import api from "../api/client";
import { subscribeToVoicePresence } from "../ws/chatSocket";
import { useUnreadMessages } from "../utils/useUnreadMessages";
import { useServerMembers } from "../utils/useServerMembers";
import {
  CameraIcon,
  CameraOffIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  HashIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  LogOutIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldIcon,
  VolumeIcon,
} from "./icons.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import VolumeSlider from "./VolumeSlider.jsx";

const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", INVISIBLE: "offline" };
const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", INVISIBLE: "Invisível" };

export default function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  onSelectChannel,
  onCreateChannel,
  onOpenSettings,
  stompClient,
  stompConnected,
  user,
  onLogout,
}) {
  const { isAdmin } = useAuth();
  const { openProfile } = useProfile();
  const {
    activeChannel,
    micEnabled,
    micLevel,
    deafened,
    screenSharing,
    cameraEnabled,
    speakingIds,
    participants,
    participantVolumes,
    setParticipantVolume,
    toggleMic,
    toggleDeafen,
    toggleScreenShare,
    toggleCamera,
    leaveChannel,
  } = useVoiceCall();
  const textChannels = channels.filter((c) => c.type === "TEXT");
  const voiceChannels = channels.filter((c) => c.type === "VOICE");
  const members = useServerMembers(server?.id, stompClient, stompConnected);
  const onlineCount = members.filter((m) => m.status !== "OFFLINE").length;
  const { unreadCounts } = useUnreadMessages(
    textChannels,
    selectedChannelId,
    stompClient,
    stompConnected,
    user?.username,
    (channelId) => {
      const target = textChannels.find((c) => c.id === channelId);
      if (target) onSelectChannel(target);
    }
  );
  const [connectedExpanded, setConnectedExpanded] = useState(true);
  const [textExpanded, setTextExpanded] = useState(true);
  const [voiceExpanded, setVoiceExpanded] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // Popover de volume individual - abre no botao direito em cima do avatar de alguem na
  // lista de "quem esta na call", aninhada sob o canal de voz (so' faz sentido pra quem
  // esta na MESMA call que voce, ja que e' o LiveKit que sabe controlar esse volume).
  const [volumeMenu, setVolumeMenu] = useState(null); // { identity, x, y }
  const volumeMenuRef = useRef(null);

  useEffect(() => {
    if (!volumeMenu) return;
    function handlePointerDown(e) {
      if (volumeMenuRef.current && !volumeMenuRef.current.contains(e.target)) setVolumeMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setVolumeMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [volumeMenu]);

  // Fecha sozinho se a pessoa sair da call enquanto o popover estava aberto.
  useEffect(() => {
    if (volumeMenu && !participants.some((p) => p.identity === volumeMenu.identity)) setVolumeMenu(null);
  }, [participants, volumeMenu]);
  // Painel inteiro (canais, call, icones) pode recolher pra dar mais espaco pro chat -
  // fica lembrado entre sessoes.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("channelSidebarCollapsed") === "true");

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("channelSidebarCollapsed", String(next));
      return next;
    });
  }

  async function handleConfirmLogout() {
    if (activeChannel) await leaveChannel();
    onLogout();
  }

  // "Quem esta conectado" e' visivel pra qualquer membro do servidor, mesmo sem ter
  // entrado na call - diferente do indicador de "quem esta falando", que so aparece
  // dentro da propria call (ver VoiceChannel.jsx).
  const [presenceByChannel, setPresenceByChannel] = useState({});

  useEffect(() => {
    if (voiceChannels.length === 0) return;
    let cancelled = false;

    voiceChannels.forEach((c) => {
      api.get(`/api/channels/${c.id}/voice-presence`).then(({ data }) => {
        if (!cancelled) setPresenceByChannel((prev) => ({ ...prev, [c.id]: data }));
      });
    });

    const subs = [];
    if (stompClient && stompConnected) {
      voiceChannels.forEach((c) => {
        subs.push(
          subscribeToVoicePresence(stompClient, c.id, (list) => {
            setPresenceByChannel((prev) => ({ ...prev, [c.id]: list }));
          })
        );
      });
    }

    return () => {
      cancelled = true;
      subs.forEach((s) => s.unsubscribe());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id, stompClient, stompConnected, voiceChannels.map((c) => c.id).join(",")]);

  const connectedList = voiceChannels.flatMap((c) => (presenceByChannel[c.id] || []).map((p) => ({ ...p, channelName: c.name })));

  return (
    <div className={"channel-sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="channel-sidebar-header">
        {!collapsed && (
          <div className="channel-sidebar-title">
            <strong>{server?.name || "Selecione um servidor"}</strong>
            {server && (
              <span className="channel-sidebar-subtitle">
                {members.length} membro{members.length === 1 ? "" : "s"} · {onlineCount} online
              </span>
            )}
          </div>
        )}
        <button
          className="icon-btn collapse-toggle"
          onClick={toggleCollapsed}
          title={collapsed ? "Abrir menu de canais" : "Fechar menu de canais"}
        >
          {collapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
        </button>
      </div>

      <div className="channel-sidebar-body">
      {server && connectedList.length > 0 && (
        <div className="connected-block">
          <button className="connected-block-header" onClick={() => setConnectedExpanded((v) => !v)}>
            <span className={"connected-chevron" + (connectedExpanded ? " open" : "")}>▸</span>
            <span className="channel-group-title">CONECTADOS AGORA</span>
            <span className="connected-count">{connectedList.length}</span>
          </button>
          {connectedExpanded && (
            <div className="connected-list">
              {connectedList.map((p) => (
                <div key={p.userId} className="connected-user">
                  <Avatar name={p.username} url={p.avatarUrl} className="voice-avatar small" />
                  <span className="connected-user-name">{p.username}</span>
                  <span className="connected-user-channel">
                    <VolumeIcon size={13} /> {p.channelName}
                  </span>
                  {p.deafened ? (
                    <HeadphonesOffIcon size={13} className="voice-status-icon" />
                  ) : (
                    !p.micEnabled && <MicOffIcon size={13} className="voice-status-icon danger" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="channel-list">
        {!server ? (
          <p className="channel-group-title">
            {isAdmin
              ? "Crie ou selecione um servidor na barra à esquerda para ver os canais."
              : "Nenhum servidor liberado para você ainda. Peça acesso ao administrador."}
          </p>
        ) : (
          <>
            <button className="channel-category-header" onClick={() => setTextExpanded((v) => !v)}>
              <span className={"connected-chevron" + (textExpanded ? " open" : "")}>▸</span>
              <span className="channel-group-title">CANAIS DE TEXTO</span>
            </button>
            {textExpanded && (
              <>
                {textChannels.map((c) => (
                  <button
                    key={c.id}
                    className={"channel-item" + (c.id === selectedChannelId ? " active" : "")}
                    onClick={() => onSelectChannel(c)}
                  >
                    <HashIcon size={16} className="channel-item-icon" />
                    {c.name}
                    {unreadCounts[c.id] > 0 && (
                      <span className="channel-unread-badge">{unreadCounts[c.id] > 99 ? "99+" : unreadCounts[c.id]}</span>
                    )}
                  </button>
                ))}
                <button className="channel-item add" onClick={() => onCreateChannel("TEXT")}>
                  + canal de texto
                </button>
              </>
            )}

            <button className="channel-category-header" onClick={() => setVoiceExpanded((v) => !v)}>
              <span className={"connected-chevron" + (voiceExpanded ? " open" : "")}>▸</span>
              <span className="channel-group-title">CANAIS DE VOZ</span>
            </button>
            {voiceExpanded && (
              <>
                {voiceChannels.map((c) => (
                  <div key={c.id}>
                    <button
                      className={
                        "channel-item" +
                        (c.id === selectedChannelId ? " active" : "") +
                        (activeChannel?.id === c.id ? " connected-active" : "")
                      }
                      onClick={() => onSelectChannel(c)}
                    >
                      <VolumeIcon size={16} className="channel-item-icon" />
                      {c.name}
                      {activeChannel?.id === c.id && <span className="channel-item-live">CONECTADO</span>}
                    </button>
                    {(presenceByChannel[c.id] || []).length > 0 && (
                      <div className="channel-voice-participants">
                        {presenceByChannel[c.id].map((p) => {
                          const identity = `user-${p.userId}`;
                          // Volume so' da pra ajustar de dentro da MESMA call (e' o LiveKit
                          // que controla isso) e nunca pra voce mesmo.
                          const canAdjustVolume = activeChannel?.id === c.id && p.userId !== user?.id;
                          return (
                            <div
                              key={p.userId}
                              className="channel-voice-participant"
                              onContextMenu={(e) => {
                                if (!canAdjustVolume) return;
                                e.preventDefault();
                                setVolumeMenu({ identity, x: e.clientX, y: e.clientY });
                              }}
                              title={canAdjustVolume ? "Clique com o botão direito pra ajustar o volume" : undefined}
                            >
                              <Avatar
                                name={p.username}
                                url={p.avatarUrl}
                                // O anel so' acende pra quem esta REALMENTE falando agora - so' da pra
                                // saber disso de dentro da call (ver speakingIds no VoiceCallContext),
                                // entao so' aparece no canal em que voce mesmo esta conectado.
                                className={"voice-avatar small" + (speakingIds.has(identity) ? " speaking" : "")}
                              />
                              <span>{p.username}</span>
                              {p.deafened ? (
                                <HeadphonesOffIcon size={12} className="voice-status-icon" />
                              ) : (
                                !p.micEnabled && <MicOffIcon size={12} className="voice-status-icon danger" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <button className="channel-item add" onClick={() => onCreateChannel("VOICE")}>
                  + canal de voz
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* Barra de status de voz - so aparece quando conectado, fica presente mesmo
          navegando por outros canais (a call continua ativa em segundo plano). */}
      {activeChannel && (
        <div className="voice-status-bar">
          <div className="voice-status-top">
            <span className="voice-status-dot" />
            <span className="voice-status-text">
              <span className="voice-status-label">Voz conectada</span>
              <span className="voice-status-channel" title={`Conectado a #${activeChannel.name}`}>
                {activeChannel.name} · {micEnabled ? `${micLevel}%` : "mutado"}
              </span>
            </span>
          </div>
          <div className="voice-status-icons">
            <button
              className={"icon-btn" + (!micEnabled ? " icon-btn-danger" : "")}
              onClick={toggleMic}
              title={micEnabled ? "Mutar microfone" : "Desmutar microfone"}
            >
              {micEnabled ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button
              className={"icon-btn" + (deafened ? " icon-btn-danger" : "")}
              onClick={toggleDeafen}
              title={deafened ? "Reativar áudio" : "Ensurdecer (não ouvir ninguém)"}
            >
              {deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
            </button>
            <button
              className={"icon-btn" + (cameraEnabled ? " icon-btn-active" : "")}
              onClick={toggleCamera}
              title={cameraEnabled ? "Desligar câmera" : "Ligar câmera"}
            >
              {cameraEnabled ? <CameraIcon /> : <CameraOffIcon />}
            </button>
            <button
              className={"icon-btn" + (screenSharing ? " icon-btn-active" : "")}
              onClick={toggleScreenShare}
              title={
                screenSharing
                  ? "Parar compartilhamento"
                  : "Compartilhar tela - escolha uma ABA pra ter áudio limpo (Janela/Tela Inteira ficam sem áudio, pra evitar eco)"
              }
            >
              <ScreenShareIcon />
            </button>
            <button className="icon-btn icon-btn-leave" onClick={leaveChannel} title="Sair da call">
              <PhoneOffIcon />
            </button>
          </div>
        </div>
      )}

      <div className="user-bar">
        <button type="button" className="user-bar-info" onClick={() => openProfile(user?.id)} title="Ver/editar seu perfil">
          <div className="member-avatar-wrap">
            <Avatar name={user?.username} url={user?.avatarUrl} className="user-bar-avatar" />
            <span
              className={"status-dot " + (STATUS_DOT_CLASS[user?.status] || "online")}
              title={`Seu status: ${STATUS_LABEL[user?.status] || "Online"} (mude em Configurações)`}
            />
          </div>
          <span className="user-bar-text">
            <span className="user-bar-name">{user?.nickname || user?.username}</span>
            {isAdmin && <span className="user-bar-role">Administrador</span>}
          </span>
        </button>
        <div className="user-bar-actions">
          {isAdmin && (
            <Link to="/admin" className="icon-btn" title="Painel do administrador">
              <ShieldIcon />
            </Link>
          )}
          <button className="icon-btn" onClick={onOpenSettings} title="Configurações de áudio">
            <SettingsIcon />
          </button>
          <button className="icon-btn icon-btn-danger" onClick={() => setShowLogoutConfirm(true)} title="Sair da conta">
            <LogOutIcon />
          </button>
        </div>
      </div>
      </div>

      {volumeMenu &&
        (() => {
          const p = participants.find((pp) => pp.identity === volumeMenu.identity);
          if (!p) return null;
          return (
            <div
              className="volume-popover"
              ref={volumeMenuRef}
              style={{
                left: Math.min(volumeMenu.x, window.innerWidth - 232),
                top: Math.min(volumeMenu.y, window.innerHeight - 70),
              }}
            >
              <p className="volume-popover-title">Volume de {p.name}</p>
              <VolumeSlider
                value={participantVolumes[p.identity] ?? 100}
                onChange={(v) => setParticipantVolume(p.identity, v)}
                label={`Volume de ${p.name} (padrão 100%, pode passar de 100%)`}
              />
            </div>
          );
        })()}

      {showLogoutConfirm && (
        <ConfirmModal
          title="Sair da conta"
          message={
            activeChannel
              ? "Você está numa call de voz agora - sair da conta também vai te desconectar dela. Tem certeza?"
              : "Tem certeza que quer sair da sua conta?"
          }
          confirmLabel="Sair"
          danger
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={handleConfirmLogout}
        />
      )}
    </div>
  );
}
