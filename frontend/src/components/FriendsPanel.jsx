import { useState } from "react";
import { useAlert } from "../context/AlertContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";
import { CheckIcon, MessageSquareIcon, TrashIcon, UserIcon, XIcon } from "./icons.jsx";

const STATUS_LABEL = { ONLINE: "Online", AWAY: "Ausente", DND: "Não perturbe", OFFLINE: "Offline" };
const STATUS_DOT_CLASS = { ONLINE: "online", AWAY: "away", DND: "dnd", OFFLINE: "offline" };

const TABS = [
  { key: "online", label: "Online" },
  { key: "all", label: "Todos" },
  { key: "pending", label: "Pendentes" },
  { key: "add", label: "Adicionar amigo" },
];

/**
 * Tela de "Amigos" da Home (ver pages/home) - mesmas 4 abas do Discord: quem esta online agora,
 * todo mundo, pedidos pendentes (recebidos + enviados) e o formulario pra mandar um pedido novo
 * por nome de usuario. Clicar num amigo abre o chat privado com ele (ver onOpenDm).
 */
export default function FriendsPanel({ friends, requests, onSendRequest, onAccept, onDecline, onRemove, onOpenDm }) {
  const { showAlert } = useAlert();
  const { openProfile } = useProfile();
  const [tab, setTab] = useState("online");
  const [username, setUsername] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendOk, setSendOk] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);

  const onlineFriends = friends.filter((f) => f.status !== "OFFLINE");
  const pendingCount = requests.incoming.length;

  async function handleSendRequest(e) {
    e.preventDefault();
    if (!username.trim() || sending) return;
    setSendError("");
    setSendOk("");
    setSending(true);
    try {
      await onSendRequest(username.trim());
      setSendOk(`Pedido enviado para ${username.trim()}.`);
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
          <button type="button" className="icon-btn icon-btn-danger" title="Remover amigo" onClick={() => setRemoveTarget(f)}>
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
          <form className="friends-add-form" onSubmit={handleSendRequest}>
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
              <button type="submit" disabled={!username.trim() || sending}>
                Enviar pedido
              </button>
            </div>
            {sendError && <p className="auth-error">{sendError}</p>}
            {sendOk && <p className="admin-success">{sendOk}</p>}
          </form>
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
          title="Remover amigo"
          message={`Tem certeza que quer remover ${removeTarget.nickname || removeTarget.username} da sua lista de amigos?`}
          confirmLabel="Remover"
          danger
          onClose={() => setRemoveTarget(null)}
          onConfirm={() => onRemove(removeTarget.userId).catch((err) => showAlert(err.response?.data?.error || "Falha ao remover"))}
        />
      )}
    </div>
  );
}
