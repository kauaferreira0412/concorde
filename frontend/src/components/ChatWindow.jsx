import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import {
  subscribeToChannel,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  rollDice,
  toggleReaction,
  pinMessage,
  publishTyping,
  subscribeToTyping,
  createPoll,
} from "../ws/chatSocket";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { useVoiceCall } from "../context/VoiceCallContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import { applyMention, getMentionQuery, mentionsUser } from "../utils/mentions";
import { useAudioRecorder } from "../utils/useAudioRecorder";
import { attachmentSummary } from "../utils/attachmentSummary";
import Avatar, { toneFor } from "./Avatar.jsx";
import EmptyState from "./EmptyState.jsx";
import GifPicker from "./GifPicker.jsx";
import ChatImage from "./ChatImage.jsx";
import LinkPreview from "./LinkPreview.jsx";
import MessageSearchPanel from "./MessageSearchPanel.jsx";
import { useFileDrop } from "../utils/useFileDrop";
import { MembersToggleButton, MobileBackButton } from "../context/LayoutContext.jsx";
import RecordingBar from "./RecordingBar.jsx";
import AudioPlayer from "./AudioPlayer.jsx";
import DaySeparator, { isGroupedWith, isNewDay } from "./DaySeparator.jsx";
import MessageText from "./MessageText.jsx";
import AttachmentMessage from "./AttachmentMessage.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import DiceRollCard from "./DiceRollCard.jsx";
import EmojiPicker from "./EmojiPicker.jsx";
import MusicQueueCard from "./MusicQueueCard.jsx";
import PollCard from "./PollCard.jsx";
import { useStickToBottom } from "../utils/useStickToBottom";
import {
  CheckIcon,
  HashIcon,
  MegaphoneIcon,
  MicIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  SmileIcon,
  TrashIcon,
  XIcon,
} from "./icons.jsx";

const ROLL_COMMAND_RE = /^\/(?:roll|r)\s+(.+)$/i;
const ROLL_NOTATION_RE = /^(\d{0,2})d(\d{1,3})\s*([+-]\s*\d{1,3})?$/i;

const PLAY_COMMAND_RE = /^\/play\s+(.+)$/i;
const STOP_COMMAND_RE = /^\/stop\s*$/i;
const PAUSE_COMMAND_RE = /^\/pause\s*$/i;
const CONTINUE_COMMAND_RE = /^\/continue\s*$/i;
const SKIP_COMMAND_RE = /^\/skip\s*$/i;
const FILA_COMMAND_RE = /^\/fila(?:\s+(.+))?$/i;
const MUSIC_QUEUE_MARKER_RE = /^\[\[MUSIC_QUEUE:(\d+):([^\]]+)\]\]$/;

const POLL_COMMAND_RE = /^\/(poll|pollmulti)\s+(.+)$/i;

const SPOTIFY_COMMAND_RE = /^\/spotify(?:\s+@?(\S+))?\s*$/i;

const SLASH_COMMANDS = [
  { name: "roll", description: "Rolar dados de RPG (ex: 2d20+5)" },
  { name: "play", description: "Tocar música (ou adicionar à fila) na sua call" },
  { name: "fila", description: "Criar a fila de música ao vivo no chat (nome opcional)" },
  { name: "pause", description: "Pausar a música da sua call" },
  { name: "continue", description: "Continuar a música pausada" },
  { name: "skip", description: "Pular pra próxima música da fila" },
  { name: "stop", description: "Parar a música da sua call" },
  { name: "poll", description: "Enquete (escolha única) - depois adicione as opções no card" },
  { name: "pollmulti", description: "Enquete (múltipla escolha) - depois adicione as opções no card" },
  { name: "spotify", description: "Ver o que você (ou @alguém) está ouvindo no Spotify" },
];
const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

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

export default function ChatWindow({ channel, stompClient, stompConnected, stompError }) {
  const { user, isAdmin } = useAuth();

  // Cor de destaque do autor; nas minhas mensagens usa a atual (muda na hora quando troco nas configurações).
  const { openProfile } = useProfile();
  const { showAlert } = useAlert();
  const { activeChannel } = useVoiceCall();
  const members = useServerMembers(channel?.serverId, stompClient, stompConnected);
  const memberUsernames = useMemo(() => members.map((m) => m.username), [members]);

  const [messages, setMessages] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const recorder = useAudioRecorder();
  const { dragging: fileDragging, dropProps } = useFileDrop((f) => pickFile(f), !!stompConnected && !!channel && !(channel.adminOnly && !isAdmin));
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [showDraftEmojiPicker, setShowDraftEmojiPicker] = useState(false);

  // Seletores de emoji (do campo de mensagem e de reação) fecham ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!showDraftEmojiPicker && reactionPickerFor == null) return undefined;
    function close() {
      setShowDraftEmojiPicker(false);
      setReactionPickerFor(null);
    }
    function onDown(e) {
      if (e.target.closest?.(".emoji-picker, .emoji-picker-toggle")) return;
      close();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showDraftEmojiPicker, reactionPickerFor]);
  const [myServerPermissions, setMyServerPermissions] = useState(new Set());
  const [customEmojis, setCustomEmojis] = useState({});
  const [customEmojiList, setCustomEmojiList] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [showPinned, setShowPinned] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftInputRef = useRef(null);
  const messageRefs = useRef(new Map());
  const typingTimersRef = useRef(new Map());
  const iAmTypingRef = useRef(false);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return members.filter((m) => m.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6);
  }, [mentionQuery, members]);

  const slashMenu = useMemo(
    () => (mentionQuery === null && !slashDismissed ? getSlashMenuState(draft) : null),
    [draft, mentionQuery, slashDismissed]
  );

  useEffect(() => {
    if (!channel) return;
    setMessages([]);
    setHistoryLoaded(false);
    setEditingId(null);
    setReplyingTo(null);
    setShowPinned(false);
    setPinnedMessages([]);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setTypingUsers(new Map());
    clearPendingImage();
    clearPendingFile();
    api.get(`/api/channels/${channel.id}/messages`).then(({ data }) => setMessages(data))
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [channel]);

  useEffect(() => {
    if (!channel?.serverId) {
      setMyServerPermissions(new Set());
      return;
    }
    let cancelled = false;
    api
      .get(`/api/servers/${channel.serverId}/me/permissions`)
      .then(({ data }) => {
        if (!cancelled) setMyServerPermissions(new Set(data));
      })
      .catch(() => {
        if (!cancelled) setMyServerPermissions(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [channel?.serverId]);

  useEffect(() => {
    if (!channel?.serverId) {
      setCustomEmojis({});
      setCustomEmojiList([]);
      return;
    }
    let cancelled = false;
    function fetchEmojis() {
      api
        .get(`/api/servers/${channel.serverId}/emojis`)
        .then(({ data }) => {
          if (cancelled) return;
          setCustomEmojiList(data);
          setCustomEmojis(Object.fromEntries(data.map((e) => [e.name, e.imageUrl])));
        })
        .catch(() => {
          if (!cancelled) {
            setCustomEmojiList([]);
            setCustomEmojis({});
          }
        });
    }
    fetchEmojis();
    function handleUpdated(e) {
      if (e.detail?.serverId === channel.serverId) fetchEmojis();
    }
    window.addEventListener("concorde:custom-emojis-updated", handleUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("concorde:custom-emojis-updated", handleUpdated);
    };
  }, [channel?.serverId]);

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
    if (!channel || !stompClient || !stompConnected) return;
    const timers = typingTimersRef.current;
    const sub = subscribeToTyping(stompClient, channel.id, (event) => {
      if (event.userId === user?.id) return;
      clearTimeout(timers.get(event.userId));
      if (event.typing) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(event.userId, event.username);
          return next;
        });
        timers.set(
          event.userId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(event.userId);
              return next;
            });
          }, 4000)
        );
      } else {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(event.userId);
          return next;
        });
      }
    });
    return () => {
      sub.unsubscribe();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [channel, stompClient, stompConnected]);

  const { containerRef: messagesRef, onScroll: onMessagesScroll, release: releaseStick } = useStickToBottom(channel?.id, messages);

  useEffect(() => {
    const el = draftInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [draft]);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
    };
  }, [pendingImage]);

  useEffect(() => {
    return () => {
      if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    };
  }, [pendingFile]);

  function clearPendingImage() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  function clearPendingFile() {
    setPendingFile((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  function pickFile(file) {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      clearPendingImage();
      setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
      return;
    }
    clearPendingFile();
    setPendingFile({ file, name: file.name, type: file.type, size: file.size, previewUrl: URL.createObjectURL(file) });
  }

  function handlePickImage(e) {
    pickFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItem = [...items].find((it) => it.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    pickFile(imageItem.getAsFile());
  }

  async function handleStartRecording() {
    clearPendingFile();
    try {
      await recorder.start();
    } catch {
      showAlert("Não foi possível acessar o microfone - verifique a permissão do navegador/SO");
    }
  }

  async function handleStopRecording() {
    const blob = await recorder.stop();
    if (!blob || blob.size === 0) return;
    setPendingFile({
      file: blob,
      name: "Mensagem de voz.webm",
      type: "audio/webm",
      size: blob.size,
      previewUrl: URL.createObjectURL(blob),
      isVoiceMessage: true,
    });
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

    if (!stompConnected) return;
    const hasText = value.trim().length > 0;
    if (hasText && !iAmTypingRef.current) {
      iAmTypingRef.current = true;
      publishTyping(stompClient, channel.id, true);
    } else if (!hasText && iAmTypingRef.current) {
      iAmTypingRef.current = false;
      publishTyping(stompClient, channel.id, false);
    }
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

  function insertEmojiIntoDraft(emoji) {
    const input = draftInputRef.current;
    const caret = input?.selectionStart ?? draft.length;
    const text = draft.slice(0, caret) + emoji + draft.slice(caret);
    setDraft(text);
    setShowDraftEmojiPicker(false);
    const newCaret = caret + emoji.length;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(newCaret, newCaret);
    });
  }

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!stompConnected || sending) return;
    if (!draft.trim() && !pendingImage && !pendingFile) return;

    if (iAmTypingRef.current) {
      iAmTypingRef.current = false;
      publishTyping(stompClient, channel.id, false);
    }

    const pollMatch = POLL_COMMAND_RE.exec(draft.trim());
    if (pollMatch) {
      const question = pollMatch[2].trim();
      if (!question) {
        showAlert("Use: /poll Pergunta da enquete");
        return;
      }
      createPoll(stompClient, channel.id, question, [], pollMatch[1].toLowerCase() === "pollmulti");
      setDraft("");
      return;
    }

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

    const spotifyMatch = SPOTIFY_COMMAND_RE.exec(draft.trim());
    if (spotifyMatch) {
      const targetUsername = spotifyMatch[1];
      let targetUserId = user?.id;
      let targetLabel = "Você";
      if (targetUsername) {
        const target = members.find((m) => m.username.toLowerCase() === targetUsername.toLowerCase());
        if (!target) {
          showAlert(`Não encontrei ninguém com o nome "${targetUsername}" nesse servidor`);
          return;
        }
        targetUserId = target.userId;
        targetLabel = target.nickname || target.username;
      }
      setDraft("");
      setSending(true);
      try {
        const { data } = await api.get(`/api/spotify/now-playing/${targetUserId}`);
        if (!data.connected) {
          showAlert(
            targetUsername
              ? `${targetLabel} não conectou a conta do Spotify`
              : "Você ainda não conectou sua conta do Spotify (Configurações > Conexões)"
          );
          return;
        }
        if (!data.playing) {
          showAlert(`${targetLabel} não está ouvindo nada no Spotify agora`);
          return;
        }
        const text = `🎵 **${targetLabel}** está ouvindo **${data.trackName}** — ${data.artistNames}${
          data.albumName ? ` (${data.albumName})` : ""
        }${data.trackUrl ? `\n${data.trackUrl}` : ""}`;
        sendChatMessage(stompClient, channel.id, text, data.albumArtUrl, null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || "Não foi possível consultar o Spotify agora");
      } finally {
        setSending(false);
      }
      return;
    }

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

    const filaMatch = FILA_COMMAND_RE.exec(draft.trim());
    if (filaMatch) {
      if (!activeChannel) {
        showAlert("Você precisa estar conectado numa call de voz para ver a fila de música");
        return;
      }
      setDraft("");
      setSending(true);
      try {
        const { data } = await api.post(`/api/channels/${activeChannel.id}/music/queue/open`, {
          name: filaMatch[1]?.trim() || "",
        });
        sendChatMessage(stompClient, channel.id, `[[MUSIC_QUEUE:${activeChannel.id}:${data.queueId}]]`, null, null);
      } catch (err) {
        showAlert(err.response?.data?.error || "Não foi possível abrir a fila de música");
      } finally {
        setSending(false);
      }
      return;
    }

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
      let file = null;
      if (pendingFile) {
        const formData = new FormData();
        formData.append("file", pendingFile.file, pendingFile.name);
        const { data } = await api.post(`/api/channels/${channel.id}/files`, formData);
        file = { url: data.url, name: data.name, type: data.contentType, size: data.size };
      }
      sendChatMessage(stompClient, channel.id, draft.trim(), imageUrl, replyingTo?.id, file);
      setDraft("");
      setReplyingTo(null);
      clearPendingImage();
      clearPendingFile();
    } catch (err) {
      setUploadError(err.response?.data?.error || "Falha ao enviar anexo");
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
    releaseStick();
    const el = messageRefs.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("chat-message-flash");
    setTimeout(() => el.classList.remove("chat-message-flash"), 1200);
  }

  function handleToggleReaction(messageId, emoji) {
    if (!stompConnected) return;
    toggleReaction(stompClient, channel.id, messageId, emoji);
    setReactionPickerFor(null);
  }

  const canPin = myServerPermissions.has("MANAGE_CHANNELS");

  function handleTogglePin(m) {
    if (!stompConnected) return;
    pinMessage(stompClient, channel.id, m.id, !m.pinned);
  }

  function openPinned() {
    setShowSearch(false);
    setShowPinned((prev) => {
      const next = !prev;
      if (next) {
        api.get(`/api/channels/${channel.id}/messages/pinned`).then(({ data }) => setPinnedMessages(data));
      }
      return next;
    });
  }

  function openSearch() {
    setShowPinned(false);
    setShowSearch((prev) => !prev);
  }


  function jumpFromPanel(id) {
    setShowPinned(false);
    setShowSearch(false);
    requestAnimationFrame(() => jumpToMessage(id));
  }

  if (!channel) {
    return (
      <div className="chat-window empty">
        <EmptyState icon={<HashIcon size={30} />} title="ESCOLHE UM CANAL" hint="Pega um canal de texto na lista ao lado pra começar." />
      </div>
    );
  }

  return (
    <div className={"chat-window" + (fileDragging ? " file-dragging" : "")} {...dropProps}>
      {fileDragging && (
        <div className="chat-drop-overlay" aria-hidden="true">
          <div className="chat-drop-card">
            <span className="chat-drop-icon">
              <PlusIcon size={30} />
            </span>
            <strong>SOLTA PRA ENVIAR</strong>
            <span>{`#${channel.name}`}</span>
          </div>
        </div>
      )}
      <div className={"chat-header" + (channel.adminOnly ? " chat-header-announcements" : "")}>
        <MobileBackButton />
        <span className="chat-header-icon" key={`icon-${channel.id}`}>
          {channel.adminOnly ? <MegaphoneIcon size={20} /> : <HashIcon size={20} />}
        </span>
        <div className="chat-header-info" key={channel.id}>
          <h1 className="chat-header-title">{channel.name}</h1>
          <p className="chat-header-subtitle">
            {channel.adminOnly ? "Canal de avisos · só admins postam aqui" : "Canal de texto"}
          </p>
        </div>
        <div className="chat-header-actions">
          <button type="button" className={"icon-btn icon-btn-boxed" + (showPinned ? " icon-btn-active" : "")} onClick={openPinned} title="Mensagens fixadas">
            <PinIcon size={18} />
          </button>
          <button type="button" className={"icon-btn icon-btn-boxed" + (showSearch ? " icon-btn-active" : "")} onClick={openSearch} title="Buscar no histórico">
            <SearchIcon size={18} />
          </button>
          <MembersToggleButton />
        </div>
      </div>

      {showPinned && (
        <div className="chat-side-panel">
          <div className="chat-side-panel-title">Mensagens fixadas</div>
          {pinnedMessages.length === 0 ? (
            <p className="chat-side-panel-empty">Nenhuma mensagem fixada nesse canal ainda.</p>
          ) : (
            pinnedMessages.map((m) => (
              <button type="button" key={m.id} className="chat-side-panel-item" onClick={() => jumpFromPanel(m.id)}>
                <strong>{m.authorUsername}</strong>
                <span>{attachmentSummary(m)}</span>
              </button>
            ))
          )}
        </div>
      )}

      {showSearch && (
        <MessageSearchPanel
          endpoint={`/api/channels/${channel.id}/messages/search`}
          people={members}
          meId={user?.id}
          placeholder="Buscar neste canal… (de:, tem:, antes:, depois:)"
          onJump={jumpFromPanel}
        />
      )}

      {stompError ? (
        <div className="chat-status error">⚠️ {stompError}</div>
      ) : !stompConnected ? (
        <div className="chat-status">Conectando ao chat em tempo real...</div>
      ) : null}
      {uploadError && <div className="chat-status error">⚠️ {uploadError}</div>}
      <div className="chat-messages" key={channel.id} ref={messagesRef} onScroll={onMessagesScroll}>
        {historyLoaded && messages.length === 0 && (
          <EmptyState
            icon={channel.adminOnly ? <MegaphoneIcon size={30} /> : <HashIcon size={30} />}
            tone={channel.adminOnly ? "orange" : "mint"}
            title={`#${channel.name.toUpperCase()} TÁ QUIETINHO`}
            hint={channel.adminOnly ? "Nenhum aviso por aqui ainda." : "Ninguém falou nada ainda. Manda a primeira — ou um /roll pra quebrar o gelo."}
          />
        )}
        {messages.map((m, i) => {
          const grouped = !channel.adminOnly && isGroupedWith(messages[i - 1], m);
          return (
          <Fragment key={m.id}>
          {isNewDay(messages[i - 1], m) && <DaySeparator date={m.createdAt} />}
          <div
            ref={(el) => {
              if (el) messageRefs.current.set(m.id, el);
              else messageRefs.current.delete(m.id);
            }}
            className={
              "chat-message" +
              (grouped ? " grouped" : "") +
              (m.authorId === user?.id ? " mine" : "") +
              (mentionsUser(m.content, user?.username) ? " mentioned" : "") +
              (channel.adminOnly ? " announcement" : "")
            }
          >
            {grouped ? (
              <span className="chat-gutter-time" aria-hidden="true">{new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            ) : (
              <button type="button" className="chat-avatar-btn" onClick={() => openProfile(m.authorId)} title={`Ver perfil de ${m.authorUsername}`}>
                <Avatar name={m.authorUsername} url={m.authorAvatarUrl} className="chat-avatar" />
              </button>
            )}
            <div className="chat-message-body">
              {grouped ? (
                m.editedAt && <span className="chat-edited chat-edited-grouped">(editado)</span>
              ) : (
                <div>
                  <button
                    type="button"
                    className="chat-author"
                    data-tone={toneFor(m.authorUsername)}
                    onClick={() => openProfile(m.authorId)}
                  >
                    {m.authorUsername}
                  </button>
                  <span className="chat-time">{new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  {m.editedAt && <span className="chat-edited">(editado)</span>}
                </div>
              )}

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
                      <span>{attachmentSummary(m.replyTo)}</span>
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
                  ) : m.poll ? (
                    <PollCard poll={m.poll} channelId={channel.id} myUserId={user?.id} stompClient={stompClient} stompConnected={stompConnected} />
                  ) : MUSIC_QUEUE_MARKER_RE.test(m.content || "") ? (
                    <MusicQueueCard
                      channelId={Number(MUSIC_QUEUE_MARKER_RE.exec(m.content)[1])}
                      queueId={MUSIC_QUEUE_MARKER_RE.exec(m.content)[2]}
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
                      customEmojis={customEmojis}
                    />
                  )}
                  {m.content && <LinkPreview text={m.content} />}
                  {m.imageUrl && <ChatImage url={m.imageUrl} onOpen={() => setLightboxImage(m.imageUrl)} />}
                  {m.fileUrl && <AttachmentMessage url={m.fileUrl} name={m.fileName} type={m.fileType} size={m.fileSize} />}

                  {m.reactions?.length > 0 && (
                    <div className="chat-reactions">
                      {m.reactions.map((r) => {
                        const mine = user?.id != null && r.userIds.includes(user.id);
                        const customMatch = /^:([a-z0-9_]{2,30}):$/.exec(r.emoji);
                        const customUrl = customMatch ? customEmojis[customMatch[1]] : null;
                        return (
                          <button
                            type="button"
                            key={r.emoji}
                            className={"chat-reaction" + (mine ? " mine" : "")}
                            onClick={() => handleToggleReaction(m.id, r.emoji)}
                            title={mine ? "Tirar sua reação" : "Reagir"}
                          >
                            {customUrl ? (
                              <img src={customUrl} alt={r.emoji} className="chat-custom-emoji" />
                            ) : (
                              <span>{r.emoji}</span>
                            )}
                            <span className="chat-reaction-count">{r.userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {editingId !== m.id && reactionPickerFor === m.id && (
                <EmojiPicker customEmojis={customEmojiList} onPick={(emoji) => handleToggleReaction(m.id, emoji)} />
              )}
            </div>

            {editingId !== m.id && (
              <div className="chat-message-actions">
                <button
                  className="icon-btn emoji-picker-toggle"
                  onClick={() => setReactionPickerFor((prev) => (prev === m.id ? null : m.id))}
                  title="Reagir"
                >
                  <SmileIcon size={15} />
                </button>
                <button className="icon-btn" onClick={() => startReply(m)} title="Responder">
                  <ReplyIcon size={15} />
                </button>
                {canPin && (
                  <button
                    className={"icon-btn" + (m.pinned ? " icon-btn-active" : "")}
                    onClick={() => handleTogglePin(m)}
                    title={m.pinned ? "Desafixar mensagem" : "Fixar mensagem"}
                  >
                    <PinIcon size={15} />
                  </button>
                )}
                {canModify(m) && (
                  <>
                    {!m.rollNotation && !m.poll && !MUSIC_QUEUE_MARKER_RE.test(m.content || "") && (
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
          </Fragment>
          );
        })}
        {typingUsers.size > 0 && (
          <div className="chat-typing-indicator">
            {[...typingUsers.values()].join(", ")} {typingUsers.size === 1 ? "está" : "estão"} digitando...
          </div>
        )}
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

      {pendingFile && (
        <div className="chat-pending-attachment">
          {pendingFile.type.startsWith("audio/") ? (
            <AudioPlayer src={pendingFile.previewUrl} name={pendingFile.name} compact />
          ) : pendingFile.type.startsWith("video/") ? (
            <video controls src={pendingFile.previewUrl} className="chat-pending-video" />
          ) : (
            <span className="chat-pending-file-icon">📎</span>
          )}
          <div>
            <strong>{pendingFile.isVoiceMessage ? "Enviar essa mensagem de voz?" : "Enviar esse arquivo?"}</strong>
            <p className="admin-hint" style={{ margin: "2px 0 0" }}>
              {pendingFile.name} — pode escrever uma legenda abaixo antes de enviar.
            </p>
          </div>
          <button className="icon-btn icon-btn-danger" onClick={clearPendingFile} title="Cancelar anexo" disabled={sending}>
            <XIcon />
          </button>
        </div>
      )}

      {replyingTo && (
        <div className="chat-replying-bar">
          <ReplyIcon size={13} />
          <span>
            Respondendo a <strong>{replyingTo.authorUsername}</strong>
            {replyingTo.content ? `: ${truncate(replyingTo.content, 80)}` : attachmentSummary(replyingTo) ? `: ${attachmentSummary(replyingTo)}` : ""}
          </span>
          <button type="button" className="icon-btn" onClick={() => setReplyingTo(null)} title="Cancelar resposta">
            <XIcon size={14} />
          </button>
        </div>
      )}

      {channel.adminOnly && !isAdmin ? (
        <div className="chat-readonly-notice">
          <MegaphoneIcon size={15} />
          Só administradores podem postar em #{channel.name}.
        </div>
      ) : (
        <form className={"chat-input" + (recorder.recording ? " is-recording" : "")} onSubmit={handleSend}>
          <input type="file" ref={fileInputRef} onChange={handlePickImage} hidden />
          <button
            type="button"
            className="icon-btn chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!stompConnected || sending || recorder.recording}
            title="Enviar arquivo"
          >
            <PlusIcon size={20} />
          </button>
          <button
            type="button"
            className={"icon-btn chat-record-btn" + (recorder.recording ? " recording" : "")}
            onClick={recorder.recording ? handleStopRecording : handleStartRecording}
            disabled={!stompConnected || sending}
            title={recorder.recording ? "Parar gravação" : "Gravar mensagem de voz"}
          >
            <MicIcon size={18} />
          </button>
          <div className="chat-gif-wrap">
            <button
              type="button"
              className={"icon-btn chat-gif-btn" + (showGifPicker ? " icon-btn-active" : "")}
              onClick={() => setShowGifPicker((v) => !v)}
              disabled={!stompConnected || sending || recorder.recording}
              title="Enviar GIF"
            >
              GIF
            </button>
            {showGifPicker && (
              <GifPicker
                onClose={() => setShowGifPicker(false)}
                onPick={(gif) => {
                  sendChatMessage(stompClient, channel.id, "", gif.url, replyingTo?.id, null);
                  setShowGifPicker(false);
                  setReplyingTo(null);
                }}
              />
            )}
          </div>
          <div className="chat-emoji-btn-wrap">
            <button
              type="button"
              className={"icon-btn chat-emoji-draft-btn emoji-picker-toggle" + (showDraftEmojiPicker ? " icon-btn-active" : "")}
              onClick={() => setShowDraftEmojiPicker((prev) => !prev)}
              disabled={!stompConnected || sending || recorder.recording}
              title="Inserir emoji na mensagem"
            >
              <SmileIcon size={18} />
            </button>
            {showDraftEmojiPicker && (
              <div className="emoji-picker-composer-wrap">
                <EmojiPicker customEmojis={customEmojiList} onPick={insertEmojiIntoDraft} />
              </div>
            )}
          </div>
          {recorder.recording && <RecordingBar recorder={recorder} onStop={handleStopRecording} />}
          <div className="chat-input-field" style={recorder.recording ? { display: "none" } : undefined}>
            {slashMenu && (
              <div className="mention-menu slash-menu">
                {slashMenu.items.map((item, i) => (
                  <button
                    type="button"
                    key={item.key}
                    className={"mention-option slash-option" + (i === slashIndex ? " active" : "")}
                    onMouseDown={(e) => {
                      e.preventDefault();
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
                      e.preventDefault();
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
                pendingImage || pendingFile
                  ? "Adicionar legenda (opcional)..."
                  : sending
                  ? "Enviando..."
                  : `Manda no #${channel.name}… (/roll, /play, /poll)`
              }
              disabled={!stompConnected || sending}
            />
          </div>
          <button type="submit" className="chat-send-btn" disabled={!stompConnected || sending || (!draft.trim() && !pendingImage && !pendingFile)}>
            <span className="chat-send-label">ENVIAR</span> <SendIcon size={16} />
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
