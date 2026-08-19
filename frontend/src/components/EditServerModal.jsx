import { useRef, useState } from "react";
import api from "../api/client";
import Avatar from "./Avatar.jsx";

/**
 * Editar um servidor existente (so' ADMIN ve o botao que abre isso, ver ChannelSidebar.jsx -
 * o backend tambem confere, ver ServerService.updateServer/updateServerIcon). Icone troca na
 * hora ao escolher o arquivo (igual a foto de perfil do usuario); nome/descricao ficam
 * pendentes ate' clicar em Salvar.
 */
export default function EditServerModal({ server, onClose, onUpdate }) {
  const [name, setName] = useState(server.name || "");
  const [description, setDescription] = useState(server.description || "");
  const [iconUrl, setIconUrl] = useState(server.iconUrl || "");
  const [iconUploading, setIconUploading] = useState(false);
  const [iconError, setIconError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const iconInputRef = useRef(null);

  async function handleIconChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIconError("");
    setIconUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post(`/api/servers/${server.id}/icon`, formData);
      setIconUrl(data.iconUrl);
      onUpdate(data);
    } catch (err) {
      setIconError(err.response?.data?.error || "Falha ao enviar o ícone");
    } finally {
      setIconUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaveError("");
    setSaving(true);
    try {
      const { data } = await api.put(`/api/servers/${server.id}`, {
        name: name.trim(),
        description: description.trim(),
      });
      onUpdate(data);
      onClose();
    } catch (err) {
      setSaveError(err.response?.data?.error || "Não foi possível salvar o servidor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Editar servidor</h2>

        <div className="avatar-picker">
          <Avatar name={server.name} url={iconUrl} className="avatar-picker-preview" />
          <div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              ref={iconInputRef}
              onChange={handleIconChange}
              hidden
            />
            <button type="button" onClick={() => iconInputRef.current?.click()} disabled={iconUploading}>
              {iconUploading ? "Enviando..." : "Trocar ícone"}
            </button>
            <p className="admin-hint" style={{ margin: "6px 0 0" }}>
              PNG, JPG, GIF ou WEBP, até 8MB.
            </p>
          </div>
        </div>
        {iconError && <p className="auth-error">{iconError}</p>}

        <div className="settings-divider" />

        <div className="settings-field">
          <label className="settings-label">Nome do servidor</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </div>

        <div className="settings-field">
          <label className="settings-label">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Do que se trata esse servidor..."
          />
        </div>

        {saveError && <p className="auth-error">{saveError}</p>}

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
