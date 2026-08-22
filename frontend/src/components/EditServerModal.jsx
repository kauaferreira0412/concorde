import { Fragment, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import Avatar from "./Avatar.jsx";
import ConfirmModal from "./ConfirmModal.jsx";

/**
 * Editar um servidor existente (so' ADMIN ve o botao que abre isso, ver ChannelSidebar.jsx -
 * o backend tambem confere, ver ServerService.updateServer/updateServerIcon). Icone troca na
 * hora ao escolher o arquivo (igual a foto de perfil do usuario); nome/descricao ficam
 * pendentes ate' clicar em Salvar.
 */
export default function EditServerModal({ server, onClose, onUpdate, onDelete }) {
  const [name, setName] = useState(server.name || "");
  const [description, setDescription] = useState(server.description || "");
  const [iconUrl, setIconUrl] = useState(server.iconUrl || "");
  const [iconUploading, setIconUploading] = useState(false);
  const [iconError, setIconError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const iconInputRef = useRef(null);
  const { showAlert } = useAlert();

  // ConfirmModal fecha sozinho assim que onConfirm() e' chamado (nao espera ele terminar, ver
  // ConfirmModal.jsx) - por isso o erro, se der, aparece num alerta em vez de dentro do modal
  // (que ja' nao esta mais na tela quando o "await" resolve). Mesmo padrao de
  // ChannelSidebar.handleConfirmDeleteChannel.
  async function handleConfirmDeleteServer() {
    try {
      await api.delete(`/api/servers/${server.id}`);
      onDelete(server.id);
      onClose();
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível excluir esse servidor");
    }
  }

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
    <Fragment>
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

        <div className="settings-divider" />

        <div className="settings-field">
          <label className="settings-label">Zona de perigo</label>
          <p className="admin-hint" style={{ margin: "0 0 10px" }}>
            Excluir o servidor apaga todos os canais, mensagens e membros dele. Não dá pra
            desfazer.
          </p>
          <button type="button" className="danger" onClick={() => setConfirmingDelete(true)} disabled={saving}>
            Excluir servidor
          </button>
        </div>

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

    {/* Fora do modal-backdrop de cima de proposito - senao os dois "modal-backdrop" ficariam
        aninhados, e um clique no fundo escuro do ConfirmModal borbulharia pro onClick={onClose}
        do backdrop de fora tambem, fechando os dois modais de uma vez em vez de so' o de
        confirmacao. */}
    {confirmingDelete && (
      <ConfirmModal
        title="Excluir servidor"
        message={`Tem certeza que quer excluir "${server.name}"? Todos os canais, mensagens e membros desse servidor serão apagados junto - não dá pra desfazer.`}
        confirmLabel="Excluir"
        danger
        onClose={() => setConfirmingDelete(false)}
        onConfirm={handleConfirmDeleteServer}
      />
    )}
    </Fragment>
  );
}
