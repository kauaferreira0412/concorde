import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import Avatar from "../components/Avatar.jsx";
import EditUserModal from "../components/EditUserModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { PencilIcon, TrashIcon } from "../components/icons.jsx";

/**
 * Painel do ADMIN: criar contas de usuario (nao existe cadastro publico) e
 * liberar o acesso de um usuario a um servidor especifico.
 */
export default function AdminPage() {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [createOk, setCreateOk] = useState("");

  const [grantUserId, setGrantUserId] = useState("");
  const [grantServerId, setGrantServerId] = useState("");
  const [grantMsg, setGrantMsg] = useState("");

  // Foto de perfil do bot de musica ("Melodion", ver MusicController/music-bot/index.js) -
  // afeta como ele aparece em QUALQUER call de qualquer servidor, por isso fica so' aqui no
  // painel do admin (nao e' uma configuracao "por servidor").
  const [botAvatarUrl, setBotAvatarUrl] = useState(null);
  const [botAvatarUploading, setBotAvatarUploading] = useState(false);
  const [botAvatarError, setBotAvatarError] = useState("");
  const botAvatarInputRef = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;
    reloadUsers();
    api.get("/api/servers").then(({ data }) => setServers(data));
    api.get("/api/music-bot/settings").then(({ data }) => setBotAvatarUrl(data.avatarUrl));
  }, [isAdmin]);

  async function handleBotAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBotAvatarError("");
    setBotAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/api/music-bot/avatar", formData);
      setBotAvatarUrl(data.avatarUrl);
    } catch (err) {
      setBotAvatarError(err.response?.data?.error || "Falha ao enviar a foto");
    } finally {
      setBotAvatarUploading(false);
    }
  }

  function reloadUsers() {
    api.get("/api/admin/users").then(({ data }) => setUsers(data));
  }

  if (!isAdmin) {
    return <Navigate to="/servers" replace />;
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError("");
    setCreateOk("");
    try {
      const { data } = await api.post("/api/admin/users", {
        username: newUsername,
        email: newEmail,
        password: newPassword,
      });
      setCreateOk(`Usuário "${data.username}" criado. Agora libere acesso a um servidor abaixo.`);
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      reloadUsers();
    } catch (err) {
      setCreateError(err.response?.data?.error || "Falha ao criar usuário");
    }
  }

  function handleUserSaved(updated) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  async function handleConfirmDelete() {
    if (!deletingUser) return;
    setDeleteError("");
    try {
      await api.delete(`/api/admin/users/${deletingUser.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
    } catch (err) {
      setDeleteError(err.response?.data?.error || "Falha ao excluir usuário");
    }
  }

  async function handleGrantAccess(e) {
    e.preventDefault();
    setGrantMsg("");
    if (!grantUserId || !grantServerId) return;
    try {
      await api.post(`/api/admin/servers/${grantServerId}/members`, { userId: Number(grantUserId) });
      setGrantMsg("Acesso liberado com sucesso.");
    } catch (err) {
      setGrantMsg(err.response?.data?.error || "Falha ao liberar acesso");
    }
  }

  return (
    <div className="admin-screen">
      <div className="admin-topbar">
        <strong>Painel do administrador</strong>
        <Link to="/servers" className="link-btn">
          Voltar para o chat
        </Link>
      </div>

      <div className="admin-grid">
        <form className="admin-card" onSubmit={handleCreateUser}>
          <h2>Criar usuário</h2>
          <p className="admin-hint">Não existe cadastro público — só você pode criar contas.</p>
          <input placeholder="Usuário" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
          <input placeholder="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <input
            placeholder="Senha inicial (mín. 6 caracteres)"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {createError && <p className="auth-error">{createError}</p>}
          {createOk && <p className="admin-success">{createOk}</p>}
          <button type="submit">Criar usuário</button>
        </form>

        <div className="admin-card">
          <h2>Bot de música (Melodion)</h2>
          <p className="admin-hint">Foto de perfil dele em qualquer call, de qualquer servidor.</p>
          <div className="avatar-picker">
            <Avatar name="Melodion" url={botAvatarUrl} className="avatar-picker-preview" />
            <div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                ref={botAvatarInputRef}
                onChange={handleBotAvatarChange}
                hidden
              />
              <button type="button" onClick={() => botAvatarInputRef.current?.click()} disabled={botAvatarUploading}>
                {botAvatarUploading ? "Enviando..." : "Trocar foto"}
              </button>
              <p className="admin-hint" style={{ margin: "6px 0 0" }}>
                PNG, JPG, GIF ou WEBP, até 8MB.
              </p>
            </div>
          </div>
          {botAvatarError && <p className="auth-error">{botAvatarError}</p>}
        </div>

        <form className="admin-card" onSubmit={handleGrantAccess}>
          <h2>Liberar acesso a um servidor</h2>
          <p className="admin-hint">Escolha um usuário e um servidor que só você pode ter criado.</p>
          <select value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)}>
            <option value="">Selecione o usuário...</option>
            {users
              .filter((u) => u.role !== "ADMIN")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.email})
                </option>
              ))}
          </select>
          <select value={grantServerId} onChange={(e) => setGrantServerId(e.target.value)}>
            <option value="">Selecione o servidor...</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {grantMsg && <p className={grantMsg.includes("sucesso") ? "admin-success" : "auth-error"}>{grantMsg}</p>}
          <button type="submit">Liberar acesso</button>
        </form>

        <div className="admin-card admin-card-wide">
          <h2>Usuários</h2>
          {deleteError && <p className="auth-error">{deleteError}</p>}
          <table className="admin-table">
            <thead>
              <tr>
                <th></th>
                <th>Usuário</th>
                <th>Email</th>
                <th>Cargo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Avatar name={u.username} url={u.avatarUrl} className="voice-avatar small" />
                  </td>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{u.role === "ADMIN" ? "Administrador" : "Usuário"}</td>
                  <td className="admin-table-actions">
                    <button type="button" className="icon-btn" title="Editar usuário" onClick={() => setEditingUser(u)}>
                      <PencilIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      title={u.id === currentUser?.id ? "Você não pode excluir sua própria conta" : "Excluir usuário"}
                      disabled={u.id === currentUser?.id}
                      onClick={() => {
                        setDeleteError("");
                        setDeletingUser(u);
                      }}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingUser && (
        <EditUserModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={handleUserSaved} />
      )}

      {deletingUser && (
        <ConfirmModal
          title="Excluir usuário"
          message={`Tem certeza que quer excluir "${deletingUser.username}"? A conta e o acesso dela aos servidores serão removidos - não dá pra desfazer.`}
          confirmLabel="Excluir"
          danger
          onClose={() => setDeletingUser(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}
