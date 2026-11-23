import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext.jsx";

export const ADMIN_TABS = ["visao-geral", "usuarios", "acesso", "bots", "terminal"];

/** Foto de perfil de um bot (Melodion / Batera) - mesma lógica pros dois. */
function useBotAvatar(basePath, enabled) {
  const [url, setUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    api
      .get(`${basePath}/settings`)
      .then(({ data }) => setUrl(data.avatarUrl))
      .catch(() => {});
  }, [basePath, enabled]);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post(`${basePath}/avatar`, formData);
      setUrl(data.avatarUrl);
    } catch (err) {
      setError(err.response?.data?.error || "Falha ao enviar a foto");
    } finally {
      setUploading(false);
    }
  }

  return { url, uploading, error, inputRef, handleChange };
}

export function useAdminContainer() {
  const { hasAdminPanel: isAdmin, isAdmin: hasAdminRole, hasTerminal, user: currentUser } = useAuth();
  // cache antigo do localStorage ainda sem a flag: espera o /api/users/me antes de expulsar
  const panelPending = hasAdminRole && currentUser?.adminPanel === undefined;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("aba");
  const tab =
    ADMIN_TABS.includes(tabParam) && (tabParam !== "terminal" || hasTerminal) ? tabParam : "visao-geral";

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [servers, setServers] = useState([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const [userQuery, setUserQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [showCreate, setShowCreate] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createOk, setCreateOk] = useState(null);

  const [grantUserId, setGrantUserId] = useState("");
  const [grantServerId, setGrantServerId] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState(null);

  const musicBot = useBotAvatar("/api/music-bot", isAdmin);
  const soundboardBot = useBotAvatar("/api/soundboard-bot", isAdmin);

  useEffect(() => {
    if (!isAdmin) return;
    reloadUsers();
    api
      .get("/api/servers")
      .then(({ data }) => setServers(data))
      .finally(() => setServersLoading(false));
  }, [isAdmin]);

  function reloadUsers() {
    return api
      .get("/api/admin/users")
      .then(({ data }) => setUsers(data))
      .finally(() => setUsersLoading(false));
  }

  function goToTab(next, extraParams = {}) {
    setSearchParams({ aba: next, ...extraParams }, { replace: false });
  }

  const stats = useMemo(() => {
    const admins = users.filter((u) => u.role === "ADMIN").length;
    return {
      totalUsers: users.length,
      admins,
      panelAdmins: users.filter((u) => u.role === "ADMIN" && u.adminPanel).length,
      regularUsers: users.length - admins,
      servers: servers.length,
      rpgServers: servers.filter((s) => s.type === "RPG").length,
    };
  }, [users, servers]);

  const recentUsers = useMemo(() => [...users].sort((a, b) => b.id - a.id).slice(0, 5), [users]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users
      .filter((u) => roleFilter === "ALL" || u.role === roleFilter)
      .filter(
        (u) =>
          !q ||
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.nickname?.toLowerCase().includes(q)
      )
      .sort((a, b) => (a.role === b.role ? a.username.localeCompare(b.username) : a.role === "ADMIN" ? -1 : 1));
  }, [users, userQuery, roleFilter]);

  const grantableUsers = useMemo(
    () => users.filter((u) => u.role !== "ADMIN").sort((a, b) => a.username.localeCompare(b.username)),
    [users]
  );

  function openCreate() {
    setCreateError("");
    setCreateOk(null);
    setShowCreate(true);
    if (tab !== "usuarios") goToTab("usuarios");
  }

  async function handleCreateUser(e) {
    e.preventDefault();
    setCreateError("");
    setCreateOk(null);
    setCreating(true);
    try {
      const { data } = await api.post("/api/admin/users", {
        username: newUsername,
        email: newEmail,
        password: newPassword,
      });
      setCreateOk(data);
      setNewUsername("");
      setNewEmail("");
      setNewPassword("");
      reloadUsers();
    } catch (err) {
      setCreateError(err.response?.data?.error || "Falha ao criar usuário");
    } finally {
      setCreating(false);
    }
  }

  function startGrantFor(user) {
    setGrantUserId(String(user.id));
    setGrantServerId("");
    setGrantResult(null);
    goToTab("acesso");
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
    setGrantResult(null);
    if (!grantUserId || !grantServerId) return;
    const user = users.find((u) => String(u.id) === grantUserId);
    const server = servers.find((s) => String(s.id) === grantServerId);
    setGranting(true);
    try {
      await api.post(`/api/admin/servers/${grantServerId}/members`, { userId: Number(grantUserId) });
      setGrantResult({
        ok: true,
        message: `${user?.username ?? "Usuário"} agora tem acesso a ${server?.name ?? "o servidor"}.`,
      });
      setGrantServerId("");
    } catch (err) {
      setGrantResult({ ok: false, message: err.response?.data?.error || "Falha ao liberar acesso" });
    } finally {
      setGranting(false);
    }
  }

  return {
    isAdmin,
    hasTerminal,
    panelPending,
    currentUser,
    tab,
    goToTab,
    users,
    usersLoading,
    servers,
    serversLoading,
    stats,
    recentUsers,
    filteredUsers,
    grantableUsers,
    userQuery,
    setUserQuery,
    roleFilter,
    setRoleFilter,
    showCreate,
    setShowCreate,
    openCreate,
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
    creating,
    createError,
    createOk,
    grantUserId,
    setGrantUserId,
    grantServerId,
    setGrantServerId,
    granting,
    grantResult,
    setGrantResult,
    startGrantFor,
    musicBot,
    soundboardBot,
    handleCreateUser,
    handleUserSaved,
    handleConfirmDelete,
    handleGrantAccess,
  };
}
