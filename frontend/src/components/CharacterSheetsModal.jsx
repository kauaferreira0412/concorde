import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import Avatar from "./Avatar.jsx";
import { formatFileSize } from "../utils/fileSize";
import { DownloadIcon, FileIcon, TrashIcon, XIcon } from "./icons.jsx";

/**
 * Fichas de personagem em PDF de uma categoria de RPG (kit de RPG, ver CharacterSheetService no
 * backend - pedido explicito do usuario). Vive na CATEGORIA inteira (a mesa/campanha), nao num
 * canal especifico - todo mundo com acesso aquela categoria ve as fichas de todo mundo, mas so'
 * apaga a PROPRIA (o mestre, dono da categoria, pode apagar qualquer uma).
 */
export default function CharacterSheetsModal({ server, category, onClose }) {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const [sheets, setSheets] = useState(null); // null = carregando
  const [characterName, setCharacterName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const isMaster = category.createdBy === user?.id;

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/servers/${server.id}/categories/${category.id}/sheets`)
      .then(({ data }) => {
        if (!cancelled) setSheets(data);
      })
      .catch(() => {
        if (!cancelled) setSheets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, category.id]);

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Só é possível subir arquivos PDF");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("characterName", characterName.trim());
      const { data } = await api.post(`/api/servers/${server.id}/categories/${category.id}/sheets`, formData);
      setSheets((prev) => [data, ...(prev || [])]);
      setCharacterName("");
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível subir essa ficha");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(sheet) {
    try {
      await api.delete(`/api/servers/${server.id}/categories/${category.id}/sheets/${sheet.id}`);
      setSheets((prev) => (prev || []).filter((s) => s.id !== sheet.id));
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível apagar essa ficha");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="settings-modal-header">
          <h2>Fichas - {category.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <div className="settings-content" style={{ padding: "16px 22px" }}>
          <p className="admin-hint" style={{ marginTop: 0 }}>
            Suba a ficha do seu personagem em PDF. Visível pra todo mundo com acesso a essa categoria - você (ou o
            mestre) pode apagar depois.
          </p>

          <div className="emoji-upload-row">
            <input
              type="text"
              className="emoji-name-input"
              placeholder="Nome do personagem"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              maxLength={60}
            />
            <input type="file" accept="application/pdf,.pdf" ref={fileInputRef} onChange={handleFileChosen} hidden />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "Enviando..." : "Escolher PDF"}
            </button>
          </div>

          {error && <p className="auth-error">{error}</p>}

          {sheets === null ? (
            <p className="admin-hint">Carregando...</p>
          ) : sheets.length === 0 ? (
            <p className="admin-hint">Nenhuma ficha subida ainda.</p>
          ) : (
            <div className="character-sheet-list">
              {sheets.map((sheet) => (
                <div key={sheet.id} className="character-sheet-row">
                  <FileIcon size={20} className="character-sheet-icon" />
                  <div className="character-sheet-info">
                    <strong>{sheet.characterName}</strong>
                    <span>
                      <Avatar name={sheet.ownerUsername} url={sheet.ownerAvatarUrl} className="voice-avatar small" />
                      {sheet.ownerUsername} · {formatFileSize(sheet.fileSize)}
                    </span>
                  </div>
                  <a href={sheet.fileUrl} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Baixar/abrir PDF">
                    <DownloadIcon size={16} />
                  </a>
                  {(sheet.ownerUserId === user?.id || isMaster) && (
                    <button type="button" className="icon-btn icon-btn-danger" onClick={() => handleDelete(sheet)} title="Apagar ficha">
                      <TrashIcon size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
