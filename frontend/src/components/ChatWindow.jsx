import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/client";
import { subscribeToChannel, sendChatMessage, editChatMessage, deleteChatMessage } from "../ws/chatSocket";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { useServerMembers } from "../utils/useServerMembers";
import { applyMention, getMentionQuery, mentionsUser } from "../utils/mentions";
import { parseMarkdownBlocks, renderInline } from "../utils/markdown.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import ImageLightbox from "./ImageLightbox.jsx";
import { CheckIcon, MegaphoneIcon, PencilIcon, PlusIcon, ReplyIcon, TrashIcon, XIcon } from "./icons.jsx";

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
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftInputRef = useRef(null);
  const messageRefs = useRef(new Map()); // messageId -> elemento na tela, pra "pular pra" no clique do reply

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return members.filter((m) => m.username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6);
  }, [mentionQuery, members]);

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

  function handleDraftKeyDown(e) {
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
            className={"chat-message" + (mentionsUser(m.content, user?.username) ? " mentioned" : "")}
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
                  <MessageText
                    content={m.content}
                    memberUsernames={memberUsernames}
                    myUsername={user?.username}
                    members={members}
                    openProfile={openProfile}
                  />
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
                    <button className="icon-btn" onClick={() => startEdit(m)} title="Editar mensagem">
                      <PencilIcon size={15} />
                    </button>
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
                  : `Conversar em #${channel.name} (@ pra mencionar, **negrito**, *itálico*, Ctrl+V cola imagem, Shift+Enter quebra linha)`
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
