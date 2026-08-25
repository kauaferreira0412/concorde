import { useEffect, useRef, useState } from "react";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";

export function useAdminContainer() {
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

  function reloadUsers() {
    api.get("/api/admin/users").then(({ data }) => setUsers(data));
  }

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

  return {
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
    handleCreateUser,
    handleUserSaved,
    handleConfirmDelete,
    handleGrantAccess,
  };
}
