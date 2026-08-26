import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import api from "../api/client";
import { subscribeToVoicePresence } from "../ws/chatSocket";
import { useUnreadMessages } from "../utils/useUnreadMessages";
import { useServerMembers } from "../utils/useServerMembers";
import {
  CameraIcon,
  CameraOffIcon,
  ChevronDownIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FolderIcon,
  HangUpIcon,
  HashIcon,
  HeadphonesIcon,
  HeadphonesOffIcon,
  ListIcon,
  LogOutIcon,
  MegaphoneIcon,
  MicIcon,
  MicOffIcon,
  PencilIcon,
  PhoneOffIcon,
  PlusIcon,
  ScreenShareIcon,
  SettingsIcon,
  ShieldIcon,
  SmileIcon,
  TrashIcon,
  VolumeIcon,
} from "./icons.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import VolumeSlider from "./VolumeSlider.jsx";
import CategoryModal from "./CategoryModal.jsx";

const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", INVISIBLE: "offline" };
const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", INVISIBLE: "Invisível" };

export default function ChannelSidebar({
  server,
  channels,
  selectedChannelId,
  onSelectChannel,
  onCreateChannel,
  onDeleteChannel,
  onOpenSettings,
  onEditServer,
  onOpenRoles,
  onOpenAuditLog,
  onOpenEmojis,
  onMoveChannelCategory,
  onCategoryDeleted,
  stompClient,
  stompConnected,
  user,
  onLogout,
}) {
  const { isAdmin } = useAuth();
  const { openProfile } = useProfile();
  const { showAlert } = useAlert();
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
    },
    server?.name
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
  // Menu de botao direito num CANAL (texto ou voz) - so' tem uma opcao (excluir), oferecida
  // pra quem tem MANAGE_CHANNELS (ver canManageChannels acima). Segue o mesmo padrao do
  // participantMenu (fecha ao clicar fora/Esc), so' que mais simples.
  const [channelMenu, setChannelMenu] = useState(null); // { id, name, x, y }
  const channelMenuRef = useRef(null);
  const [deletingChannel, setDeletingChannel] = useState(null); // canal com o ConfirmModal aberto
  const [myServerPermissions, setMyServerPermissions] = useState(new Set());
  // Categorias (pastas de canal, ver ChannelCategory no backend) - carregadas e geridas aqui
  // mesmo (mesmo padrao de myServerPermissions acima), sem passar pelo Container.jsx.
  const [categories, setCategories] = useState([]);
  const [collapsedCategories, setCollapsedCategories] = useState(new Set());
  const [categoryMenu, setCategoryMenu] = useState(null); // { id, name, x, y }
  const categoryMenuRef = useRef(null);
  // Menu de "Configuracoes do servidor" (clique no nome do servidor, ver hasAnyServerSettings
  // acima) - junta editar servidor/emojis/perfis/log de auditoria num so' lugar, em vez de um
  // botao pra cada um la' no cabecalho (ficava apertado demais, espremia o nome do servidor).
  const [serverMenu, setServerMenu] = useState(null); // { x, y } | null
  const serverMenuRef = useRef(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); // { id, name } | null
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [movingChannel, setMovingChannel] = useState(false); // abre o submenu "Mover para categoria" no channelMenu
  // Criar/apagar canal (ver "+ canal de texto/voz" mais abaixo e o menu de botao direito em
  // cada canal) - mesma permissao MANAGE_CHANNELS pros dois, pode ser concedida pra qualquer
  // membro via Perfis (ver ServerRolesModal.jsx), nao e' so' o admin/dono.
  const canManageChannels = isAdmin || myServerPermissions.has("MANAGE_CHANNELS");
  const canMove = myServerPermissions.has("MOVE_MEMBERS");
  const hasAnyModPermission =
    canMove ||
    myServerPermissions.has("MUTE_MEMBERS") ||
    myServerPermissions.has("DEAFEN_MEMBERS") ||
    myServerPermissions.has("KICK_VOICE");
  // Controla se o nome do servidor vira um botao clicavel (abre o menu de Configuracoes do
  // servidor, ver serverMenu abaixo) - pra quem nao tem NENHUMA dessas, o nome fica so' texto.
  const hasAnyServerSettings =
    isAdmin ||
    myServerPermissions.has("MANAGE_SERVER") ||
    myServerPermissions.has("MANAGE_ROLES") ||
    myServerPermissions.has("VIEW_AUDIT_LOG");
  // Arrastar alguem da lista de "quem esta na call" pra outro canal de voz (ver
  // draggable/onDrop abaixo) - so' existe enquanto o arraste esta rolando.
  const [draggingParticipant, setDraggingParticipant] = useState(null); // { channelId, userId }
  const [dragOverChannelId, setDragOverChannelId] = useState(null);
  // Arrastar um canal de TEXTO pra dentro de uma categoria (pedido explicito do usuario) -
  // draggingChannelId e' o canal sendo arrastado, dragOverCategoryId e' o cabecalho de
  // categoria com o mouse em cima agora (so' pra destacar visualmente onde vai cair).
  const [draggingChannelId, setDraggingChannelId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);

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
    if (!server?.id) {
      setCategories([]);
      return;
    }
    let cancelled = false;
    api
      .get(`/api/servers/${server.id}/categories`)
      .then(({ data }) => {
        if (!cancelled) setCategories(data);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [server?.id]);

  useEffect(() => {
    if (!categoryMenu) return;
    function handlePointerDown(e) {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target)) setCategoryMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setCategoryMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [categoryMenu]);

  useEffect(() => {
    if (!serverMenu) return;
    function handlePointerDown(e) {
      if (serverMenuRef.current && !serverMenuRef.current.contains(e.target)) setServerMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setServerMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [serverMenu]);

  function toggleCategoryCollapsed(categoryId) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  async function handleSaveCategory(name) {
    if (editingCategory) {
      const { data } = await api.put(`/api/servers/${server.id}/categories/${editingCategory.id}`, { name });
      setCategories((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      setEditingCategory(null);
    } else {
      const { data } = await api.post(`/api/servers/${server.id}/categories`, { name });
      setCategories((prev) => [...prev, data]);
      setCreatingCategory(false);
    }
  }

  async function handleConfirmDeleteCategory(category) {
    try {
      await api.delete(`/api/servers/${server.id}/categories/${category.id}`);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      // O backend so' solta os canais dessa categoria (categoryId vira null), nunca apaga eles -
      // mas o "channels" de fora (pages/servers/Container.jsx) continuava com o categoryId
      // velho ate' um F5, entao esses canais sumiam da tela sozinhos (reportado pelo usuario
      // como "os chats foram deletados junto"). Espelha aqui o que ja' aconteceu de verdade.
      onCategoryDeleted?.(category.id);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível excluir essa categoria");
    }
  }

  /** Agrupa uma lista de canais (so' texto OU so' voz) por categoria - "sem categoria" vem
   *  primeiro (e so' aparece se tiver algum canal ali, pra nao mudar nada visualmente nos
   *  servidores que ainda nao usam categoria nenhuma), o resto na ordem das categorias.
   *  As categorias aparecem nas DUAS secoes (texto e voz), entao uma categoria vazia numa
   *  das secoes (ex: acabou de ser criada, sem nenhum canal ainda) mostraria o cabecalho
   *  duas vezes na tela - com hideEmpty, essa secao pula as que estao vazias (a outra secao
   *  continua mostrando, garantindo que sempre tenha pelo menos um lugar pra gerenciar/soltar
   *  um canal nela). */
  function groupByCategory(list, { hideEmpty = false } = {}) {
    const byCategory = new Map();
    const uncategorized = [];
    list.forEach((c) => {
      if (c.categoryId == null) {
        uncategorized.push(c);
      } else {
        if (!byCategory.has(c.categoryId)) byCategory.set(c.categoryId, []);
        byCategory.get(c.categoryId).push(c);
      }
    });
    const groups = [];
    if (uncategorized.length > 0) {
      groups.push({ category: null, channels: uncategorized.sort((a, b) => a.position - b.position) });
    }
    categories.forEach((cat) => {
      const channels = (byCategory.get(cat.id) || []).sort((a, b) => a.position - b.position);
      if (hideEmpty && channels.length === 0) return;
      groups.push({ category: cat, channels });
    });
    return groups;
  }

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

  useEffect(() => {
    setMovingChannel(false);
    if (!channelMenu) return;
    function handlePointerDown(e) {
      if (channelMenuRef.current && !channelMenuRef.current.contains(e.target)) setChannelMenu(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setChannelMenu(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [channelMenu]);

  // ConfirmModal fecha sozinho assim que onConfirm() e' chamado (nao espera ele terminar, ver
  // ConfirmModal.jsx) - por isso o erro, se der, aparece num alerta em vez de dentro do modal
  // (que ja' nao esta mais na tela quando o "await" resolve).
  async function handleConfirmDeleteChannel(channel) {
    try {
      await onDeleteChannel(channel.id);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível excluir esse canal");
    }
  }

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

  /** Um botao de canal de TEXTO - extraido pra funcao pra poder ser chamado tanto solto
   *  (canais sem categoria) quanto dentro de um grupo de categoria, sem duplicar o JSX. */
  function renderTextChannel(c) {
    return (
      <button
        key={c.id}
        className={"channel-item" + (c.id === selectedChannelId ? " active" : "") + (draggingChannelId === c.id ? " dragging" : "")}
        onClick={() => onSelectChannel(c)}
        onContextMenu={(e) => {
          if (!canManageChannels) return;
          e.preventDefault();
          setChannelMenu({ id: c.id, name: c.name, x: e.clientX, y: e.clientY });
        }}
        draggable={canManageChannels}
        onDragStart={() => setDraggingChannelId(c.id)}
        onDragEnd={() => {
          setDraggingChannelId(null);
          setDragOverCategoryId(null);
        }}
        title={canManageChannels ? "Arraste pra uma categoria pra mover" : undefined}
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
    );
  }

  /** Um bloco de canal de VOZ (botao + lista de "quem esta conectado" aninhada) - mesma logica
   *  de antes, so' extraida pra funcao pelo mesmo motivo do renderTextChannel acima. */
  function renderVoiceChannel(c) {
    return (
      <div key={c.id}>
        <button
          className={
            "channel-item" +
            (c.id === selectedChannelId ? " active" : "") +
            (activeChannel?.id === c.id ? " connected-active" : "") +
            (dragOverChannelId === c.id ? " drop-target" : "") +
            (draggingChannelId === c.id ? " dragging" : "")
          }
          onClick={() => onSelectChannel(c)}
          onContextMenu={(e) => {
            if (!canManageChannels) return;
            e.preventDefault();
            setChannelMenu({ id: c.id, name: c.name, x: e.clientX, y: e.clientY });
          }}
          draggable={canManageChannels}
          onDragStart={() => setDraggingChannelId(c.id)}
          onDragEnd={() => {
            setDraggingChannelId(null);
            setDragOverCategoryId(null);
          }}
          title={canManageChannels ? "Arraste pra uma categoria pra mover" : undefined}
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
              // Melodion (musica) e Batera (soundboard) sao bots SEPARADOS no LiveKit, cada um
              // com seu proprio userId "falso" (ver VoicePresenceService.botUserId/
              // soundboardBotUserId no backend) - dá pra distinguir os dois so' comparando com
              // -c.id (so' o Melodion usa exatamente isso, o Batera usa um deslocamento).
              const identity = p.userId < 0 ? (p.userId === -c.id ? `musicbot-${c.id}` : `soundboardbot-${c.id}`) : `user-${p.userId}`;
              const isMe = p.userId === user?.id;
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
                    api.get(`/api/channels/${c.id}/voice-presence`).then(({ data }) => {
                      setPresenceByChannel((prev) => ({ ...prev, [c.id]: data }));
                    });
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
                    className={"voice-avatar" + (speakingIds.has(identity) ? " speaking" : "")}
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
    );
  }

  /** Cabecalho de uma categoria dentro de uma secao (texto OU voz) - clique recolhe/expande,
   *  botao direito abre o menu de renomear/excluir (so' pra quem tem MANAGE_CHANNELS). */
  function renderCategoryHeader(category) {
    const isCollapsed = collapsedCategories.has(category.id);
    return (
      <button
        key={`cat-${category.id}`}
        className={"channel-category-subheader" + (dragOverCategoryId === category.id ? " drop-target" : "")}
        onClick={() => toggleCategoryCollapsed(category.id)}
        onContextMenu={(e) => {
          if (!canManageChannels) return;
          e.preventDefault();
          setCategoryMenu({ id: category.id, name: category.name, x: e.clientX, y: e.clientY });
        }}
        onDragOver={(e) => {
          if (!canManageChannels || !draggingChannelId) return;
          e.preventDefault();
          setDragOverCategoryId(category.id);
        }}
        onDragLeave={() => setDragOverCategoryId((prev) => (prev === category.id ? null : prev))}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverCategoryId(null);
          if (!canManageChannels || !draggingChannelId) return;
          onMoveChannelCategory(draggingChannelId, category.id);
          setDraggingChannelId(null);
        }}
      >
        <span className={"connected-chevron" + (!isCollapsed ? " open" : "")}>▸</span>
        <FolderIcon size={13} />
        <span className="channel-group-title">{category.name.toUpperCase()}</span>
      </button>
    );
  }

  return (
    <div className={"channel-sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="channel-sidebar-header">
        {!collapsed && (
          <div className="channel-sidebar-title">
            {server && hasAnyServerSettings ? (
              <button
                type="button"
                className="channel-sidebar-name-btn"
                onClick={(e) => setServerMenu({ x: e.clientX, y: e.clientY })}
                title="Configurações do servidor"
              >
                <strong>{server.name}</strong>
                <ChevronDownIcon size={13} />
              </button>
            ) : (
              <strong>{server?.name || "Selecione um servidor"}</strong>
            )}
            {server && (
              <span className="channel-sidebar-subtitle">
                {members.length} membro{members.length === 1 ? "" : "s"} · {onlineCount} online
              </span>
            )}
          </div>
        )}
        <div className="channel-sidebar-header-actions">
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
            {canManageChannels && (
              <button className="channel-item add category-add" onClick={() => setCreatingCategory(true)}>
                <PlusIcon size={13} /> categoria
              </button>
            )}

            <button
              className={"channel-category-header" + (dragOverCategoryId === "text-none" ? " drop-target" : "")}
              onClick={() => setTextExpanded((v) => !v)}
              onDragOver={(e) => {
                if (!canManageChannels || !draggingChannelId) return;
                e.preventDefault();
                setDragOverCategoryId("text-none");
              }}
              onDragLeave={() => setDragOverCategoryId((prev) => (prev === "text-none" ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCategoryId(null);
                if (!canManageChannels || !draggingChannelId) return;
                onMoveChannelCategory(draggingChannelId, null);
              }}
              title={canManageChannels ? "Arraste um canal aqui pra tirar da categoria" : undefined}
            >
              <span className={"connected-chevron" + (textExpanded ? " open" : "")}>▸</span>
              <span className="channel-group-title">CANAIS DE TEXTO</span>
            </button>
            {textExpanded && (
              <>
                {groupByCategory(textChannels).map((group) => (
                  <div key={group.category?.id ?? "none"}>
                    {group.category && renderCategoryHeader(group.category)}
                    {!collapsedCategories.has(group.category?.id) && group.channels.map(renderTextChannel)}
                  </div>
                ))}
                {canManageChannels && (
                  <button className="channel-item add" onClick={() => onCreateChannel("TEXT")}>
                    + canal de texto
                  </button>
                )}
              </>
            )}

            <button
              className={"channel-category-header" + (dragOverCategoryId === "voice-none" ? " drop-target" : "")}
              onClick={() => setVoiceExpanded((v) => !v)}
              onDragOver={(e) => {
                if (!canManageChannels || !draggingChannelId) return;
                e.preventDefault();
                setDragOverCategoryId("voice-none");
              }}
              onDragLeave={() => setDragOverCategoryId((prev) => (prev === "voice-none" ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverCategoryId(null);
                if (!canManageChannels || !draggingChannelId) return;
                onMoveChannelCategory(draggingChannelId, null);
              }}
              title={canManageChannels ? "Arraste um canal aqui pra tirar da categoria" : undefined}
            >
              <span className={"connected-chevron" + (voiceExpanded ? " open" : "")}>▸</span>
              <span className="channel-group-title">CANAIS DE VOZ</span>
            </button>
            {voiceExpanded && (
              <>
                {groupByCategory(voiceChannels, { hideEmpty: true }).map((group) => (
                  <div key={group.category?.id ?? "none"}>
                    {group.category && renderCategoryHeader(group.category)}
                    {!collapsedCategories.has(group.category?.id) && group.channels.map(renderVoiceChannel)}
                  </div>
                ))}
                {canManageChannels && (
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

      {channelMenu && (
        <div
          className="volume-popover"
          ref={channelMenuRef}
          style={{
            left: Math.min(channelMenu.x, window.innerWidth - 200),
            top: Math.min(channelMenu.y, window.innerHeight - 70),
          }}
        >
          <p className="volume-popover-title">#{channelMenu.name}</p>
          <div className="participant-mod-actions">
            {categories.length > 0 && !movingChannel && (
              <button type="button" className="participant-mod-btn" onClick={() => setMovingChannel(true)}>
                <FolderIcon size={14} /> Mover para categoria
              </button>
            )}
            {movingChannel && (
              <>
                <p className="participant-mod-submenu-label">Mover para</p>
                <button
                  type="button"
                  className="participant-mod-btn"
                  onClick={() => {
                    onMoveChannelCategory(channelMenu.id, null);
                    setChannelMenu(null);
                    setMovingChannel(false);
                  }}
                >
                  Sem categoria
                </button>
                {categories.map((cat) => (
                  <button
                    type="button"
                    key={cat.id}
                    className="participant-mod-btn"
                    onClick={() => {
                      onMoveChannelCategory(channelMenu.id, cat.id);
                      setChannelMenu(null);
                      setMovingChannel(false);
                    }}
                  >
                    <FolderIcon size={14} /> {cat.name}
                  </button>
                ))}
              </>
            )}
            <button
              type="button"
              className="participant-mod-btn danger"
              onClick={() => {
                setDeletingChannel(channelMenu);
                setChannelMenu(null);
              }}
            >
              <TrashIcon size={14} /> Excluir canal
            </button>
          </div>
        </div>
      )}

      {serverMenu && server && (
        <div
          className="volume-popover"
          ref={serverMenuRef}
          style={{
            left: Math.min(serverMenu.x, window.innerWidth - 220),
            top: Math.min(serverMenu.y, window.innerHeight - 70),
          }}
        >
          <p className="volume-popover-title">{server.name}</p>
          <div className="participant-mod-actions">
            {(isAdmin || myServerPermissions.has("MANAGE_SERVER")) && (
              <button
                type="button"
                className="participant-mod-btn"
                onClick={() => {
                  onEditServer(server);
                  setServerMenu(null);
                }}
              >
                <PencilIcon size={14} /> Editar servidor
              </button>
            )}
            {(isAdmin || myServerPermissions.has("MANAGE_SERVER")) && (
              <button
                type="button"
                className="participant-mod-btn"
                onClick={() => {
                  onOpenEmojis(server);
                  setServerMenu(null);
                }}
              >
                <SmileIcon size={14} /> Emojis do servidor
              </button>
            )}
            {(isAdmin || myServerPermissions.has("MANAGE_ROLES")) && (
              <button
                type="button"
                className="participant-mod-btn"
                onClick={() => {
                  onOpenRoles(server);
                  setServerMenu(null);
                }}
              >
                <ShieldIcon size={14} /> Perfis e permissões
              </button>
            )}
            {(isAdmin || myServerPermissions.has("VIEW_AUDIT_LOG")) && (
              <button
                type="button"
                className="participant-mod-btn"
                onClick={() => {
                  onOpenAuditLog(server);
                  setServerMenu(null);
                }}
              >
                <ListIcon size={14} /> Log de auditoria
              </button>
            )}
          </div>
        </div>
      )}

      {categoryMenu && (
        <div
          className="volume-popover"
          ref={categoryMenuRef}
          style={{
            left: Math.min(categoryMenu.x, window.innerWidth - 200),
            top: Math.min(categoryMenu.y, window.innerHeight - 70),
          }}
        >
          <p className="volume-popover-title">{categoryMenu.name}</p>
          <div className="participant-mod-actions">
            <button
              type="button"
              className="participant-mod-btn"
              onClick={() => {
                setEditingCategory(categoryMenu);
                setCategoryMenu(null);
              }}
            >
              <PencilIcon size={14} /> Renomear
            </button>
            <button
              type="button"
              className="participant-mod-btn danger"
              onClick={() => {
                setDeletingCategory(categoryMenu);
                setCategoryMenu(null);
              }}
            >
              <TrashIcon size={14} /> Excluir categoria
            </button>
          </div>
        </div>
      )}

      {(creatingCategory || editingCategory) && (
        <CategoryModal
          initialName={editingCategory?.name}
          onClose={() => {
            setCreatingCategory(false);
            setEditingCategory(null);
          }}
          onSave={handleSaveCategory}
        />
      )}

      {deletingCategory && (
        <ConfirmModal
          title="Excluir categoria"
          message={`Tem certeza que quer excluir a categoria "${deletingCategory.name}"? Os canais dela não são apagados, so' ficam sem categoria.`}
          confirmLabel="Excluir"
          danger
          onClose={() => setDeletingCategory(null)}
          onConfirm={() => handleConfirmDeleteCategory(deletingCategory)}
        />
      )}

      {deletingChannel && (
        <ConfirmModal
          title="Excluir canal"
          message={`Tem certeza que quer excluir "#${deletingChannel.name}"? Todas as mensagens desse canal serão apagadas junto - não dá pra desfazer.`}
          confirmLabel="Excluir"
          danger
          onClose={() => setDeletingChannel(null)}
          onConfirm={() => handleConfirmDeleteChannel(deletingChannel)}
        />
      )}

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
