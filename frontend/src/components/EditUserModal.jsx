import { useState } from "react";
import api from "../api/client";

export default function EditUserModal({ user, onClose, onSaved }) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { data } = await api.put(`/api/admin/users/${user.id}`, {
        username,
        email,
        role,
        password: password || null,
      });
      onSaved(data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Editar usuário</h2>

        <div className="settings-field">
          <label className="settings-label">Usuário</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        <div className="settings-field">
          <label className="settings-label">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="settings-field">
          <label className="settings-label">Cargo</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="USER">Usuário</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>

        <div className="settings-field">
          <label className="settings-label">Nova senha (opcional)</label>
          <input
            type="password"
            placeholder="Deixe em branco para manter a senha atual"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
