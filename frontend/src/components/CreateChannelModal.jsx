import { useState } from "react";

const COPY = {
  VOICE: {
    title: "Criar canal de voz",
    hint: "Canais de voz permitem chamadas com áudio, vídeo e compartilhamento de tela.",
    placeholder: "Ex: Reunião",
  },
  MAP: {
    title: "Criar canal de mapa",
    hint: "Um lugar próprio pra abrir o mapa de batalha (kit de RPG) - o mestre sobe os mapas e controla o que os jogadores veem.",
    placeholder: "Ex: Mapa da masmorra",
  },
  TEXT: {
    title: "Criar canal de texto",
    hint: "Canais de texto são para conversas escritas em tempo real.",
    placeholder: "Ex: geral",
  },
};

export default function CreateChannelModal({ type, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const copy = COPY[type] || COPY.TEXT;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onCreate(name.trim());
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível criar o canal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{copy.title}</h2>
        <p className="admin-hint">{copy.hint}</p>

        <label className="settings-label">Nome do canal</label>
        <input
          autoFocus
          placeholder={copy.placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />

        {error && <p className="auth-error">{error}</p>}

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "Criando..." : "Criar canal"}
          </button>
        </div>
      </form>
    </div>
  );
}
