import { useEffect, useState } from "react";
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import { CheckIcon, PlusIcon, UsersIcon, XIcon } from "./icons.jsx";

/**
 * Convida um AMIGO (aceito nos chats privados, ver FriendshipService) pra entrar nesse servidor
 * - pedido explicito do usuario: qualquer um pode criar um servidor e dar acesso pros amigos que
 * ja' adicionou, sem precisar do admin global fazer isso manualmente (ver
 * ServerService.inviteFriend, diferente do "conceder acesso" do painel de admin, que aceita
 * QUALQUER usuario sem checar amizade). So' mostra quem ja' e' amigo de verdade - quem quiser
 * convidar alguem que ainda nao e' amigo precisa adicionar como amigo primeiro (ver
 * FriendsPanel.jsx).
 */
export default function InviteFriendsModal({ server, members, onClose }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invitingId, setInvitingId] = useState(null);
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [error, setError] = useState("");

  const memberIds = new Set(members.map((m) => m.userId));

  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/friends")
      .then(({ data }) => {
        if (!cancelled) setFriends(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInvite(friend) {
    setInvitingId(friend.userId);
    setError("");
    try {
      await api.post(`/api/servers/${server.id}/invite-friend`, { userId: friend.userId });
      setInvitedIds((prev) => new Set(prev).add(friend.userId));
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível convidar esse amigo");
    } finally {
      setInvitingId(null);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="settings-modal-header">
          <h2>
            <UsersIcon size={16} style={{ marginRight: 6, verticalAlign: -2 }} /> Convidar amigos
          </h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <div className="settings-content" style={{ padding: "16px 22px" }}>
          <p className="admin-hint" style={{ marginTop: 0 }}>
            Dê acesso a <strong>{server.name}</strong> pra quem já é seu amigo. Ainda não adicionou a pessoa? Adicione
            como amigo primeiro, no painel de Amigos.
          </p>

          {loading ? (
            <p className="admin-hint">Carregando...</p>
          ) : friends.length === 0 ? (
            <p className="admin-hint">Você ainda não tem nenhum amigo adicionado.</p>
          ) : (
            <div className="category-access-list">
              {friends.map((f) => {
                const isMember = memberIds.has(f.userId);
                const justInvited = invitedIds.has(f.userId);
                return (
                  <div key={f.userId} className="category-access-row" style={{ justifyContent: "space-between" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={f.username} url={f.avatarUrl} className="voice-avatar small" />
                      <span>{f.nickname || f.username}</span>
                    </span>
                    {isMember || justInvited ? (
                      <span className="admin-hint" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckIcon size={13} /> {isMember ? "Já é membro" : "Convidado"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: "auto", padding: "5px 10px" }}
                        onClick={() => handleInvite(f)}
                        disabled={invitingId === f.userId}
                      >
                        <PlusIcon size={13} /> {invitingId === f.userId ? "Convidando..." : "Convidar"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
