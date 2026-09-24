import { useEffect, useLayoutEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { subscribeToMap, addMapToken, moveMapToken, renameMapToken, removeMapToken } from "../ws/chatSocket";
import { EyeIcon, ImageIcon, MapIcon, MapPinIcon, PencilIcon, TrashIcon, UsersIcon, ZoomInIcon, ZoomOutIcon } from "./icons.jsx";

const TOKEN_COLORS = ["#ed4245", "#5865f2", "#57f287", "#faa61a", "#eb459e", "#00c2ff"];
function randomColor() {
  return TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)];
}

export default function BattleMap({ channelId, serverId, categoryId, stompClient, stompConnected }) {
  const { showAlert } = useAlert();
  const [maps, setMaps] = useState([]);
  const [activeMapId, setActiveMapId] = useState(null);
  const [viewingMapId, setViewingMapId] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [canManageMap, setCanManageMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [showMapsMenu, setShowMapsMenu] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [addMode, setAddMode] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [uploadingTokenImage, setUploadingTokenImage] = useState(false);
  const [characters, setCharacters] = useState([]);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [pendingTokenTemplate, setPendingTokenTemplate] = useState(null);

  const activeMap = maps.find((m) => m.id === activeMapId) || null;
  const viewingMap = maps.find((m) => m.id === viewingMapId) || null;
  const isPreviewingUnpublished = canManageMap && viewingMap && viewingMap.id !== activeMapId;

  const imageRef = useRef(null);
  const viewportRef = useRef(null);
  const fileInputRef = useRef(null);
  const tokenImageInputRef = useRef(null);
  const panStateRef = useRef(null);
  const dragTokenRef = useRef(null);
  const editorRef = useRef(null);
  const mapsMenuRef = useRef(null);
  const characterPickerRef = useRef(null);

  useLayoutEffect(() => {
    if (!editingToken || !editorRef.current) return;
    const el = editorRef.current;
    const margin = 8;
    const offset = 14;
    const rect = el.getBoundingClientRect();
    let left = Math.min(editingToken.anchorX + offset, window.innerWidth - rect.width - margin);
    let top = Math.min(editingToken.anchorY + offset, window.innerHeight - rect.height - margin);
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [editingToken?.id, editingToken?.imageUrl, editingToken?.anchorX, editingToken?.anchorY]);

  useEffect(() => {
    if (!editingToken) return;
    function handlePointerDown(e) {
      if (editorRef.current && !editorRef.current.contains(e.target)) setEditingToken(null);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setEditingToken(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingToken]);

  useEffect(() => {
    if (!showCharacterPicker) return;
    function handlePointerDown(e) {
      if (characterPickerRef.current && !characterPickerRef.current.contains(e.target)) setShowCharacterPicker(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showCharacterPicker]);

  useEffect(() => {
    if (!showMapsMenu) return;
    function handlePointerDown(e) {
      if (mapsMenuRef.current && !mapsMenuRef.current.contains(e.target)) setShowMapsMenu(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showMapsMenu]);

  function loadSnapshot() {
    return api.get(`/api/channels/${channelId}/map`).then(({ data }) => {
      setMaps(data.maps);
      setActiveMapId(data.activeMapId);
      setCanManageMap(data.canManageMap);
      setViewingMapId((prev) => {
        if (!data.canManageMap) return data.activeMapId;
        if (prev && data.maps.some((m) => m.id === prev)) return prev;
        return data.activeMapId ?? (data.maps[0]?.id ?? null);
      });
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSnapshot()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!viewingMapId) {
      setTokens([]);
      return;
    }
    let cancelled = false;
    api
      .get(`/api/channels/${channelId}/map/${viewingMapId}`)
      .then(({ data }) => {
        if (!cancelled) setTokens(data.tokens);
      })
      .catch(() => {
        if (!cancelled) setTokens([]);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, viewingMapId]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToMap(stompClient, channelId, (event) => {
      if (event.type === "MAPS_CHANGED") {
        loadSnapshot().catch(() => {});
      } else if (event.type === "TOKEN_ADDED") {
        setTokens((prev) => (event.token.mapId === viewingMapId ? [...prev, event.token] : prev));
      } else if (event.type === "TOKEN_MOVED") {
        setTokens((prev) => prev.map((t) => (t.id === event.tokenId ? { ...t, x: event.x, y: event.y } : t)));
      } else if (event.type === "TOKEN_RENAMED") {
        setTokens((prev) => prev.map((t) => (t.id === event.token.id ? event.token : t)));
      } else if (event.type === "TOKEN_REMOVED") {
        setTokens((prev) => prev.filter((t) => t.id !== event.tokenId));
        setEditingToken((prev) => (prev?.id === event.tokenId ? null : prev));
      }
    });
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected, channelId, viewingMapId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (newMapName.trim()) formData.append("name", newMapName.trim());
      await api.post(`/api/channels/${channelId}/map/image`, formData);
      setNewMapName("");
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível subir o mapa");
    } finally {
      setUploading(false);
    }
  }

  async function handleActivateMap(mapId) {
    try {
      await api.put(`/api/channels/${channelId}/map/${mapId}/activate`);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível ativar esse mapa");
    }
  }

  async function handleDeleteMap(e, mapId) {
    e.stopPropagation();
    try {
      await api.delete(`/api/channels/${channelId}/map/${mapId}`);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível apagar esse mapa");
    }
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheelNative(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setScale((s) => Math.max(0.4, Math.min(4, +(s + delta).toFixed(2))));
    }
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [viewingMap?.id]);

  function handleContainerPointerDown(e) {
    if (e.target.closest(".battle-map-token")) return;
    panStateRef.current = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y, moved: false };
  }
  function handleContainerPointerMove(e) {
    if (!panStateRef.current) return;
    const dx = e.clientX - panStateRef.current.startX;
    const dy = e.clientY - panStateRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panStateRef.current.moved = true;
    setPan({ x: panStateRef.current.originX + dx, y: panStateRef.current.originY + dy });
  }
  function handleContainerPointerUp(e) {
    const wasPan = panStateRef.current;
    panStateRef.current = null;
    if (wasPan?.moved) return;
    if (!addMode || !imageRef.current || !stompClient || !stompConnected || !viewingMapId) return;
    const rect = imageRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return;
    if (pendingTokenTemplate) {
      addMapToken(stompClient, channelId, { mapId: viewingMapId, ...pendingTokenTemplate, x: fracX, y: fracY });
      setPendingTokenTemplate(null);
    } else {
      addMapToken(stompClient, channelId, { mapId: viewingMapId, label: "Token", color: randomColor(), x: fracX, y: fracY });
    }
    setAddMode(false);
  }

  function openCharacterPicker() {
    setShowCharacterPicker((v) => !v);
    if (serverId) {
      api
        .get(`/api/servers/${serverId}/sheets`)
        .then(({ data }) => setCharacters(data))
        .catch(() => setCharacters([]));
    }
  }

  function handlePickCharacter(character) {
    setPendingTokenTemplate({ label: character.characterName, color: randomColor(), imageUrl: character.imageUrl || null });
    setAddMode(true);
    setShowCharacterPicker(false);
  }

  function handleTokenPointerDown(e, token) {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragTokenRef.current = { id: token.id, lastSentAt: 0, moved: false };
  }
  function tokenFracFromEvent(e) {
    const rect = imageRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  function handleTokenPointerMove(e, token) {
    if (!dragTokenRef.current || dragTokenRef.current.id !== token.id || !imageRef.current) return;
    e.stopPropagation();
    dragTokenRef.current.moved = true;
    const { x, y } = tokenFracFromEvent(e);
    setTokens((prev) => prev.map((t) => (t.id === token.id ? { ...t, x, y } : t)));
    const now = Date.now();
    if (stompClient && stompConnected && now - dragTokenRef.current.lastSentAt > 80) {
      dragTokenRef.current.lastSentAt = now;
      moveMapToken(stompClient, channelId, token.id, x, y);
    }
  }
  function handleTokenPointerUp(e, token) {
    e.stopPropagation();
    if (dragTokenRef.current?.id === token.id) {
      if (dragTokenRef.current.moved && imageRef.current && stompClient && stompConnected) {
        const { x, y } = tokenFracFromEvent(e);
        moveMapToken(stompClient, channelId, token.id, x, y);
      } else if (!dragTokenRef.current.moved) {
        openEditor(token, e);
      }
    }
    dragTokenRef.current = null;
  }

  function openEditor(token, e) {
    setRenameDraft(token.label);
    setEditingToken({ id: token.id, color: token.color, imageUrl: token.imageUrl || null, anchorX: e.clientX, anchorY: e.clientY });
  }

  function handleRenameSave() {
    if (!editingToken || !stompClient || !stompConnected) return;
    renameMapToken(stompClient, channelId, editingToken.id, renameDraft.trim() || "Token", editingToken.color);
    setEditingToken(null);
  }

  function handleChangeColor(color) {
    if (!editingToken) return;
    setEditingToken((prev) => ({ ...prev, color }));
    if (stompClient && stompConnected) {
      renameMapToken(stompClient, channelId, editingToken.id, renameDraft.trim() || "Token", color);
    }
  }

  async function handleTokenImageUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editingToken) return;
    setUploadingTokenImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post(`/api/channels/${channelId}/map/token-image`, formData);
      setEditingToken((prev) => (prev ? { ...prev, imageUrl: data.url } : prev));
      if (stompClient && stompConnected) {
        renameMapToken(stompClient, channelId, editingToken.id, renameDraft.trim() || "Token", editingToken.color, data.url);
      }
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível subir essa imagem");
    } finally {
      setUploadingTokenImage(false);
    }
  }

  function handleRemoveTokenImage() {
    if (!editingToken || !stompClient || !stompConnected) return;
    setEditingToken((prev) => (prev ? { ...prev, imageUrl: null } : prev));
    renameMapToken(stompClient, channelId, editingToken.id, renameDraft.trim() || "Token", editingToken.color, "");
  }

  function handleRemoveToken() {
    if (!editingToken || !stompClient || !stompConnected) return;
    removeMapToken(stompClient, channelId, editingToken.id);
    setEditingToken(null);
  }

  return (
    <div>
      <div className="battle-map-toolbar">
        {canManageMap && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={"icon-btn" + (showMapsMenu ? " icon-btn-active" : "")}
              onClick={() => setShowMapsMenu((v) => !v)}
              title="Gerenciar mapas dessa mesa"
            >
              <MapIcon size={15} /> Mapas{maps.length > 0 ? ` (${maps.length})` : ""}
            </button>
            {showMapsMenu && (
              <div className="battle-map-menu" ref={mapsMenuRef}>
                {maps.length === 0 ? (
                  <p className="admin-hint" style={{ margin: 0, padding: "6px 4px" }}>
                    Nenhum mapa ainda.
                  </p>
                ) : (
                  <div className="battle-map-menu-list">
                    {maps.map((m, idx) => (
                      <div key={m.id} className={"battle-map-menu-row" + (m.id === viewingMapId ? " viewing" : "")}>
                        <button
                          type="button"
                          className={"battle-map-menu-item" + (m.id === activeMapId ? " active" : "")}
                          onClick={() => setViewingMapId(m.id)}
                          title={m.id === viewingMapId ? "Mapa que você está preparando/vendo agora" : "Ver e preparar esse mapa (só você enxerga)"}
                        >
                          <img src={m.imageUrl} alt="" />
                          <span className="battle-map-menu-item-name">{m.name || `Mapa ${idx + 1}`}</span>
                          {m.id === activeMapId && <span className="battle-map-menu-badge">Ativo</span>}
                        </button>
                        {m.id !== activeMapId && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="battle-map-menu-activate"
                            onClick={() => handleActivateMap(m.id)}
                            title="Mostrar esse mapa pros jogadores agora"
                          >
                            <EyeIcon size={13} />
                          </span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          className="battle-map-menu-delete"
                          onClick={(e) => handleDeleteMap(e, m.id)}
                          title="Apagar esse mapa"
                        >
                          <TrashIcon size={13} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="battle-map-menu-new">
                  <input
                    type="text"
                    placeholder="Nome do novo mapa (opcional)"
                    value={newMapName}
                    onChange={(e) => setNewMapName(e.target.value)}
                    maxLength={60}
                  />
                  <input type="file" accept="image/png,image/jpeg,image/webp" ref={fileInputRef} onChange={handleUpload} hidden />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <ImageIcon size={14} /> {uploading ? "Enviando..." : "Novo mapa"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {viewingMap && (
          <>
            {canManageMap && (
              <>
                <button
                  type="button"
                  className={"icon-btn" + (addMode && !pendingTokenTemplate ? " icon-btn-active" : "")}
                  onClick={() => {
                    setPendingTokenTemplate(null);
                    setAddMode((v) => !v);
                  }}
                  title="Clique no mapa pra adicionar um token"
                >
                  <MapPinIcon size={15} /> {addMode && !pendingTokenTemplate ? "Clique no mapa..." : "Adicionar token"}
                </button>
                {serverId && (
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className={"icon-btn" + (pendingTokenTemplate ? " icon-btn-active" : "")}
                      onClick={openCharacterPicker}
                      title="Usar a foto de um personagem da mesa como token"
                    >
                      <UsersIcon size={15} /> {pendingTokenTemplate ? "Clique no mapa..." : "Usar personagem"}
                    </button>
                    {showCharacterPicker && (
                      <div className="battle-map-character-picker" ref={characterPickerRef}>
                        {characters.length === 0 ? (
                          <p className="admin-hint" style={{ margin: 0, padding: "6px 4px" }}>
                            Nenhum personagem disponível pra você nessa categoria.
                          </p>
                        ) : (
                          characters.map((c) => (
                            <button key={c.id} type="button" className="battle-map-character-option" onClick={() => handlePickCharacter(c)}>
                              {c.imageUrl ? (
                                <img src={c.imageUrl} alt="" />
                              ) : (
                                <span className="battle-map-character-placeholder" style={{ background: randomColor() }} />
                              )}
                              {c.characterName}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <button type="button" className="icon-btn" onClick={() => setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(2)))} title="Diminuir zoom">
              <ZoomOutIcon size={15} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setScale((s) => Math.min(4, +(s + 0.2).toFixed(2)))} title="Aumentar zoom">
              <ZoomInIcon size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setScale(1);
                setPan({ x: 0, y: 0 });
              }}
              title="Centralizar mapa"
            >
              100%
            </button>
          </>
        )}
      </div>

      {isPreviewingUnpublished && (
        <div className="battle-map-preview-banner">
          <EyeIcon size={13} />
          <span>
            Só você está vendo esse mapa (em preparo) - os jogadores continuam vendo{" "}
            {activeMap ? `"${activeMap.name || "o mapa atual"}"` : "nenhum mapa ainda"}.
          </span>
          <button type="button" onClick={() => handleActivateMap(viewingMap.id)}>
            Tornar mapa atual
          </button>
        </div>
      )}

      {loading ? (
        <p className="admin-hint">Carregando mapa...</p>
      ) : !viewingMap ? (
        <p className="admin-hint">
          {canManageMap
            ? "Nenhum mapa ainda - clique em \"Mapas\" pra subir uma imagem (jpg, png ou webp)."
            : "O mestre dessa categoria ainda não subiu um mapa."}
        </p>
      ) : (
        <div
          className="battle-map-viewport"
          ref={viewportRef}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
          onPointerLeave={handleContainerPointerUp}
          style={{ cursor: addMode ? "crosshair" : panStateRef.current ? "grabbing" : "grab" }}
        >
          <div className="battle-map-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
            <img ref={imageRef} src={viewingMap.imageUrl} alt="Mapa de batalha" className="battle-map-image" draggable={false} />
            {tokens.map((token) => (
              <div
                key={token.id}
                className="battle-map-token"
                style={
                  token.imageUrl
                    ? { left: `${token.x * 100}%`, top: `${token.y * 100}%`, borderColor: token.color, backgroundImage: `url(${token.imageUrl})` }
                    : { left: `${token.x * 100}%`, top: `${token.y * 100}%`, background: token.color }
                }
                onPointerDown={(e) => handleTokenPointerDown(e, token)}
                onPointerMove={(e) => handleTokenPointerMove(e, token)}
                onPointerUp={(e) => handleTokenPointerUp(e, token)}
                title={token.label}
              >
                <span className="battle-map-token-label">{token.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingToken && (
        <div className="volume-popover battle-map-token-popover" ref={editorRef} onClick={(e) => e.stopPropagation()}>
          <p className="volume-popover-title">Editar token</p>
          <div className="settings-inline-save" style={{ marginBottom: 8 }}>
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameSave()}
              maxLength={40}
            />
            <button type="button" onClick={handleRenameSave}>
              <PencilIcon size={13} />
            </button>
          </div>
          <div className="battle-map-color-row">
            {TOKEN_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={"battle-map-color-swatch" + (editingToken.color === c ? " active" : "")}
                style={{ background: c }}
                onClick={() => handleChangeColor(c)}
              />
            ))}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp" ref={tokenImageInputRef} onChange={handleTokenImageUpload} hidden />
          <div className="participant-mod-actions" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <button
              type="button"
              className="participant-mod-btn"
              onClick={() => tokenImageInputRef.current?.click()}
              disabled={uploadingTokenImage}
            >
              <ImageIcon size={14} /> {uploadingTokenImage ? "Enviando..." : editingToken.imageUrl ? "Trocar imagem" : "Imagem customizada"}
            </button>
            {editingToken.imageUrl && (
              <button type="button" className="participant-mod-btn" onClick={handleRemoveTokenImage}>
                <TrashIcon size={14} /> Remover imagem
              </button>
            )}
          </div>
          <div className="participant-mod-actions">
            <button type="button" className="participant-mod-btn danger" onClick={handleRemoveToken}>
              <TrashIcon size={14} /> Remover token
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
