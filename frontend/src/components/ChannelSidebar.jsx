import { useEffect, useRef, useState } from "react";
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
  HangUpIcon,
  HashIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  LogOutIcon,
  MegaphoneIcon,
  MicIcon,
  MicOffIcon,
  PencilIcon,
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
  onEditServer,
  onOpenRoles,
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
    pingMs,
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
    moveParticipant,
    kickParticipant,
    forceMuteParticipant,
    forceDeafenParticipant,
  } = useVoiceCall();
  const textChannels = channels.filter((c) => c.type === "TEXT");
  const voiceChannels = channels.filter((c) => c.type === "VOICE");
  const members = useServerMembers(server?.id, stompClient, stompConnected);
  const onlineCount = members.filter((m) => m.status !== "OFFLINE").length;
  const { unreadCounts, mentionedChannels } = useUnreadMessages(
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
  // Popover em cima do avatar de alguem na lista de "quem esta na call" (aninhada sob o
  // canal de voz) - volume (so' se voce estiver na MESMA call, e' o LiveKit que controla
  // isso) e/ou moderacao (mover/mutar/ensurdecer/expulsar, funciona mesmo sem voce estar
  // na call, so' depende de permissao - ver ServerPermission no backend).
  const [participantMenu, setParticipantMenu] = useState(null); // { channelId, userId, identity, username, x, y }
  const participantMenuRef = useRef(null);
  const [myServerPermissions, setMyServerPermissions] = useState(new Set());
  const canMove = myServerPermissions.has("MOVE_MEMBERS");
  const hasAnyModPermission =
    canMove ||
    myServerPermissions.has("MUTE_MEMBERS") ||
    myServerPermissions.has("DEAFEN_MEMBERS") ||
    myServerPermissions.has("KICK_VOICE");
  // Arrastar alguem da lista de "quem esta na call" pra outro canal de voz (ver
  // draggable/onDrop abaixo) - so' existe enquanto o arraste esta rolando.
  const [draggingParticipant, setDraggingParticipant] = useState(null); // { channelId, userId }
  const [dragOverChannelId, setDragOverChannelId] = useState(null);

  useEffect(() => {
    if (!server?.id) {
      setMyServerPermissions(new Set());
      return;
    }
    let cancelled = false;
    api
      .get(`/api/servers/${server.id}/me/permissions`)
      .then(({ data }) => {
        if (!cancelled) setMyServerPermissions(new Set(data));
      })
      .catch(() => {
        if (!cancelled) setMyServerPermissions(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [server?.id]);

  useEffect(() => {
    if (!participantMenu) return;
    function handlePointerDown(e) {
      if (participantMenuRef.current && !participantMenuRef.current.contains(e.target)) setParticipantMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setParticipantMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [participantMenu]);

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

    function refetchAll() {
      voiceChannels.forEach((c) => {
        api.get(`/api/channels/${c.id}/voice-presence`).then(({ data }) => {
          if (!cancelled) setPresenceByChannel((prev) => ({ ...prev, [c.id]: data }));
        });
      });
    }
    refetchAll();

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

    // Reforco: de vez em quando (relatado pelo usuario, com prints) a lista de "quem esta
    // conectado" trava desatualizada pra um cliente especifico - o STOMP continua "conectado"
    // do ponto de vista dele (chat/audio da call continuam funcionando 100% normal, ele
    // escuta e fala com todo mundo), mas os broadcasts de presenca desse canal simplesmente
    // param de chegar (nunca detectamos um disconnect/reconnect de verdade pra disparar o
    // resubscribe acima). Sem um jeito confiavel de saber QUANDO isso acontece, a solucao e'
    // nao depender 100% do push: busca o snapshot de verdade via REST a cada 12s tambem,
    // sobrescrevendo qualquer coisa que tenha ficado presa - o pior caso agora e' ficar
    // desatualizado por alguns segundos, nunca mais "pra sempre ate' sair e entrar de novo".
    const interval = setInterval(refetchAll, 12000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      subs.forEach((s) => s.unsubscribe());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id, stompClient, stompConnected, voiceChannels.map((c) => c.id).join(",")]);

  const connectedList = voiceChannels.flatMap((c) => (presenceByChannel[c.id] || []).map((p) => ({ ...p, channelName: c.name })));

  // Fecha o popover sozinho se a pessoa sair da call enquanto ele estava aberto - moderacao
  // continua fazendo sentido mesmo sem ela estar mais lá (o backend so' ignora nesse caso),
  // entao so' fecha se ela sumiu das DUAS fontes (LiveKit e presenca).
  useEffect(() => {
    if (
      participantMenu &&
      !participants.some((p) => p.identity === participantMenu.identity) &&
      !(presenceByChannel[participantMenu.channelId] || []).some((p) => p.userId === participantMenu.userId)
    ) {
      setParticipantMenu(null);
    }
  }, [participants, participantMenu, presenceByChannel]);

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
        <div className="channel-sidebar-header-actions">
          {!collapsed && server && (isAdmin || myServerPermissions.has("MANAGE_ROLES")) && (
            <button className="icon-btn" onClick={() => onOpenRoles(server)} title="Perfis e permissões">
              <ShieldIcon size={15} />
            </button>
          )}
          {!collapsed && server && isAdmin && (
            <button className="icon-btn" onClick={() => onEditServer(server)} title="Editar servidor">
              <PencilIcon size={15} />
            </button>
          )}
          <button
            className="icon-btn collapse-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? "Abrir menu de canais" : "Fechar menu de canais"}
          >
            {collapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
          </button>
        </div>
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
                    {c.adminOnly ? (
                      <MegaphoneIcon size={16} className="channel-item-icon" />
                    ) : (
                      <HashIcon size={16} className="channel-item-icon" />
                    )}
                    {c.name}
                    {(mentionedChannels[c.id] || unreadCounts[c.id] > 0) && (
                      <span className="channel-item-badges">
                        {mentionedChannels[c.id] && (
                          <span className="channel-mention-badge" title="Você foi mencionado aqui">
                            @
                          </span>
                        )}
                        {unreadCounts[c.id] > 0 && (
                          <span className="channel-unread-badge">{unreadCounts[c.id] > 99 ? "99+" : unreadCounts[c.id]}</span>
                        )}
                      </span>
                    )}
                  </button>
                ))}
                {(isAdmin || myServerPermissions.has("MANAGE_CHANNELS")) && (
                  <button className="channel-item add" onClick={() => onCreateChannel("TEXT")}>
                    + canal de texto
                  </button>
                )}
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
                        (activeChannel?.id === c.id ? " connected-active" : "") +
                        (dragOverChannelId === c.id ? " drop-target" : "")
                      }
                      onClick={() => onSelectChannel(c)}
                      // Arrastar alguem da lista de "quem esta na call" (abaixo) e soltar aqui
                      // move essa pessoa pra este canal - so' aceita o drop se voce tiver
                      // permissao de mover gente (ver canMove/handleDropMove).
                      onDragOver={(e) => {
                        if (!canMove || !draggingParticipant || draggingParticipant.channelId === c.id) return;
                        e.preventDefault();
                        setDragOverChannelId(c.id);
                      }}
                      onDragLeave={() => setDragOverChannelId((prev) => (prev === c.id ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverChannelId(null);
                        if (!canMove || !draggingParticipant || draggingParticipant.channelId === c.id) return;
                        moveParticipant(draggingParticipant.channelId, draggingParticipant.userId, c.id);
                      }}
                    >
                      <VolumeIcon size={16} className="channel-item-icon" />
                      {c.name}
                      {activeChannel?.id === c.id && <span className="channel-item-live">CONECTADO</span>}
                    </button>
                    {(presenceByChannel[c.id] || []).length > 0 && (
                      <div className="channel-voice-participants">
                        {presenceByChannel[c.id].map((p) => {
                          // Bot de musica (userId sintetico NEGATIVO, ver VoicePresenceService.
                          // joinBot) publica no LiveKit com a identidade "musicbot-{channelId}",
                          // NAO "user-{id}" como todo mundo - sem esse caso especial, o slider de
                          // volume nunca encontrava o participante de verdade (canAdjustVolume
                          // sempre false) e o Melodion nao podia ser ajustado como os outros.
                          const identity = p.userId < 0 ? `musicbot-${c.id}` : `user-${p.userId}`;
                          const isMe = p.userId === user?.id;
                          // Volume so' da pra ajustar de dentro da MESMA call (e' o LiveKit
                          // que controla isso) e nunca pra voce mesmo. Moderacao funciona sem
                          // voce estar na call, so' precisa de permissao - nunca em voce mesmo.
                          const canAdjustVolume = activeChannel?.id === c.id && !isMe;
                          const canModerate = !isMe && hasAnyModPermission;
                          return (
                            <div
                              key={p.userId}
                              className="channel-voice-participant"
                              draggable={canMove && !isMe}
                              onDragStart={() => setDraggingParticipant({ channelId: c.id, userId: p.userId })}
                              onDragEnd={() => setDraggingParticipant(null)}
                              onContextMenu={(e) => {
                                if (!canAdjustVolume && !canModerate) return;
                                e.preventDefault();
                                // Busca o snapshot de verdade NA HORA que o menu abre - o
                                // broadcast em tempo real (STOMP) as vezes fica ate' 12s
                                // desatualizado pra um cliente especifico (ver poll de reforco
                                // logo acima, useEffect com refetchAll), o que fazia um segundo
                                // moderador achar que a pessoa NAO estava mutada (rotulo errado
                                // "Mutar" em vez de "Desmutar") e clicar em "Mutar" de novo em
                                // vez de liberar - reportado como "outro moderador nao consegue
                                // desmutar". Um GET direto aqui elimina essa espera.
                                api.get(`/api/channels/${c.id}/voice-presence`).then(({ data }) => {
                                  setPresenceByChannel((prev) => ({ ...prev, [c.id]: data }));
                                });
                                // So' guarda a "localizacao" (quem/onde/posicao do clique) - NAO guarda
                                // forceMuted/forceDeafened aqui: isso e' lido AO VIVO de
                                // presenceByChannel na hora de renderizar (ver mais abaixo), senao
                                // o menu ficava com o rotulo "Mutar"/"Desmutar" desatualizado assim
                                // que o estado mudava (inclusive pela sua propria acao no menu).
                                setParticipantMenu({
                                  channelId: c.id,
                                  userId: p.userId,
                                  identity,
                                  username: p.username,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }}
                              title={
                                canAdjustVolume || canModerate
                                  ? "Clique com o botão direito pra ver as opções"
                                  : canMove && !isMe
                                  ? "Arraste pra outro canal de voz pra mover"
                                  : undefined
                              }
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
                {(isAdmin || myServerPermissions.has("MANAGE_CHANNELS")) && (
                  <button className="channel-item add" onClick={() => onCreateChannel("VOICE")}>
                    + canal de voz
                  </button>
                )}
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
                {activeChannel.name} ·{" "}
                <span className={"voice-status-level" + (micEnabled ? "" : " muted")}>
                  {micEnabled ? `${micLevel}%` : "mutado"}
                </span>
              </span>
            </span>
            {pingMs != null && <span className="voice-status-ping">{pingMs} ms</span>}
          </div>
          <div className="voice-status-icons">
            <button
              className={"voice-status-icon-btn" + (!micEnabled ? " danger" : "")}
              onClick={toggleMic}
              title={micEnabled ? "Mutar microfone" : "Desmutar microfone"}
            >
              {micEnabled ? <MicIcon /> : <MicOffIcon />}
            </button>
            <button
              className={"voice-status-icon-btn" + (deafened ? " danger" : "")}
              onClick={toggleDeafen}
              title={deafened ? "Reativar áudio" : "Ensurdecer (não ouvir ninguém)"}
            >
              {deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
            </button>
            <button
              className={"voice-status-icon-btn" + (cameraEnabled ? " active" : "")}
              onClick={toggleCamera}
              title={cameraEnabled ? "Desligar câmera" : "Ligar câmera"}
            >
              {cameraEnabled ? <CameraIcon /> : <CameraOffIcon />}
            </button>
            <button
              className={"voice-status-icon-btn accent" + (screenSharing ? " active" : "")}
              onClick={toggleScreenShare}
              title={
                screenSharing
                  ? "Parar compartilhamento"
                  : "Compartilhar tela - escolha uma ABA pra ter áudio limpo (Janela/Tela Inteira ficam sem áudio, pra evitar eco)"
              }
            >
              <ScreenShareIcon />
            </button>
            <button className="voice-status-icon-btn leave" onClick={leaveChannel} title="Sair da call">
              <HangUpIcon />
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
          {/* Painel do admin agora mora dentro de Configuracoes (aba "Administração", ver
              SettingsModal.jsx) - nao precisa mais desse atalho separado aqui. */}
          <button className="icon-btn" onClick={onOpenSettings} title="Configurações de áudio">
            <SettingsIcon />
          </button>
          <button className="icon-btn icon-btn-danger" onClick={() => setShowLogoutConfirm(true)} title="Sair da conta">
            <LogOutIcon />
          </button>
        </div>
      </div>
      </div>

      {participantMenu &&
        (() => {
          const p = participants.find((pp) => pp.identity === participantMenu.identity);
          const canAdjustVolume = !!p && activeChannel?.id === participantMenu.channelId;
          const otherVoiceChannels = voiceChannels.filter((vc) => vc.id !== participantMenu.channelId);
          // Lido AO VIVO de presenceByChannel (a MESMA fonte que alimenta o icone de mudo na
          // lista) - nunca de um snapshot antigo, senao o rotulo "Mutar"/"Desmutar" ficava
          // preso no que era verdade quando o menu abriu, nao no que e' verdade agora.
          const presenceEntry = (presenceByChannel[participantMenu.channelId] || []).find(
            (pp) => pp.userId === participantMenu.userId
          );
          const isForceMuted = presenceEntry?.forceMuted || false;
          const isForceDeafened = presenceEntry?.forceDeafened || false;
          // Bot de musica usa sempre um userId sintetico NEGATIVO nesse canal (ver
          // VoicePresenceService.joinBot) - nunca colide com um usuario de verdade (id sempre
          // positivo, gerado pelo banco). Ele nao ouve nada (ver music-bot/index.js,
          // canSubscribe:false), entao "ensurdecer" ele nao faz sentido nenhum - some com essa
          // opcao so' pra ele.
          const isBot = participantMenu.userId < 0;
          if (!canAdjustVolume && !hasAnyModPermission) return null;
          return (
            <div
              className="volume-popover"
              ref={participantMenuRef}
              style={{
                left: Math.min(participantMenu.x, window.innerWidth - 232),
                top: Math.min(participantMenu.y, window.innerHeight - 70),
              }}
            >
              <p className="volume-popover-title">{p?.name || participantMenu.username}</p>

              {canAdjustVolume && (
                <VolumeSlider
                  value={participantVolumes[p.identity] ?? 100}
                  onChange={(v) => setParticipantVolume(p.identity, v)}
                  label={`Volume de ${p.name} (padrão 100%, pode passar de 100%)`}
                />
              )}

              {hasAnyModPermission && (
                <div className="participant-mod-actions">
                  {myServerPermissions.has("MUTE_MEMBERS") && (
                    <button
                      type="button"
                      className="participant-mod-btn"
                      onClick={() => {
                        forceMuteParticipant(participantMenu.channelId, participantMenu.userId, !isForceMuted);
                        setParticipantMenu(null);
                      }}
                    >
                      {isForceMuted ? <MicIcon size={14} /> : <MicOffIcon size={14} />}
                      {isForceMuted ? "Desmutar" : "Mutar"}
                    </button>
                  )}
                  {myServerPermissions.has("DEAFEN_MEMBERS") && !isBot && (
                    <button
                      type="button"
                      className="participant-mod-btn"
                      onClick={() => {
                        forceDeafenParticipant(participantMenu.channelId, participantMenu.userId, !isForceDeafened);
                        setParticipantMenu(null);
                      }}
                    >
                      {isForceDeafened ? <HeadphonesIcon size={14} /> : <HeadphonesOffIcon size={14} />}
                      {isForceDeafened ? "Reativar áudio" : "Ensurdecer"}
                    </button>
                  )}
                  {canMove && otherVoiceChannels.length > 0 && (
                    <>
                      <p className="participant-mod-submenu-label">Mover para</p>
                      {otherVoiceChannels.map((vc) => (
                        <button
                          type="button"
                          key={vc.id}
                          className="participant-mod-btn"
                          onClick={() => {
                            moveParticipant(participantMenu.channelId, participantMenu.userId, vc.id);
                            setParticipantMenu(null);
                          }}
                        >
                          <VolumeIcon size={14} /> {vc.name}
                        </button>
                      ))}
                    </>
                  )}
                  {myServerPermissions.has("KICK_VOICE") && (
                    <button
                      type="button"
                      className="participant-mod-btn danger"
                      onClick={() => {
                        kickParticipant(participantMenu.channelId, participantMenu.userId);
                        setParticipantMenu(null);
                      }}
                    >
                      <PhoneOffIcon size={14} /> Expulsar da call
                    </button>
                  )}
                </div>
              )}
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
