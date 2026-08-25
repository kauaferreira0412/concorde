import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { PlusIcon, TrashIcon, XIcon } from "./icons.jsx";

/**
 * Gerencia os emojis customizados do SERVIDOR (ver CustomEmojiController/CustomEmoji no
 * backend) - visiveis e usaveis por qualquer membro (:nome: no chat, ou como reacao), mas so'
 * quem tem MANAGE_SERVER pode subir/apagar. Nome vira minusculo automaticamente (mesma regra
 * do backend: 2-30 letras/numeros/underscore).
 */
export default function CustomEmojiModal({ server, onClose }) {
  const [emojis, setEmojis] = useState(null); // null = carregando
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/servers/${server.id}/emojis`)
      .then(({ data }) => {
        if (!cancelled) setEmojis(data);
      })
      .catch(() => {
        if (!cancelled) setEmojis([]);
      });
    return () => {
      cancelled = true;
    };
  }, [server.id]);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!name.trim()) {
      setError("Escreva o nome do emoji antes de escolher a imagem");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name.trim());
      const { data } = await api.post(`/api/servers/${server.id}/emojis`, formData);
      setEmojis((prev) => [...(prev || []), data].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível criar esse emoji");
    } finally {
      setUploading(false);
    }
  }

  async function remove(emoji) {
    try {
      await api.delete(`/api/servers/${server.id}/emojis/${emoji.id}`);
      setEmojis((prev) => (prev || []).filter((e) => e.id !== emoji.id));
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível apagar esse emoji");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="settings-modal-header">
          <h2>Emojis - {server.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <div className="settings-content" style={{ padding: "16px 22px" }}>
          <p className="admin-hint" style={{ marginTop: 0 }}>
            Use <code className="chat-inline-code">:nome:</code> no chat, ou nas reações. Visível pra todo mundo do
            servidor.
          </p>

          <div className="emoji-upload-row">
            <input
              placeholder="nome_do_emoji"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              maxLength={30}
            />
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" ref={fileInputRef} onChange={handleFileChosen} hidden />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || !name.trim()}>
              {uploading ? "Enviando..." : "Escolher imagem"}
            </button>
          </div>

          {error && <p className="auth-error">{error}</p>}

          {emojis === null ? (
            <p className="admin-hint">Carregando...</p>
          ) : emojis.length === 0 ? (
            <p className="admin-hint">Nenhum emoji customizado ainda.</p>
          ) : (
            <div className="soundboard-grid">
              {emojis.map((emoji) => (
                <div key={emoji.id} className="soundboard-clip">
                  <span className="soundboard-clip-play" title={`:${emoji.name}:`}>
                    <img src={emoji.imageUrl} alt={emoji.name} className="chat-custom-emoji" />
                    <span className="soundboard-clip-name">:{emoji.name}:</span>
                  </span>
                  <button type="button" className="soundboard-clip-remove" onClick={() => remove(emoji)} title="Apagar emoji">
                    <TrashIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
