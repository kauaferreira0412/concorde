import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import { subscribeToChannel, sendChatMessage, editChatMessage, deleteChatMessage, rollDice } from "../ws/chatSocket";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import { applyMention, getMentionQuery, mentionsUser } from "../utils/mentions";
import { parseMarkdownBlocks, renderInline } from "../utils/markdown.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import DiceRollCard from "./DiceRollCard.jsx";
import MusicQueueCard from "./MusicQueueCard.jsx";
import { CheckIcon, MegaphoneIcon, PencilIcon, PlusIcon, ReplyIcon, TrashIcon, XIcon } from "./icons.jsx";

// /roll ou /r seguido de uma notacao de dado (ex: "/roll 2d20+5") - mesma notacao aceita pelo
// backend (ver DiceService), checada aqui tambem so' pra dar um erro na hora em vez de a
// mensagem sumir silenciosamente se a notacao for invalida (ver handleSend).
const ROLL_COMMAND_RE = /^\/(?:roll|r)\s+(.+)$/i;
const ROLL_NOTATION_RE = /^(\d{0,2})d(\d{1,3})\s*([+-]\s*\d{1,3})?$/i;

// /play <link ou busca> e /stop - bot de musica (ver MusicController.java/music-bot/index.js).
// So' fazem sentido com o usuario CONECTADO numa call de voz (activeChannel, ver handleSend) -
// e' o canal de voz que recebe o audio, que pode ser diferente do canal de TEXTO onde o
// comando foi digitado (por isso o feedback e' mandado de volta pro canal de texto atual).
const PLAY_COMMAND_RE = /^\/play\s+(.+)$/i;
const STOP_COMMAND_RE = /^\/stop\s*$/i;
const PAUSE_COMMAND_RE = /^\/pause\s*$/i;
const CONTINUE_COMMAND_RE = /^\/continue\s*$/i;
const SKIP_COMMAND_RE = /^\/skip\s*$/i;
// Nome e' opcional ("/fila" sozinho tambem funciona, so' fica sem titulo) - so' cosmetico,
// aparece no topo do card (ver MusicQueueCard.jsx).
const FILA_COMMAND_RE = /^\/fila(?:\s+(.+))?$/i;
// Marcador especial no CONTEUDO da mensagem (ver /fila abaixo) - em vez de mandar texto pro
// chat, /fila manda essa mensagem "magica" com o id do canal de VOZ embutido; ao renderizar
// (ver MessageText/DiceRollCard mais abaixo) qualquer mensagem com esse conteudo exato vira um
// MusicQueueCard AO VIVO em vez de texto normal. Evita precisar de uma coluna nova no banco so'
// pra isso (mesma logica de reaproveitamento que o /roll usa colunas dedicadas, mas aqui nem
// isso e' necessario - o card busca o estado dele sozinho via REST/WebSocket, ver MusicQueueCard.jsx).
const MUSIC_QUEUE_MARKER_RE = /^\[\[MUSIC_QUEUE:(\d+)\]\]$/;

// Autocomplete de "/" (ver getSlashMenuState).
const SLASH_COMMANDS = [
  { name: "roll", description: "Rolar dados de RPG (ex: 2d20+5)" },
  { name: "play", description: "Tocar música (ou adicionar à fila) na sua call" },
  { name: "fila", description: "Criar a fila de música ao vivo no chat (nome opcional)" },
  { name: "pause", description: "Pausar a música da sua call" },
  { name: "continue", description: "Continuar a música pausada" },
  { name: "skip", description: "Pular pra próxima música da fila" },
  { name: "stop", description: "Parar a música da sua call" },
];
const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

/**
 * Autocomplete de comando "/" - so' faz sentido no COMECO da mensagem (igual Discord), por
 * isso olha o draft inteiro, nao o caret como a mencao (@) faz. Dois estagios:
 *  1. Ainda escolhendo o comando ("/", "/r", "/ro"...) - sugere os nomes de comando.
 *  2. Ja' escolheu "/roll " (ou "/r ") - sugere os tipos de dado (d4..d100), respeitando
 *     qualquer numero de dados ja' digitado antes (ex: "/roll 2" sugere "2d4", "2d6"...).
 */
function getSlashMenuState(draft) {
  if (!draft.startsWith("/")) return null;

  const commandMatch = /^\/(\w*)$/.exec(draft);
  if (commandMatch) {
    const q = commandMatch[1].toLowerCase();
    const items = SLASH_COMMANDS.filter((c) => c.name.startsWith(q)).map((c) => ({
      key: c.name,
      insert: `/${c.name} `,
      display: `/${c.name}`,
      description: c.description,
    }));
    return items.length > 0 ? { kind: "command", items } : null;
  }

  const rollMatch = /^(\/(?:roll|r)\s+)(\S*)$/i.exec(draft);
  if (rollMatch) {
    const prefix = rollMatch[1];
    const partial = rollMatch[2];
    const countPrefix = /^(\d{0,2})/.exec(partial)[1];
    const items = DICE_SIDES.map((sides) => `${countPrefix}d${sides}`)
      .filter((label) => label.toLowerCase().startsWith(partial.toLowerCase()))
      .map((label) => ({ key: label, insert: prefix + label, display: label, description: null }));
    return items.length > 0 ? { kind: "dice", items } : null;
  }

  return null;
}

/** Renderiza o conteudo da mensagem com markdown "estilo Discord" (negrito/italico/sublinhado/
 *  tachado/codigo/citacao/listas/titulos/links, ver utils/markdown.jsx) + @mencoes clicaveis
 *  (mesmo pipeline - so' reconhece quem e' de verdade membro do servidor). */
function MessageText({ content, memberUsernames, myUsername, members, openProfile }) {
  if (!content) return null;
  const ctx = { memberUsernames, myUsername, members, openProfile };
  return (
    <div className="chat-markdown">
      {parseMarkdownBlocks(content).map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "code":
            return (
              <pre key={key} className="chat-code-block">
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={key} className="chat-blockquote">
                {renderInline(block.text, ctx, key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, ctx, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, ctx, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "h1":
          case "h2":
          case "h3": {
            const Tag = block.type;
            return (
              <Tag key={key} className="chat-heading">
                {renderInline(block.text, ctx, key)}
              </Tag>
            );
          }
          default:
            return <p key={key}>{renderInline(block.text, ctx, key)}</p>;
        }
      })}
    </div>
  );
}

export default function ChatWindow({ channel, stompClient, stompConnected, stompError }) {
  const { user, isAdmin } = useAuth();
  const { openProfile } = useProfile();
  const { showAlert } = useAlert();
  const { activeChannel } = useVoiceCall();
  const members = useServerMembers(channel?.serverId, stompClient, stompConnected);
  const memberUsernames = useMemo(() => members.map((m) => m.username), [members]);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl } - aguardando confirmacao de envio
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null); // url da imagem em tela cheia, null = fechado
  const [replyingTo, setReplyingTo] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null); // string | null - null = autocomplete fechado
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false); // true = usuario fechou com Esc
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftInputRef = useRef(null);
  const messageRefs = useRef(new Map()); // messageId -> elemento na tela, pra "pular pra" no clique do reply

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return members.filter((m) => m.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6);
  }, [mentionQuery, members]);

  // "/roll" so' faz sentido no comeco da mensagem - nunca junto com o autocomplete de @mencao.
  const slashMenu = useMemo(
    () => (mentionQuery === null && !slashDismissed ? getSlashMenuState(draft) : null),
    [draft, mentionQuery, slashDismissed]
  );

  useEffect(() => {
    if (!channel) return;
    setMessages([]);
    setEditingId(null);
    setReplyingTo(null);
    clearPendingImage();
    api.get(`/api/channels/${channel.id}/messages`).then(({ data }) => setMessages(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  useEffect(() => {
    if (!channel || !stompClient || !stompConnected) return;
    const sub = subscribeToChannel(stompClient, channel.id, (event) => {
      if (event.type === "CREATED") {
        setMessages((prev) => [...prev, event.message]);
      } else if (event.type === "UPDATED") {
        setMessages((prev) => prev.map((m) => (m.id === event.message.id ? event.message : m)));
      } else if (event.type === "DELETED") {
        setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
      }
    });
    return () => sub.unsubscribe();
  }, [channel, stompClient, stompConnected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Campo de mensagem e' um <textarea> que cresce sozinho conforme o texto (ate' um limite,
  // depois rola por dentro) - roda a cada mudanca do rascunho, inclusive quando ele e' limpo
  // programaticamente depois de enviar (por isso e' um efeito, nao so' um onInput: o reset
  // pra 1 linha precisa acontecer mesmo sem o usuario ter digitado nada naquele momento).
  useEffect(() => {
    const el = draftInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [draft]);

  useEffect(() => {
    // Libera a memoria do preview quando o componente desmonta ou a imagem pendente muda
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  function clearPendingImage() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  function pickFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    clearPendingImage();
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }

  function handlePickImage(e) {
    pickFile(e.target.files?.[0]);
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois
  }

  // Ctrl+V com uma imagem na area de transferencia so prepara o preview - o envio de
  // verdade so acontece quando o usuario confirma (Enviar ou Enter), igual anexar arquivo.
  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = [...items].find((it) => it.type.startsWith("image/"));
    if (!imageItem) return; // deixa o paste normal (texto) acontecer
    e.preventDefault();
    pickFile(imageItem.getAsFile());
  }

  function handleDraftChange(e) {
    const value = e.target.value;
    setDraft(value);
    const caret = e.target.selectionStart ?? value.length;
    const query = getMentionQuery(value, caret);
    setMentionQuery(query);
    setMentionIndex(0);
    setSlashIndex(0);
    setSlashDismissed(false);
  }

  function pickMention(username) {
    const input = draftInputRef.current;
    const caret = input?.selectionStart ?? draft.length;
    const { text, caret: newCaret } = applyMention(draft, caret, username);
    setDraft(text);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(newCaret, newCaret);
    });
  }

  /** Clique ou Tab/Enter numa sugestao do "/" - so' troca o draft (nunca envia sozinho, o
   *  usuario ainda pode continuar digitando/editando antes de mandar de verdade). */
  function pickSlashItem(item) {
    setDraft(item.insert);
    setSlashIndex(0);
    requestAnimationFrame(() => {
      const input = draftInputRef.current;
      input?.focus();
      input?.setSelectionRange(item.insert.length, item.insert.length);
    });
  }

  function handleDraftKeyDown(e) {
    if (slashMenu && slashMenu.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMenu.items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMenu.items.length) % slashMenu.items.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && slashMenu.kind === "command")) {
        // Enter so' auto-completa no estagio "escolhendo o comando" - no estagio da notacao do
        // dado (ex: "/roll d2_"), Enter continua ENVIANDO de verdade (ja' e' uma notacao valida
        // sozinha, tipo "d20"), so' Tab completa com a sugestao ali.
        e.preventDefault();
        pickSlashItem(slashMenu.items[slashIndex]);
        return;
      }
      if (e.key === "Escape") {
        setSlashDismissed(true);
        return;
      }
    }
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionMatches[mentionIndex].username);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    // Textarea de verdade insere quebra de linha no Enter por padrao (diferente do <input>
    // de antes, que enviava sozinho) - Enter sozinho envia, Shift+Enter quebra linha, igual
    // Discord/WhatsApp.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!stompConnected || sending) return;
    if (!draft.trim() && !pendingImage) return;

    // Comando /roll (ou /r) - "notação de mesa" (2d20+5, d6, 1d100-2) em vez de mandar uma
    // mensagem normal. Validado aqui tambem (nao so' no backend, ver DiceService) pra avisar
    // na hora se a notação estiver errada, em vez de a mensagem simplesmente nao aparecer.
    const rollMatch = ROLL_COMMAND_RE.exec(draft.trim());
    if (rollMatch) {
      const notation = rollMatch[1].trim();
      if (!ROLL_NOTATION_RE.test(notation)) {
        showAlert("Notação de dado inválida. Use algo como: /roll 2d20+5, /roll d6 ou /roll 1d100-2");
        return;
      }
      rollDice(stompClient, channel.id, notation);
      setDraft("");
      return;
    }

    // /play <link ou busca> - manda pro bot de musica TOCAR na call de voz em que o usuario
    // esta agora (activeChannel), e avisa no canal de TEXTO atual (onde o comando foi digitado)
    // com o titulo que o bot devolveu, igual um card de confirmacao.
    const playMatch = PLAY_COMMAND_RE.exec(draft.trim());
    if (playMatch) {
      if (!activeChannel) {
        showAlert("Você precisa estar conectado numa call de voz para tocar música");
        return;
      }
      setDraft("");
      setSending(true);
      try {
        const { data } = await api.post(`/api/channels/${activeChannel.id}/music/play`, { query: playMatch[1].trim() });
        const feedback = data.queued
          ? `➕ Adicionado à fila: **${data.title}**`
          : `🎵 Tocando: **${data.title}**`;
        sendChatMessage(stompClient, channel.id, feedback, null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || "Não foi possível tocar essa música");
      } finally {
        setSending(false);
      }
      return;
    }

    // /fila - manda um card AO VIVO da fila de musica pro chat (ver MUSIC_QUEUE_MARKER_RE/
    // MusicQueueCard.jsx). So' pode ter UMA fila aberta por canal (pedido explicito do usuario)
    // - por isso "abre" no backend ANTES de postar o card; se ja' tiver uma aberta, o backend
    // recusa e a gente avisa em vez de duplicar o card (precisa apagar a fila atual primeiro,
    // ver o botão "Apagar fila" dentro do MusicQueueCard.jsx).
    const filaMatch = FILA_COMMAND_RE.exec(draft.trim());
    if (filaMatch) {
      if (!activeChannel) {
        showAlert("Você precisa estar conectado numa call de voz para ver a fila de música");
        return;
      }
      setDraft("");
      setSending(true);
      try {
        await api.post(`/api/channels/${activeChannel.id}/music/queue/open`, { name: filaMatch[1]?.trim() || "" });
        sendChatMessage(stompClient, channel.id, `[[MUSIC_QUEUE:${activeChannel.id}]]`, null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || "Não foi possível abrir a fila de música");
      } finally {
        setSending(false);
      }
      return;
    }

    // /stop - para a musica que estiver tocando na call de voz atual.
    if (STOP_COMMAND_RE.test(draft.trim())) {
      if (!activeChannel) {
        showAlert("Você precisa estar conectado numa call de voz para parar a música");
        return;
      }
      setDraft("");
      setSending(true);
      try {
        await api.post(`/api/channels/${activeChannel.id}/music/stop`);
        sendChatMessage(stompClient, channel.id, "⏹️ Música parada.", null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || "Não foi possível parar a música");
      } finally {
        setSending(false);
      }
      return;
    }

    // /skip - pula pra proxima musica da fila (PUBLICO, qualquer um pode pular, nao so' quem
    // pediu a musica atual - pedido explicito do usuario). Mesma acao do botão "Pular" dentro
    // do MusicQueueCard.jsx.
    if (SKIP_COMMAND_RE.test(draft.trim())) {
      if (!activeChannel) {
        showAlert("Você precisa estar conectado numa call de voz para pular a música");
        return;
      }
      setDraft("");
      setSending(true);
      try {
        await api.post(`/api/channels/${activeChannel.id}/music/skip`);
        sendChatMessage(stompClient, channel.id, "⏭️ Música pulada.", null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || "Não foi possível pular a música");
      } finally {
        setSending(false);
      }
      return;
    }

    // /pause e /continue - congelam/retomam a musica atual no ponto exato em que parou (nao e'
    // a mesma coisa que mutar - ver comentario em music-bot/index.js pumpAudio).
    if (PAUSE_COMMAND_RE.test(draft.trim()) || CONTINUE_COMMAND_RE.test(draft.trim())) {
      const pausing = PAUSE_COMMAND_RE.test(draft.trim());
      if (!activeChannel) {
        showAlert(`Você precisa estar conectado numa call de voz para ${pausing ? "pausar" : "continuar"} a música`);
        return;
      }
      setDraft("");
      setSending(true);
      try {
        await api.post(`/api/channels/${activeChannel.id}/music/${pausing ? "pause" : "resume"}`);
        sendChatMessage(stompClient, channel.id, pausing ? "⏸️ Música pausada." : "▶️ Música retomada.", null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || `Não foi possível ${pausing ? "pausar" : "continuar"} a música`);
      } finally {
        setSending(false);
      }
      return;
    }

    setUploadError("");
    setSending(true);
    try {
      let imageUrl = null;
      if (pendingImage) {
        const formData = new FormData();
        formData.append("file", pendingImage.file);
        const { data } = await api.post(`/api/channels/${channel.id}/attachments`, formData);
        imageUrl = data.url;
      }
      sendChatMessage(stompClient, channel.id, draft.trim(), imageUrl, replyingTo?.id);
      setDraft("");
      setReplyingTo(null);
      clearPendingImage();
    } catch (err) {
      setUploadError(err.response?.data?.error || "Falha ao enviar imagem");
    } finally {
      setSending(false);
    }
  }

  function canModify(m) {
    return isAdmin || m.authorId === user?.id;
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditingText(m.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  function saveEdit(m) {
    if (!editingText.trim()) return;
    editChatMessage(stompClient, channel.id, m.id, editingText.trim());
    setEditingId(null);
  }

  function startReply(m) {
    setReplyingTo(m);
    draftInputRef.current?.focus();
  }

  function jumpToMessage(id) {
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-message-flash");
    setTimeout(() => el.classList.remove("chat-message-flash"), 1200);
  }

  if (!channel) {
    return <div className="chat-window empty">Selecione um canal de texto</div>;
  }

  return (
    <div className="chat-window">
      <div className={"chat-header" + (channel.adminOnly ? " chat-header-announcements" : "")}>
        {channel.adminOnly ? <MegaphoneIcon size={15} className="chat-header-announcements-icon" /> : "#"} {channel.name}
      </div>
      {stompError ? (
        <div className="chat-status error">⚠️ {stompError}</div>
      ) : !stompConnected ? (
        <div className="chat-status">Conectando ao chat em tempo real...</div>
      ) : null}
      {uploadError && <div className="chat-status error">⚠️ {uploadError}</div>}
      <div className="chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            ref={(el) => {
              if (el) messageRefs.current.set(m.id, el);
              else messageRefs.current.delete(m.id);
            }}
            className={
              "chat-message" +
              (mentionsUser(m.content, user?.username) ? " mentioned" : "") +
              (channel.adminOnly ? " announcement" : "")
            }
          >
            <button type="button" className="chat-avatar-btn" onClick={() => openProfile(m.authorId)} title={`Ver perfil de ${m.authorUsername}`}>
              <Avatar name={m.authorUsername} url={m.authorAvatarUrl} className="chat-avatar" />
            </button>
            <div className="chat-message-body">
              <div>
                <button type="button" className="chat-author" onClick={() => openProfile(m.authorId)}>
                  {m.authorUsername}
                </button>
                <span className="chat-time">{new Date(m.createdAt).toLocaleTimeString()}</span>
                {m.editedAt && <span className="chat-edited">(editado)</span>}
              </div>

              {m.replyToId && (
                <button
                  type="button"
                  className={"chat-reply-preview" + (m.replyTo ? "" : " gone")}
                  onClick={() => m.replyTo && jumpToMessage(m.replyTo.id)}
                  disabled={!m.replyTo}
                >
                  <ReplyIcon size={12} />
                  {m.replyTo ? (
                    <>
                      <strong>{m.replyTo.authorUsername}</strong>
                      <span>{m.replyTo.content || (m.replyTo.imageUrl ? "🖼️ Imagem" : "")}</span>
                    </>
                  ) : (
                    <span>Mensagem original removida</span>
                  )}
                </button>
              )}

              {editingId === m.id ? (
                <div className="chat-edit-row">
                  <textarea
                    autoFocus
                    rows={1}
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onInput={(e) => {
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit(m);
                      }
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <button className="icon-btn" onClick={() => saveEdit(m)} title="Salvar">
                    <CheckIcon />
                  </button>
                  <button className="icon-btn" onClick={cancelEdit} title="Cancelar">
                    <XIcon />
                  </button>
                </div>
              ) : (
                <>
                  {m.rollNotation ? (
                    <DiceRollCard
                      notation={m.rollNotation}
                      sides={m.rollSides}
                      resultsCsv={m.rollResultsCsv}
                      total={m.rollTotal}
                    />
                  ) : MUSIC_QUEUE_MARKER_RE.test(m.content || "") ? (
                    <MusicQueueCard
                      channelId={Number(MUSIC_QUEUE_MARKER_RE.exec(m.content)[1])}
                      stompClient={stompClient}
                      stompConnected={stompConnected}
                    />
                  ) : (
                    <MessageText
                      content={m.content}
                      memberUsernames={memberUsernames}
                      myUsername={user?.username}
                      members={members}
                      openProfile={openProfile}
                    />
                  )}
                  {m.imageUrl && (
                    <button type="button" className="chat-image-btn" onClick={() => setLightboxImage(m.imageUrl)}>
                      <img src={m.imageUrl} alt="Imagem enviada no chat" className="chat-image" />
                    </button>
                  )}
                </>
              )}
            </div>

            {editingId !== m.id && (
              <div className="chat-message-actions">
                <button className="icon-btn" onClick={() => startReply(m)} title="Responder">
                  <ReplyIcon size={15} />
                </button>
                {canModify(m) && (
                  <>
                    {/* Editar nao faz sentido numa rolagem de dado (resultado ja' sorteado) nem
                        num card de fila (editar o marcador especial so' quebraria o card) -
                        so' da pra apagar os dois (ver DiceRollCard/MusicQueueCard acima). */}
                    {!m.rollNotation && !MUSIC_QUEUE_MARKER_RE.test(m.content || "") && (
                      <button className="icon-btn" onClick={() => startEdit(m)} title="Editar mensagem">
                        <PencilIcon size={15} />
                      </button>
                    )}
                    <button className="icon-btn icon-btn-danger" onClick={() => setDeleteTarget(m)} title="Apagar mensagem">
                      <TrashIcon size={15} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {pendingImage && (
        <div className="chat-pending-attachment">
          <img src={pendingImage.previewUrl} alt="Pré-visualização da imagem" />
          <div>
            <strong>Enviar esta imagem?</strong>
            <p className="admin-hint" style={{ margin: "2px 0 0" }}>
              {pendingImage.file.name} — pode escrever uma legenda abaixo antes de enviar.
            </p>
          </div>
          <button className="icon-btn icon-btn-danger" onClick={clearPendingImage} title="Cancelar imagem" disabled={sending}>
            <XIcon />
          </button>
        </div>
      )}

      {replyingTo && (
        <div className="chat-replying-bar">
          <ReplyIcon size={13} />
          <span>
            Respondendo a <strong>{replyingTo.authorUsername}</strong>
            {replyingTo.content ? `: ${truncate(replyingTo.content, 80)}` : replyingTo.imageUrl ? ": 🖼️ Imagem" : ""}
          </span>
          <button type="button" className="icon-btn" onClick={() => setReplyingTo(null)} title="Cancelar resposta">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {channel.adminOnly && !isAdmin ? (
        // Canal "so' admin posta" (ver Channel.adminOnly no backend, ex: "Atualizações") -
        // todo mundo le normalmente, mas quem nao e' admin nem VE a caixa de escrever (o
        // backend tambem recusa de verdade, ver MessageService.save - isso aqui e' so' pra
        // nao nem mostrar um campo que sempre ia falhar).
        <div className="chat-readonly-notice">
          <MegaphoneIcon size={15} />
          Só administradores podem postar em #{channel.name}.
        </div>
      ) : (
        <form className="chat-input" onSubmit={handleSend}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            ref={fileInputRef}
            onChange={handlePickImage}
            hidden
          />
          <button
            type="button"
            className="icon-btn chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!stompConnected || sending}
            title="Enviar imagem"
          >
            <PlusIcon />
          </button>
          <div className="chat-input-field">
            {slashMenu && (
              <div className="mention-menu slash-menu">
                {slashMenu.items.map((item, i) => (
                  <button
                    type="button"
                    key={item.key}
                    className={"mention-option slash-option" + (i === slashIndex ? " active" : "")}
                    onMouseDown={(e) => {
                      e.preventDefault(); // nao deixa o input perder foco antes do clique registrar
                      pickSlashItem(item);
                    }}
                  >
                    <span className="slash-option-command">{item.display}</span>
                    {item.description && <span className="slash-option-description">{item.description}</span>}
                  </button>
                ))}
                <p className="slash-menu-hint">Tab pra completar · ↑↓ pra navegar</p>
              </div>
            )}
            {mentionQuery !== null && mentionMatches.length > 0 && (
              <div className="mention-menu">
                {mentionMatches.map((m, i) => (
                  <button
                    type="button"
                    key={m.userId}
                    className={"mention-option" + (i === mentionIndex ? " active" : "")}
                    onMouseDown={(e) => {
                      e.preventDefault(); // nao deixa o input perder foco antes do clique registrar
                      pickMention(m.username);
                    }}
                  >
                    <Avatar name={m.username} url={m.avatarUrl} className="voice-avatar small" />
                    {m.username}
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={draftInputRef}
              rows={1}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleDraftKeyDown}
              onPaste={handlePaste}
              placeholder={
                pendingImage
                  ? "Adicionar legenda (opcional)..."
                  : sending
                  ? "Enviando..."
                  : `Conversar em #${channel.name} (@ pra mencionar, **negrito**, *itálico*, /roll 2d20 pra rolar dado, /play pra tocar música, Ctrl+V cola imagem, Shift+Enter quebra linha)`
              }
              disabled={!stompConnected || sending}
            />
          </div>
          <button type="submit" disabled={!stompConnected || sending || (!draft.trim() && !pendingImage)}>
            Enviar
          </button>
        </form>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Apagar mensagem"
          message="Essa ação não pode ser desfeita. Tem certeza que quer apagar esta mensagem?"
          confirmLabel="Apagar"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteChatMessage(stompClient, channel.id, deleteTarget.id)}
        />
      )}

      {lightboxImage && (
        <ImageLightbox src={lightboxImage} alt="Imagem enviada no chat" onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
