import { useState } from "react";

export default function CreateServerModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  // "NORMAL" (padrao) ou "RPG" - RPG cria o canal de voz padrao ja' chamado "Sessão" (em vez de
  // "Geral") e libera o kit de RPG desse servidor (mapa de batalha + fichas em PDF nos canais
  // de voz, ver VoiceChannel.jsx) - pedido explicito do usuario, "muito parecido com o Roll20".
  const [type, setType] = useState("NORMAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await onCreate(name.trim(), type);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível criar o servidor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Criar servidor</h2>
        <p className="admin-hint">
          Um servidor novo já vem com um canal de texto "geral" e um canal de voz. Depois use o painel de
          administração para liberar o acesso de usuários a ele.
        </p>

        <label className="settings-label">Nome do servidor</label>
        <input
          autoFocus
          placeholder="Ex: Equipe de Produto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />

        <label className="settings-label" style={{ marginTop: 4 }}>
          Tipo de servidor
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="NORMAL">Comum</option>
          <option value="RPG">RPG</option>
        </select>
        <p className="admin-hint" style={{ margin: 0 }}>
          {type === "RPG"
            ? "O canal de voz padrão já nasce chamado \"Sessão\" - crie categorias e restrinja o acesso pra separar os jogadores de cada campanha. Dentro de uma call, cada canal de voz ganha mapa de batalha (com pins) e upload de fichas em PDF."
            : "Canais de texto e voz normais - sem os recursos extras de RPG."}
        </p>

        {error && <p className="auth-error">{error}</p>}

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || submitting}>
            {submitting ? "Criando..." : "Criar servidor"}
          </button>
        </div>
      </form>
    </div>
  );
}
