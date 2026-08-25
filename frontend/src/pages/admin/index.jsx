import { Link, Navigate } from "react-router-dom";
import Avatar from "../../components/Avatar.jsx";
import EditUserModal from "../../components/EditUserModal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import { PencilIcon, TrashIcon } from "../../components/icons.jsx";
import { useAdminContainer } from "./Container.jsx";
import "./style.css";

export default function AdminPage() {
  const {
    isAdmin,
    currentUser,
    users,
    servers,
    editingUser,
    setEditingUser,
    deletingUser,
    setDeletingUser,
    deleteError,
    setDeleteError,
    newUsername,
    setNewUsername,
    newEmail,
    setNewEmail,
    newPassword,
    setNewPassword,
    createError,
    createOk,
    grantUserId,
    setGrantUserId,
    grantServerId,
    setGrantServerId,
    grantMsg,
    botAvatarUrl,
    botAvatarUploading,
    botAvatarError,
    botAvatarInputRef,
    handleBotAvatarChange,
    batAvatarUrl,
    batAvatarUploading,
    batAvatarError,
    batAvatarInputRef,
    handleBatAvatarChange,
    handleCreateUser,
    handleUserSaved,
    handleConfirmDelete,
    handleGrantAccess,
  } = useAdminContainer();

  if (!isAdmin) {
    return <Navigate to="/servers" replace />;
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

        <div className="admin-card">
          <h2>Bot do soundboard (Batera)</h2>
          <p className="admin-hint">Foto de perfil dele em qualquer call, de qualquer servidor.</p>
          <div className="avatar-picker">
            <Avatar name="Batera" url={batAvatarUrl} className="avatar-picker-preview" />
            <div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                ref={batAvatarInputRef}
                onChange={handleBatAvatarChange}
                hidden
              />
              <button type="button" onClick={() => batAvatarInputRef.current?.click()} disabled={batAvatarUploading}>
                {batAvatarUploading ? "Enviando..." : "Trocar foto"}
              </button>
              <p className="admin-hint" style={{ margin: "6px 0 0" }}>
                PNG, JPG, GIF ou WEBP, até 8MB.
              </p>
            </div>
          </div>
          {batAvatarError && <p className="auth-error">{batAvatarError}</p>}
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
