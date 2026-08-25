import { useState } from "react";

/** Criar OU renomear uma categoria de canais - mesmo formulario simples pros dois casos
 *  (initialName preenchido = editando, vazio = criando, ver ChannelSidebar.jsx). */
export default function CategoryModal({ initialName, onClose, onSave }) {
  const [name, setName] = useState(initialName || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isEditing = Boolean(initialName);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível salvar a categoria");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{isEditing ? "Renomear categoria" : "Criar categoria"}</h2>
        <p className="admin-hint">Agrupe canais de texto e voz relacionados numa pasta, igual o Discord.</p>

        <label className="settings-label">Nome da categoria</label>
        <input
          autoFocus
          placeholder="Ex: Jogos"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "Salvando..." : isEditing ? "Salvar" : "Criar categoria"}
          </button>
        </div>
      </form>
    </div>
  );
}
