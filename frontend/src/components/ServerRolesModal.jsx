import { useEffect, useState } from "react";
import api from "../api/client";
import { useServerMembers } from "../utils/useServerMembers";
import { PencilIcon, TrashIcon, XIcon } from "./icons.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

/** Catalogo fixo de permissoes (bate com ServerPermission.java) - so' o rotulo em
 *  portugues e' definido aqui, o valor em si e' o que o backend espera de volta. */
const PERMISSIONS = [
  { value: "MOVE_MEMBERS", label: "Mover membros entre calls" },
  { value: "MUTE_MEMBERS", label: "Mutar/desmutar membros à força" },
  { value: "DEAFEN_MEMBERS", label: "Ensurdecer/reativar membros à força" },
  { value: "KICK_VOICE", label: "Expulsar da call de voz" },
  { value: "MANAGE_CHANNELS", label: "Gerenciar canais (criar/editar/apagar)" },
  { value: "MANAGE_MEMBERS", label: "Gerenciar membros (remover do servidor, editar apelido)" },
  { value: "MANAGE_ROLES", label: "Gerenciar perfis (criar/editar/atribuir)" },
  { value: "MANAGE_SERVER", label: "Editar dados do servidor (nome, ícone, descrição)" },
];

/** Formulario de criar/editar um Perfil - nome + quais permissoes ele carrega. */
function RoleForm({ initial, onCancel, onSave, saving, error }) {
  const [name, setName] = useState(initial?.name || "");
  const [permissions, setPermissions] = useState(new Set(initial?.permissions || []));

  function togglePermission(value) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div className="settings-field role-form-card">
      <label className="settings-label">Nome do perfil</label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Ex: Moderador" autoFocus />

      <label className="settings-label" style={{ marginTop: 10 }}>
        Permissões
      </label>
      <div className="role-permission-list">
        {PERMISSIONS.map((p) => (
          <label key={p.value} className="settings-checkbox-row">
            <input type="checkbox" checked={permissions.has(p.value)} onChange={() => togglePermission(p.value)} />
            {p.label}
          </label>
        ))}
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="settings-actions">
        <button type="button" className="link-btn" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="button" onClick={() => onSave({ name: name.trim(), permissions: [...permissions] })} disabled={!name.trim() || saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

/**
 * Gerenciar Perfis do servidor (criar/editar/apagar - "roles" no sentido Discord) e
 * atribui-los a membros. So' aparece o botão que abre isso pra quem tem MANAGE_ROLES (ou
 * é dono/ADMIN) - ver ChannelSidebar.jsx. O backend confere a permissão de novo em cada
 * chamada, então mesmo sem o botão aparecer, ninguém sem permissão consegue nada por aqui.
 */
export default function ServerRolesModal({ server, stompClient, stompConnected, onClose }) {
  const [roles, setRoles] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberRoleIds, setMemberRoleIds] = useState(new Set());
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignSaved, setAssignSaved] = useState(false);

  const members = useServerMembers(server.id, stompClient, stompConnected);

  function loadRoles() {
    api
      .get(`/api/servers/${server.id}/roles`)
      .then(({ data }) => setRoles(data))
      .catch((err) => setLoadError(err.response?.data?.error || "Não foi possível carregar os perfis"));
  }

  useEffect(() => {
    loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  useEffect(() => {
    if (!selectedMemberId) {
      setMemberRoleIds(new Set());
      return;
    }
    const member = members.find((m) => String(m.userId) === String(selectedMemberId));
    setMemberRoleIds(new Set(member?.roleIds || []));
    setAssignSaved(false);
  }, [selectedMemberId, members]);

  async function handleCreate(payload) {
    setSaving(true);
    setFormError("");
    try {
      await api.post(`/api/servers/${server.id}/roles`, payload);
      setCreating(false);
      loadRoles();
    } catch (err) {
      setFormError(err.response?.data?.error || "Não foi possível criar o perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(roleId, payload) {
    setSaving(true);
    setFormError("");
    try {
      await api.put(`/api/servers/${server.id}/roles/${roleId}`, payload);
      setEditingRoleId(null);
      loadRoles();
    } catch (err) {
      setFormError(err.response?.data?.error || "Não foi possível salvar o perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/servers/${server.id}/roles/${deleteTarget.id}`);
      setDeleteTarget(null);
      loadRoles();
    } catch (err) {
      setLoadError(err.response?.data?.error || "Não foi possível apagar o perfil");
    }
  }

  function toggleMemberRole(roleId) {
    setAssignSaved(false);
    setMemberRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }

  async function handleSaveAssignment() {
    setAssignSaving(true);
    setAssignError("");
    try {
      await api.put(`/api/servers/${server.id}/members/${selectedMemberId}/roles`, { roleIds: [...memberRoleIds] });
      setAssignSaved(true);
    } catch (err) {
      setAssignError(err.response?.data?.error || "Não foi possível salvar os perfis desse membro");
    } finally {
      setAssignSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        <div className="settings-modal-header">
          <h2>Perfis de {server.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose} title="Fechar">
            <XIcon size={18} />
          </button>
        </div>

        <div className="settings-content" style={{ padding: "20px 24px" }}>
          {loadError && <p className="auth-error">{loadError}</p>}

          <div className="roles-section-card">
            <div>
              <p className="settings-section-title">Perfis existentes</p>
              <p className="admin-hint" style={{ margin: "4px 0 0" }}>
                Cada perfil é um pacote nomeado de permissões - atribua um ou mais a um membro na seção abaixo.
              </p>
            </div>

            {roles.length === 0 && !creating && (
              <p className="admin-hint" style={{ margin: 0 }}>
                Nenhum perfil criado ainda nesse servidor.
              </p>
            )}

            <div className="role-list">
              {roles.map((role) =>
                editingRoleId === role.id ? (
                  <RoleForm
                    key={role.id}
                    initial={role}
                    saving={saving}
                    error={formError}
                    onCancel={() => {
                      setEditingRoleId(null);
                      setFormError("");
                    }}
                    onSave={(payload) => handleUpdate(role.id, payload)}
                  />
                ) : (
                  <div key={role.id} className="role-row">
                    <span className="role-row-name">{role.name}</span>
                    <span className="role-row-count">{role.permissions.length} permissões</span>
                    <button type="button" className="icon-btn" onClick={() => setEditingRoleId(role.id)} title="Editar perfil">
                      <PencilIcon size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      onClick={() => setDeleteTarget(role)}
                      title="Apagar perfil"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                )
              )}
            </div>

            {creating ? (
              <RoleForm
                saving={saving}
                error={formError}
                onCancel={() => {
                  setCreating(false);
                  setFormError("");
                }}
                onSave={handleCreate}
              />
            ) : (
              <button type="button" className="link-btn" onClick={() => setCreating(true)} style={{ marginTop: 2 }}>
                + Criar novo perfil
              </button>
            )}
          </div>

          <div className="roles-section-card">
            <p className="settings-section-title">Atribuir perfis a um membro</p>
            <div className="settings-field">
              <label className="settings-label">Membro</label>
              <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
                <option value="">Escolha um membro...</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.nickname || m.username}
                  </option>
                ))}
              </select>
            </div>

            {selectedMemberId && (
              <>
                <div className="role-permission-list">
                  {roles.length === 0 ? (
                    <p className="admin-hint" style={{ margin: 0 }}>
                      Crie um perfil primeiro pra poder atribuir.
                    </p>
                  ) : (
                    roles.map((role) => (
                      <label key={role.id} className="settings-checkbox-row">
                        <input
                          type="checkbox"
                          checked={memberRoleIds.has(role.id)}
                          onChange={() => toggleMemberRole(role.id)}
                        />
                        {role.name}
                      </label>
                    ))
                  )}
                </div>
                <div className="settings-inline-save" style={{ marginTop: 4 }}>
                  <button type="button" onClick={handleSaveAssignment} disabled={assignSaving || roles.length === 0}>
                    {assignSaving ? "Salvando..." : "Salvar perfis desse membro"}
                  </button>
                </div>
                {assignSaved && (
                  <p className="admin-hint" style={{ margin: 0, color: "var(--success)" }}>
                    Perfis atualizados.
                  </p>
                )}
                {assignError && <p className="auth-error">{assignError}</p>}
              </>
            )}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Apagar perfil"
          message={`Tem certeza que quer apagar "${deleteTarget.name}"? Quem tinha esse perfil perde as permissões dele na hora.`}
          confirmLabel="Apagar"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
