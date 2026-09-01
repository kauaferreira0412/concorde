import { useEffect, useState } from "react";
import api from "../api/client";
import Avatar from "./Avatar.jsx";
import { LockIcon, XIcon } from "./icons.jsx";

/**
 * "Quem pode ver essa categoria" - restringe uma categoria (e os canais dentro dela) a so' um
 * grupo de membros do servidor, em vez de todo mundo (padrao). Pedido explicito do usuario:
 * separar jogadores de campanhas de RPG diferentes no mesmo servidor, mas vale pra qualquer
 * categoria de qualquer servidor (ver CategoryAccessEntry/ServerService.setCategoryAccess no
 * backend). Ninguem marcado = sem restricao nenhuma (aberta pra todo mundo de novo).
 */
export default function CategoryAccessModal({ server, category, members, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/servers/${server.id}/categories/${category.id}/access`)
      .then(({ data }) => {
        if (!cancelled) setSelected(new Set(data));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, category.id]);

  function toggle(userId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.put(`/api/servers/${server.id}/categories/${category.id}/access`, { userIds: [...selected] });
      onSaved?.(selected.size > 0);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível salvar o acesso dessa categoria");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="settings-modal-header">
          <h2>
            <LockIcon size={16} style={{ marginRight: 6, verticalAlign: -2 }} /> Restringir acesso
          </h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <div className="settings-content" style={{ padding: "16px 22px" }}>
          <p className="admin-hint" style={{ marginTop: 0 }}>
            Marque quem pode ver a categoria <strong>{category.name}</strong> e os canais dentro dela. Ninguém marcado
            = aberta pra todo mundo do servidor (padrão).
          </p>

          {loading ? (
            <p className="admin-hint">Carregando...</p>
          ) : (
            <div className="category-access-list">
              {members.map((m) => (
                <label key={m.userId} className="category-access-row">
                  <input type="checkbox" checked={selected.has(m.userId)} onChange={() => toggle(m.userId)} />
                  <Avatar name={m.username} url={m.avatarUrl} className="voice-avatar small" />
                  <span>{m.nickname || m.username}</span>
                </label>
              ))}
              {members.length === 0 && <p className="admin-hint">Nenhum outro membro nesse servidor ainda.</p>}
            </div>
          )}

          {error && <p className="auth-error">{error}</p>}
        </div>

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
