import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import { useAlert } from "../context/AlertContext.jsx";
import { formatFileSize } from "../utils/fileSize";
import { DownloadIcon, FileIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "./icons.jsx";

/**
 * Personagens de uma mesa de RPG (kit de RPG, pedido explicito do usuario) - villoes, NPCs,
 * personagens de jogador. SO' O MESTRE (quem criou a categoria) cria personagens e vincula um
 * JOGADOR a cada um; o jogador vinculado ve e EDITA a propria ficha (nome/foto/PDF), mas nao
 * cria nem apaga nada, nem ve os personagens de outros jogadores/villoes sem vinculo. O backend
 * ja' devolve so' o que ESSE usuario pode ver (ver CharacterSheetService.list).
 */
export default function CharacterSheetsModal({ server, category, members, onClose }) {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const [sheets, setSheets] = useState(null); // null = carregando
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [error, setError] = useState("");

  const isMaster = category.createdBy === user?.id;

  function reload() {
    return api.get(`/api/servers/${server.id}/categories/${category.id}/sheets`).then(({ data }) => setSheets(data));
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch(() => {
        if (!cancelled) setSheets([]);
      })
      .then(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, category.id]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || creatingBusy) return;
    setCreatingBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("characterName", newName.trim());
      const { data } = await api.post(`/api/servers/${server.id}/categories/${category.id}/sheets`, formData);
      setSheets((prev) => [data, ...(prev || [])]);
      setNewName("");
      setCreating(false);
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível criar esse personagem");
    } finally {
      setCreatingBusy(false);
    }
  }

  async function handleDelete(sheet) {
    try {
      await api.delete(`/api/servers/${server.id}/categories/${category.id}/sheets/${sheet.id}`);
      setSheets((prev) => (prev || []).filter((s) => s.id !== sheet.id));
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível apagar esse personagem");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="settings-modal-header">
          <h2>Personagens - {category.name}</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            <XIcon />
          </button>
        </div>

        <div className="settings-content" style={{ padding: "16px 22px" }}>
          <p className="admin-hint" style={{ marginTop: 0 }}>
            {isMaster
              ? "Você é o mestre dessa mesa - crie os personagens (jogadores, vilões, NPCs) e vincule cada um a um jogador do servidor. Só quem estiver vinculado enxerga a própria ficha."
              : "Aqui aparecem só os personagens que o mestre vinculou a você."}
          </p>

          {isMaster && (
            <>
              {creating ? (
                <form onSubmit={handleCreate} className="emoji-upload-row" style={{ marginBottom: 12 }}>
                  <input
                    autoFocus
                    type="text"
                    className="emoji-name-input"
                    placeholder="Nome do personagem"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={60}
                  />
                  <button type="submit" disabled={!newName.trim() || creatingBusy}>
                    {creatingBusy ? "Criando..." : "Criar"}
                  </button>
                  <button type="button" className="link-btn" onClick={() => setCreating(false)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <button type="button" className="channel-item add" style={{ marginBottom: 12 }} onClick={() => setCreating(true)}>
                  <PlusIcon size={13} /> Criar personagem
                </button>
              )}
            </>
          )}

          {error && <p className="auth-error">{error}</p>}

          {sheets === null ? (
            <p className="admin-hint">Carregando...</p>
          ) : sheets.length === 0 ? (
            <p className="admin-hint">
              {isMaster ? "Nenhum personagem criado ainda." : "Nenhum personagem vinculado a você ainda."}
            </p>
          ) : (
            <div className="character-sheet-list">
              {sheets.map((sheet) => (
                <CharacterRow
                  key={sheet.id}
                  server={server}
                  category={category}
                  sheet={sheet}
                  members={members}
                  isMaster={isMaster}
                  onChanged={(updated) => setSheets((prev) => (prev || []).map((s) => (s.id === updated.id ? updated : s)))}
                  onDelete={() => handleDelete(sheet)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Uma linha (um personagem) - foto, nome, quem esta' vinculado, PDF, e os controles de
 *  edicao (so' aparecem se "sheet.canEdit" - mestre OU o jogador vinculado, ver
 *  CharacterSheetService no backend). Estado de edicao proprio, isolado por linha. */
function CharacterRow({ server, category, sheet, members, isMaster, onChanged, onDelete }) {
  const { showAlert } = useAlert();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(sheet.characterName);
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  async function patch(formDataFiller) {
    setBusy(true);
    try {
      const formData = new FormData();
      formDataFiller(formData);
      const { data } = await api.put(`/api/servers/${server.id}/categories/${category.id}/sheets/${sheet.id}`, formData);
      onChanged(data);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível salvar essa alteração");
    } finally {
      setBusy(false);
    }
  }

  function handleSaveName() {
    if (!nameDraft.trim()) return;
    setEditingName(false);
    patch((fd) => fd.append("characterName", nameDraft.trim()));
  }

  function handlePhotoChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    patch((fd) => fd.append("photo", file));
  }

  function handleRemovePhoto() {
    patch((fd) => fd.append("removePhoto", "true"));
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      showAlert("Só é possível subir arquivos PDF");
      return;
    }
    patch((fd) => fd.append("file", file));
  }

  async function handleLinkChange(e) {
    const value = e.target.value;
    const userId = value === "" ? null : Number(value);
    setBusy(true);
    try {
      const { data } = await api.put(`/api/servers/${server.id}/categories/${category.id}/sheets/${sheet.id}/link`, { userId });
      onChanged(data);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível vincular esse jogador");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="character-sheet-row">
      {sheet.imageUrl ? (
        <img src={sheet.imageUrl} alt="" className="character-sheet-photo" />
      ) : (
        <span className="character-sheet-photo character-sheet-photo-empty">
          <FileIcon size={16} />
        </span>
      )}

      <div className="character-sheet-info">
        {editingName ? (
          <div className="settings-inline-save">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              maxLength={60}
            />
            <button type="button" onClick={handleSaveName}>
              <PencilIcon size={13} />
            </button>
          </div>
        ) : (
          <strong>
            {sheet.characterName}
            {sheet.canEdit && (
              <button type="button" className="icon-btn character-sheet-inline-edit" onClick={() => setEditingName(true)} title="Renomear">
                <PencilIcon size={12} />
              </button>
            )}
          </strong>
        )}

        {isMaster ? (
          <select value={sheet.linkedUserId || ""} onChange={handleLinkChange} disabled={busy} className="character-sheet-link-select">
            <option value="">Sem jogador vinculado</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nickname || m.username}
              </option>
            ))}
          </select>
        ) : (
          <span>Personagem vinculado a você</span>
        )}

        {sheet.fileName && (
          <span>
            <FileIcon size={12} /> {sheet.fileName} · {formatFileSize(sheet.fileSize)}
          </span>
        )}
      </div>

      <div className="character-sheet-actions">
        {sheet.fileUrl && (
          <a href={sheet.fileUrl} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Baixar/abrir PDF">
            <DownloadIcon size={16} />
          </a>
        )}
        {sheet.canEdit && (
          <>
            <input type="file" accept="image/png,image/jpeg,image/webp" ref={photoInputRef} onChange={handlePhotoChosen} hidden />
            <button type="button" className="icon-btn" onClick={() => photoInputRef.current?.click()} disabled={busy} title="Trocar foto">
              <ImageIcon size={16} />
            </button>
            {sheet.imageUrl && (
              <button type="button" className="icon-btn" onClick={handleRemovePhoto} disabled={busy} title="Remover foto">
                <XIcon size={14} />
              </button>
            )}
            <input type="file" accept="application/pdf,.pdf" ref={fileInputRef} onChange={handleFileChosen} hidden />
            <button type="button" className="icon-btn" onClick={() => fileInputRef.current?.click()} disabled={busy} title="Subir/trocar PDF">
              <FileIcon size={16} />
            </button>
          </>
        )}
        {isMaster && (
          <button type="button" className="icon-btn icon-btn-danger" onClick={onDelete} title="Apagar personagem">
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
