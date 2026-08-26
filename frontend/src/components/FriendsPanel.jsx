import { useEffect, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import { AlertTriangleIcon, BlockIcon, CheckIcon, MessageSquareIcon, TrashIcon, UserIcon, XIcon } from "./icons.jsx";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

const TABS = [
  { key: "online", label: "Online" },
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendentes" },
  { key: "blocked", label: "Bloqueados" },
  { key: "add", label: "Adicionar amigo" },
];

/**
 * Tela de "Amigos" da Home (ver pages/home) - mesmas abas do Discord: quem esta online agora,
 * todo mundo, pedidos pendentes (recebidos + enviados), quem voce bloqueou e o formulario pra
 * mandar um pedido novo por nome de usuario. Clicar num amigo abre o chat privado com ele (ver
 * onOpenDm). Bloquear alguem some com a amizade/pedido pendente dos dois lados na hora (ver
 * FriendshipService.block no backend) - so' quem bloqueou consegue desbloquear depois.
 */
export default function FriendsPanel({ friends, requests, blocked, onSendRequest, onAccept, onDecline, onRemove, onBlock, onUnblock, onOpenDm }) {
  const { showAlert } = useAlert();
  const { openProfile } = useProfile();
  const [tab, setTab] = useState("online");
  const [username, setUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendOk, setSendOk] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);
  const [blockTarget, setBlockTarget] = useState(null);

  // Previa de "quem eu vou adicionar" ANTES de mandar o pedido de verdade - pedido explicito do
  // usuario: ao digitar, aparece um card com a foto/nome de quem foi encontrado. undefined =
  // ainda nao buscou (campo vazio), null = buscou e nao achou ninguem, objeto = achou.
  const [preview, setPreview] = useState(undefined);
  const [previewLoading, setPreviewLoading] = useState(false);

  const onlineFriends = friends.filter((f) => f.status !== "OFFLINE");
  const pendingCount = requests.incoming.length;

  // Busca o usuario pelo nome digitado com um pequeno atraso (nao dispara uma chamada por
  // tecla) - GET /api/users/by-username/<nome> (ver UserProfileController no backend).
  useEffect(() => {
    setSendError("");
    setSendOk("");
    const trimmed = username.trim();
    if (!trimmed) {
      setPreview(undefined);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const handle = setTimeout(() => {
      api
        .get(`/api/users/by-username/${encodeURIComponent(trimmed)}`)
        .then(({ data }) => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [username]);

  async function handleSendRequest(targetUsername) {
    if (sending) return;
    setSendError("");
    setSendOk("");
    setSending(true);
    try {
      await onSendRequest(targetUsername);
      setSendOk(`Pedido enviado para ${targetUsername}.`);
      setUsername("");
    } catch (err) {
      setSendError(err.response?.data?.error || "Não foi possível enviar o pedido");
    } finally {
      setSending(false);
    }
  }

  function renderFriendRow(f) {
    return (
      <div key={f.userId} className="friend-row">
        <button type="button" className="friend-row-main" onClick={() => onOpenDm(f)}>
          <span className="member-avatar-wrap">
            <Avatar name={f.username} url={f.avatarUrl} className="voice-avatar" />
            <span className={"status-dot " + (STATUS_DOT_CLASS[f.status] || "offline")} title={STATUS_LABEL[f.status]} />
          </span>
          <span className="friend-row-info">
            <strong>{f.nickname || f.username}</strong>
            <span className="friend-row-status">{STATUS_LABEL[f.status] || "Offline"}</span>
          </span>
        </button>
        <div className="friend-row-actions">
          <button type="button" className="icon-btn" title="Ver perfil" onClick={() => openProfile(f.userId)}>
            <UserIcon size={16} />
          </button>
          <button type="button" className="icon-btn" title="Mandar mensagem" onClick={() => onOpenDm(f)}>
            <MessageSquareIcon size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Bloquear usuário" onClick={() => setBlockTarget(f)}>
            <BlockIcon size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Desfazer amizade" onClick={() => setRemoveTarget(f)}>
            <TrashIcon size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-panel">
      <div className="friends-panel-tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={"friends-panel-tab" + (tab === t.key ? " active" : "") + (t.key === "add" ? " add" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "pending" && pendingCount > 0 && <span className="friends-panel-tab-badge">{pendingCount}</span>}
          </button>
        ))}
      </div>

      <div className="friends-panel-body">
        {tab === "add" && (
          <div className="friends-add-form">
            <label htmlFor="friend-username">ADICIONAR AMIGO</label>
            <p className="admin-hint" style={{ margin: "0 0 10px" }}>
              Você pode adicionar amigos pelo nome de usuário do Concorde.
            </p>
            <div className="friends-add-row">
              <input
                id="friend-username"
                placeholder="Digite o nome de usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            {previewLoading ? (
              <p className="friends-panel-empty" style={{ margin: "12px 0 0" }}>
                Procurando...
              </p>
            ) : preview === null ? (
              <div className="friends-alert error">
                <AlertTriangleIcon size={16} className="friends-alert-icon" />
                <span>Não existe usuário com esse nome.</span>
              </div>
            ) : preview ? (
              <div className="friends-preview-card">
                <Avatar name={preview.username} url={preview.avatarUrl} className="voice-avatar" />
                <span className="friends-preview-info">
                  <strong>{preview.nickname || preview.username}</strong>
                  {preview.nickname && <span>@{preview.username}</span>}
                </span>
                <button type="button" onClick={() => handleSendRequest(preview.username)} disabled={sending}>
                  {sending ? "Enviando..." : "Adicionar"}
                </button>
              </div>
            ) : null}

            {sendError && (
              <div className="friends-alert error">
                <AlertTriangleIcon size={16} className="friends-alert-icon" />
                <span>{sendError}</span>
              </div>
            )}
            {sendOk && (
              <div className="friends-alert success">
                <CheckIcon size={16} className="friends-alert-icon" />
                <span>{sendOk}</span>
              </div>
            )}
          </div>
        )}

        {tab === "pending" && (
          <>
            {requests.incoming.length === 0 && requests.outgoing.length === 0 ? (
              <p className="friends-panel-empty">Nenhum pedido de amizade pendente.</p>
            ) : (
              <>
                {requests.incoming.length > 0 && (
                  <>
                    <p className="friends-panel-section-title">RECEBIDOS — {requests.incoming.length}</p>
                    {requests.incoming.map((r) => (
                      <div key={r.userId} className="friend-row">
                        <div className="friend-row-main" style={{ cursor: "default" }}>
                          <Avatar name={r.username} url={r.avatarUrl} className="voice-avatar" />
                          <span className="friend-row-info">
                            <strong>{r.nickname || r.username}</strong>
                            <span className="friend-row-status">Quer ser seu amigo</span>
                          </span>
                        </div>
                        <div className="friend-row-actions">
                          <button type="button" className="icon-btn" title="Aceitar" onClick={() => onAccept(r.userId)}>
                            <CheckIcon size={16} />
                          </button>
                          <button type="button" className="icon-btn icon-btn-danger" title="Recusar" onClick={() => onDecline(r.userId)}>
                            <XIcon size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {requests.outgoing.length > 0 && (
                  <>
                    <p className="friends-panel-section-title">ENVIADOS — {requests.outgoing.length}</p>
                    {requests.outgoing.map((r) => (
                      <div key={r.userId} className="friend-row">
                        <div className="friend-row-main" style={{ cursor: "default" }}>
                          <Avatar name={r.username} url={r.avatarUrl} className="voice-avatar" />
                          <span className="friend-row-info">
                            <strong>{r.nickname || r.username}</strong>
                            <span className="friend-row-status">Pedido enviado - aguardando</span>
                          </span>
                        </div>
                        <div className="friend-row-actions">
                          <button type="button" className="icon-btn icon-btn-danger" title="Cancelar pedido" onClick={() => onDecline(r.userId)}>
                            <XIcon size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        {tab === "blocked" &&
          (blocked.length === 0 ? (
            <p className="friends-panel-empty">Você não bloqueou ninguém.</p>
          ) : (
            <>
              <p className="friends-panel-section-title">BLOQUEADOS — {blocked.length}</p>
              {blocked.map((b) => (
                <div key={b.userId} className="friend-row">
                  <div className="friend-row-main" style={{ cursor: "default" }}>
                    <Avatar name={b.username} url={b.avatarUrl} className="voice-avatar" />
                    <span className="friend-row-info">
                      <strong>{b.nickname || b.username}</strong>
                      <span className="friend-row-status">Bloqueado</span>
                    </span>
                  </div>
                  <div className="friend-row-actions">
                    <button type="button" className="icon-btn" title="Desbloquear" onClick={() => onUnblock(b.userId)}>
                      <BlockIcon size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          ))}

        {tab === "online" &&
          (onlineFriends.length === 0 ? (
            <p className="friends-panel-empty">Ninguém online agora.</p>
          ) : (
            <>
              <p className="friends-panel-section-title">ONLINE — {onlineFriends.length}</p>
              {onlineFriends.map(renderFriendRow)}
            </>
          ))}

        {tab === "all" &&
          (friends.length === 0 ? (
            <p className="friends-panel-empty">
              Você ainda não tem nenhum amigo. Use "Adicionar amigo" pra mandar seu primeiro pedido.
            </p>
          ) : (
            <>
              <p className="friends-panel-section-title">TODOS OS AMIGOS — {friends.length}</p>
              {friends.map(renderFriendRow)}
            </>
          ))}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Desfazer amizade"
          message={`Tem certeza que quer remover ${removeTarget.nickname || removeTarget.username} da sua lista de amigos?`}
          confirmLabel="Remover"
          danger
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => onRemove(removeTarget.userId).catch((err) => showAlert(err.response?.data?.error || "Falha ao remover"))}
        />
      )}
      {blockTarget && (
        <ConfirmModal
          title="Bloquear usuário"
          message={`Bloquear ${blockTarget.nickname || blockTarget.username} desfaz a amizade e impede pedido/mensagem novos dos dois lados. Você pode desbloquear depois na aba "Bloqueados".`}
          confirmLabel="Bloquear"
          danger
          onClose={() => setBlockTarget(null)}
          onConfirm={() => onBlock(blockTarget.userId).catch((err) => showAlert(err.response?.data?.error || "Falha ao bloquear"))}
        />
      )}
    </div>
  );
}
