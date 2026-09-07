import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { formatFileSize } from "../utils/fileSize";
import { DownloadIcon, FileIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon, XIcon } from "./icons.jsx";

/** PDF embutido dentro do proprio sistema (pedido explicito do usuario: "deve abrir um popup
 *  com a ficha, o PDF da ficha no sistema") - iframe simples, o navegador ja' sabe renderizar
 *  PDF sozinho (Chrome/Edge/Firefox fazem isso nativamente). "Abrir em nova aba" continua
 *  disponivel como reforco, pro raro caso de alguem com isso desabilitado no navegador. */
function CharacterSheetViewerModal({ sheet, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal character-sheet-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>
            {sheet.imageUrl && <img src={sheet.imageUrl} alt="" className="character-sheet-viewer-avatar" />}
            {sheet.characterName}
          </h2>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {sheet.fileUrl && (
              <a href={sheet.fileUrl} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Abrir em nova aba">
                <DownloadIcon size={16} />
              </a>
            )}
            <button type="button" className="icon-btn" onClick={onClose}>
              <XIcon />
            </button>
          </div>
        </div>
        <div className="character-sheet-viewer-body">
          {sheet.fileUrl ? (
            // "#navpanes=0" esconde o painel de miniaturas do visualizador nativo do
            // navegador (Chrome/Edge) e "#view=FitH" ajusta o zoom pra largura em vez do
            // padrao "ajustar a pagina inteira" - sem isso, o PDF aparecia pequeno com uma
            // faixa grande de espaco morto do lado (reportado pelo usuario). So' funciona em
            // navegadores baseados em Chromium (o app inteiro roda em cima de um, Electron
            // incluso) - Firefox ignora os parametros e mostra do jeito padrao dele, sem quebrar.
            <iframe src={`${sheet.fileUrl}#navpanes=0&view=FitH`} title={`Ficha de ${sheet.characterName}`} />
          ) : (
            <p className="admin-hint" style={{ padding: 20 }}>
              {sheet.canEdit ? "Nenhum PDF subido ainda pra esse personagem - use o ícone de arquivo pra subir um." : "O mestre ainda não subiu o PDF dessa ficha."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Personagens de uma mesa de RPG (kit de RPG, pedido explicito do usuario) - villoes, NPCs,
 * personagens de jogador. O SERVIDOR INTEIRO e' a mesa agora (nao mais uma categoria - pedido
 * explicito: "desvincule as fichas dos personagens de uma categoria"). SO' O MESTRE (o dono do
 * servidor) cria personagens e vincula um JOGADOR a cada um; o jogador vinculado ve e EDITA a
 * propria ficha (nome/foto/PDF), mas nao cria nem apaga nada, nem ve os personagens de outros
 * jogadores/villoes sem vinculo. O backend ja' devolve so' o que ESSE usuario pode ver (ver
 * CharacterSheetService.list).
 */
export default function CharacterSheetsModal({ server, isMaster, members, onClose }) {
  const { showAlert } = useAlert();
  const [sheets, setSheets] = useState(null); // null = carregando
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewingSheet, setViewingSheet] = useState(null);

  function reload() {
    return api.get(`/api/servers/${server.id}/sheets`).then(({ data }) => setSheets(data));
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
  }, [server.id]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || creatingBusy) return;
    setCreatingBusy(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("characterName", newName.trim());
      const { data } = await api.post(`/api/servers/${server.id}/sheets`, formData);
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
      await api.delete(`/api/servers/${server.id}/sheets/${sheet.id}`);
      setSheets((prev) => (prev || []).filter((s) => s.id !== sheet.id));
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível apagar esse personagem");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal character-sheets-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>
            <UsersIcon size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            Personagens
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isMaster && !creating && (
              <button type="button" className="character-sheets-new-btn" onClick={() => setCreating(true)}>
                <PlusIcon size={12} /> Novo
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose}>
              <XIcon />
            </button>
          </div>
        </div>

        <div className="settings-content character-sheets-content">
          <p className="admin-hint character-sheets-hint">
            {isMaster
              ? "Você é o mestre dessa mesa - crie os personagens (jogadores, vilões, NPCs) e vincule cada um a um jogador do servidor. Só quem estiver vinculado enxerga a própria ficha."
              : "Aqui aparecem só os personagens que o mestre vinculou a você."}
          </p>

          {isMaster && creating && (
            <form onSubmit={handleCreate} className="emoji-upload-row character-sheets-create-form">
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
          )}

          {error && <p className="auth-error">{error}</p>}

          {sheets === null ? (
            <p className="admin-hint">Carregando...</p>
          ) : sheets.length === 0 ? (
            <p className="admin-hint">
              {isMaster ? "Nenhum personagem criado ainda." : "Nenhum personagem vinculado a você ainda."}
            </p>
          ) : (
            <div className="character-sheet-grid">
              {sheets.map((sheet) => (
                <CharacterCard
                  key={sheet.id}
                  server={server}
                  sheet={sheet}
                  members={members}
                  isMaster={isMaster}
                  onChanged={(updated) => setSheets((prev) => (prev || []).map((s) => (s.id === updated.id ? updated : s)))}
                  onDelete={() => handleDelete(sheet)}
                  onOpen={() => setViewingSheet(sheet)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {viewingSheet && <CharacterSheetViewerModal sheet={viewingSheet} onClose={() => setViewingSheet(null)} />}
    </div>
  );
}

/** Um card (um personagem) - retrato grande em cima (estilo "Journal" do Roll20, pedido
 *  explicito do usuario: "pesquise como o Roll20 e deixe parecido"), nome, quem esta'
 *  vinculado, status do PDF, e os controles de edicao embaixo (so' aparecem se
 *  "sheet.canEdit" - mestre OU o jogador vinculado, ver CharacterSheetService no backend).
 *  Estado de edicao proprio, isolado por card. */
function CharacterCard({ server, sheet, members, isMaster, onChanged, onDelete, onOpen }) {
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
      const { data } = await api.put(`/api/servers/${server.id}/sheets/${sheet.id}`, formData);
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
      const { data } = await api.put(`/api/servers/${server.id}/sheets/${sheet.id}/link`, { userId });
      onChanged(data);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível vincular esse jogador");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="character-card">
      <button type="button" className="character-card-portrait" onClick={onOpen} title="Abrir ficha">
        {sheet.imageUrl ? (
          <img src={sheet.imageUrl} alt="" />
        ) : (
          <span className="character-card-portrait-empty">
            <FileIcon size={30} />
          </span>
        )}
        {sheet.fileUrl && (
          <span className="character-card-pdf-badge" title="Tem PDF">
            <FileIcon size={11} /> PDF
          </span>
        )}
      </button>

      <div className="character-card-body">
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
          <div className="character-card-name-row">
            <span className="character-card-name" onClick={onOpen} title={sheet.characterName}>
              {sheet.characterName}
            </span>
            {sheet.canEdit && (
              <button type="button" className="icon-btn character-sheet-inline-edit" onClick={() => setEditingName(true)} title="Renomear">
                <PencilIcon size={12} />
              </button>
            )}
          </div>
        )}

        {isMaster ? (
          <select value={sheet.linkedUserId || ""} onChange={handleLinkChange} disabled={busy} className="character-card-link-select">
            <option value="">Sem jogador vinculado</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.nickname || m.username}
              </option>
            ))}
          </select>
        ) : (
          <span className="character-card-linked-tag">Vinculado a você</span>
        )}

        <span className="character-card-file-status">
          {sheet.fileName ? (
            <>
              <FileIcon size={12} /> {sheet.fileName} · {formatFileSize(sheet.fileSize)}
            </>
          ) : (
            "Sem PDF ainda"
          )}
        </span>
      </div>

      <div className="character-card-actions">
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
