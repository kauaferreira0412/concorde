import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import {
  subscribeToDm,
  sendDmMessage,
  editDmMessage,
  deleteDmMessage,
  rollDiceDm,
  toggleDmReaction,
  pinDmMessage,
  publishDmTyping,
  subscribeToDmTyping,
} from "../ws/chatSocket";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import Avatar from "./Avatar.jsx";
import MessageText from "./MessageText.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import DiceRollCard from "./DiceRollCard.jsx";
import EmojiPicker from "./EmojiPicker.jsx";
import { CheckIcon, PencilIcon, PinIcon, PlusIcon, ReplyIcon, SearchIcon, SmileIcon, TrashIcon, XIcon } from "./icons.jsx";

const ROLL_COMMAND_RE = /^\/(?:roll|r)\s+(.+)$/i;
const ROLL_NOTATION_RE = /^(\d{0,2})d(\d{1,3})\s*([+-]\s*\d{1,3})?$/i;

/**
 * Chat PRIVADO (DM) - mesmo "esqueleto"/classes CSS do ChatWindow.jsx (chat de servidor), com o
 * mesmo conjunto essencial de recursos (texto, imagem, editar/apagar, responder, reações, fixar,
 * "digitando...", busca, /roll) - pedido explicito do usuario: "os chats devem ter as mesmas
 * características dos chats dos servidores". Fora do escopo de proposito (nao fazem sentido numa
 * conversa 1:1 ou nao foram pedidos): @mencao, emoji customizado de servidor, enquete, fila de
 * música, /play e afins. Arquivo SEPARADO do ChatWindow (nao compartilha estado/efeitos) pelo
 * mesmo motivo de Melodion/Batera serem bots separados nesta base - menor risco de mexer no chat
 * de servidor que já funciona, ver DirectMessageService no backend pro espelho do lado da API.
 */
export default function DmChatWindow({ channel, stompClient, stompConnected, stompError }) {
  const { user } = useAuth();
  const { openProfile } = useProfile();
  const { showAlert } = useAlert();

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
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

  const channelId = channel?.channelId;

  useEffect(() => {
    if (!channelId) return;
    setMessages([]);
    setEditingId(null);
    setReplyingTo(null);
    setShowPinned(false);
    setPinnedMessages([]);
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
    setTypingUsers(new Map());
    clearPendingImage();
    api.get(`/api/dm/channels/${channelId}/messages`).then(({ data }) => setMessages(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (!channelId || !stompClient || !stompConnected) return;
    const sub = subscribeToDm(stompClient, channelId, (event) => {
      if (event.type === "CREATED") {
        setMessages((prev) => [...prev, event.message]);
      } else if (event.type === "UPDATED") {
        setMessages((prev) => prev.map((m) => (m.id === event.message.id ? event.message : m)));
      } else if (event.type === "DELETED") {
        setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
      }
    });
    return () => sub.unsubscribe();
  }, [channelId, stompClient, stompConnected]);

  useEffect(() => {
    if (!channelId || !stompClient || !stompConnected) return;
    const timers = typingTimersRef.current;
    const sub = subscribeToDmTyping(stompClient, channelId, (event) => {
      if (event.userId === user?.id) return;
      clearTimeout(timers.get(event.userId));
      if (event.typing) {
        setTypingUsers((prev) => new Map(prev).set(event.userId, event.username));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, stompClient, stompConnected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  function handleDraftChange(e) {
    const value = e.target.value;
    setDraft(value);
    if (!stompConnected) return;
    const hasText = value.trim().length > 0;
    if (hasText && !iAmTypingRef.current) {
      iAmTypingRef.current = true;
      publishDmTyping(stompClient, channelId, true);
    } else if (!hasText && iAmTypingRef.current) {
      iAmTypingRef.current = false;
      publishDmTyping(stompClient, channelId, false);
    }
  }

  function handleDraftKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!stompConnected || sending) return;
    if (!draft.trim() && !pendingImage) return;

    if (iAmTypingRef.current) {
      iAmTypingRef.current = false;
      publishDmTyping(stompClient, channelId, false);
    }

    const rollMatch = ROLL_COMMAND_RE.exec(draft.trim());
    if (rollMatch) {
      const notation = rollMatch[1].trim();
      if (!ROLL_NOTATION_RE.test(notation)) {
        showAlert("Notação de dado inválida. Use algo como: /roll 2d20+5, /roll d6 ou /roll 1d100-2");
        return;
      }
      rollDiceDm(stompClient, channelId, notation);
      setDraft("");
      return;
    }

    setUploadError("");
    setSending(true);
    try {
      let imageUrl = null;
      if (pendingImage) {
        const formData = new FormData();
        formData.append("file", pendingImage.file);
        const { data } = await api.post(`/api/dm/channels/${channelId}/attachments`, formData);
        imageUrl = data.url;
      }
      sendDmMessage(stompClient, channelId, draft.trim(), imageUrl, replyingTo?.id);
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
    return m.authorId === user?.id;
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
    editDmMessage(stompClient, channelId, m.id, editingText.trim());
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

  function handleToggleReaction(messageId, emoji) {
    if (!stompConnected) return;
    toggleDmReaction(stompClient, channelId, messageId, emoji);
    setReactionPickerFor(null);
  }

  function handleTogglePin(m) {
    if (!stompConnected) return;
    pinDmMessage(stompClient, channelId, m.id, !m.pinned);
  }

  function openPinned() {
    setShowSearch(false);
    setShowPinned((prev) => {
      const next = !prev;
      if (next) {
        api.get(`/api/dm/channels/${channelId}/messages/pinned`).then(({ data }) => setPinnedMessages(data));
      }
      return next;
    });
  }

  function openSearch() {
    setShowPinned(false);
    setShowSearch((prev) => !prev);
  }

  useEffect(() => {
    if (!showSearch || !channelId) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      api
        .get(`/api/dm/channels/${channelId}/messages/search`, { params: { q: searchQuery.trim() } })
        .then(({ data }) => setSearchResults(data))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery, showSearch, channelId]);

  function jumpFromPanel(id) {
    setShowPinned(false);
    setShowSearch(false);
    requestAnimationFrame(() => jumpToMessage(id));
  }

  const emptyCustomEmojis = useMemo(() => [], []);

  if (!channel) {
    return <div className="chat-window empty">Selecione uma conversa</div>;
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button type="button" className="chat-header-dm-user" onClick={() => openProfile(channel.otherUserId)}>
          <Avatar name={channel.otherUsername} url={channel.otherAvatarUrl} className="chat-header-dm-avatar" />
          <span className="chat-header-name">{channel.otherNickname || channel.otherUsername}</span>
        </button>
        <div className="chat-header-actions">
          <button type="button" className={"icon-btn" + (showPinned ? " icon-btn-active" : "")} onClick={openPinned} title="Mensagens fixadas">
            <PinIcon size={16} />
          </button>
          <button type="button" className={"icon-btn" + (showSearch ? " icon-btn-active" : "")} onClick={openSearch} title="Buscar no histórico">
            <SearchIcon size={16} />
          </button>
        </div>
      </div>

      {showPinned && (
        <div className="chat-side-panel">
          <div className="chat-side-panel-title">Mensagens fixadas</div>
          {pinnedMessages.length === 0 ? (
            <p className="chat-side-panel-empty">Nenhuma mensagem fixada nessa conversa ainda.</p>
          ) : (
            pinnedMessages.map((m) => (
              <button type="button" key={m.id} className="chat-side-panel-item" onClick={() => jumpFromPanel(m.id)}>
                <strong>{m.authorUsername}</strong>
                <span>{m.content || (m.imageUrl ? "🖼️ Imagem" : "")}</span>
              </button>
            ))
          )}
        </div>
      )}

      {showSearch && (
        <div className="chat-side-panel">
          <input
            autoFocus
            className="chat-side-panel-search"
            placeholder="Buscar mensagens nessa conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searching ? (
            <p className="chat-side-panel-empty">Buscando...</p>
          ) : searchQuery.trim() && searchResults.length === 0 ? (
            <p className="chat-side-panel-empty">Nada encontrado.</p>
          ) : (
            searchResults.map((m) => (
              <button type="button" key={m.id} className="chat-side-panel-item" onClick={() => jumpFromPanel(m.id)}>
                <strong>{m.authorUsername}</strong>
                <span>{m.content || (m.imageUrl ? "🖼️ Imagem" : "")}</span>
              </button>
            ))
          )}
        </div>
      )}

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
            className="chat-message"
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
                    <DiceRollCard notation={m.rollNotation} sides={m.rollSides} resultsCsv={m.rollResultsCsv} total={m.rollTotal} />
                  ) : (
                    <MessageText content={m.content} openProfile={openProfile} />
                  )}
                  {m.imageUrl && (
                    <button type="button" className="chat-image-btn" onClick={() => setLightboxImage(m.imageUrl)}>
                      <img src={m.imageUrl} alt="Imagem enviada no chat" className="chat-image" />
                    </button>
                  )}

                  {m.reactions?.length > 0 && (
                    <div className="chat-reactions">
                      {m.reactions.map((r) => {
                        const mine = user?.id != null && r.userIds.includes(user.id);
                        return (
                          <button
                            type="button"
                            key={r.emoji}
                            className={"chat-reaction" + (mine ? " mine" : "")}
                            onClick={() => handleToggleReaction(m.id, r.emoji)}
                            title={mine ? "Tirar sua reação" : "Reagir"}
                          >
                            <span>{r.emoji}</span>
                            <span className="chat-reaction-count">{r.userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {editingId !== m.id && reactionPickerFor === m.id && (
                <EmojiPicker customEmojis={emptyCustomEmojis} onPick={(emoji) => handleToggleReaction(m.id, emoji)} />
              )}
            </div>

            {editingId !== m.id && (
              <div className="chat-message-actions">
                <button
                  className="icon-btn"
                  onClick={() => setReactionPickerFor((prev) => (prev === m.id ? null : m.id))}
                  title="Reagir"
                >
                  <SmileIcon size={15} />
                </button>
                <button className="icon-btn" onClick={() => startReply(m)} title="Responder">
                  <ReplyIcon size={15} />
                </button>
                <button
                  className={"icon-btn" + (m.pinned ? " icon-btn-active" : "")}
                  onClick={() => handleTogglePin(m)}
                  title={m.pinned ? "Desafixar mensagem" : "Fixar mensagem"}
                >
                  <PinIcon size={15} />
                </button>
                {canModify(m) && (
                  <>
                    {!m.rollNotation && (
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

      <form className="chat-input" onSubmit={handleSend}>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" ref={fileInputRef} onChange={handlePickImage} hidden />
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
                : `Conversar com ${channel.otherNickname || channel.otherUsername} (**negrito**, *itálico*, /roll 2d20 pra rolar dado, Ctrl+V cola imagem, Shift+Enter quebra linha)`
            }
            disabled={!stompConnected || sending}
          />
        </div>
        <button type="submit" disabled={!stompConnected || sending || (!draft.trim() && !pendingImage)}>
          Enviar
        </button>
      </form>

      {deleteTarget && (
        <ConfirmModal
          title="Apagar mensagem"
          message="Essa ação não pode ser desfeita. Tem certeza que quer apagar esta mensagem?"
          confirmLabel="Apagar"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteDmMessage(stompClient, channelId, deleteTarget.id)}
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
