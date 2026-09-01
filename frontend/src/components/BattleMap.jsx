import { useEffect, useLayoutEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { subscribeToMap, addMapToken, moveMapToken, renameMapToken, removeMapToken } from "../ws/chatSocket";
import { ImageIcon, MapIcon, MapPinIcon, PencilIcon, TrashIcon, UsersIcon, ZoomInIcon, ZoomOutIcon } from "./icons.jsx";

const TOKEN_COLORS = ["#ed4245", "#5865f2", "#57f287", "#faa61a", "#eb459e", "#00c2ff"];
function randomColor() {
  return TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)];
}

/**
 * Mapa(s) de batalha do canal de voz - kit de RPG (pedido explicito do usuario: "algo muito
 * parecido com o Roll20", sem precisar ser tão complexo). O mestre pode subir VARIOS mapas
 * (mapa 1, mapa 2...) e escolher qual deles esta' "ativo" (o que TODOS os jogadores veem agora,
 * ver o botao "Mapas") - cada mapa guarda o PROPRIO conjunto de tokens, entao trocar de mapa e
 * voltar restaura os tokens exatamente onde estavam. So' o mestre adiciona/apaga um token ou um
 * mapa; qualquer jogador pode mover/renomear/apagar um token que ja' existe (ao vivo de
 * verdade, via WebSocket com throttle - pedido explicito do usuario). Posicao de cada token e'
 * salva como FRACAO da imagem (0..1), nao pixel, entao bate certinho pra todo mundo independente
 * do zoom/tamanho de tela de cada um (ver MapToken.java).
 */
export default function BattleMap({ channelId, serverId, categoryId, stompClient, stompConnected }) {
  const { showAlert } = useAlert();
  const [maps, setMaps] = useState([]);
  const [activeMapId, setActiveMapId] = useState(null);
  const [tokens, setTokens] = useState([]);
  // So' quem criou a categoria desse canal (o "mestre" - ver ChannelCategory.createdBy no
  // backend) pode gerenciar mapas/tokens - pedido explicito do usuario. O backend confere de
  // novo (de verdade) em cada acao; isso aqui e' so' pra mostrar ou nao os botoes.
  const [canManageMap, setCanManageMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [showMapsMenu, setShowMapsMenu] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [addMode, setAddMode] = useState(false);
  const [editingToken, setEditingToken] = useState(null); // { id, label, color, imageUrl, x, y (tela) }
  const [renameDraft, setRenameDraft] = useState("");
  const [uploadingTokenImage, setUploadingTokenImage] = useState(false);
  // Personagens da mesa (categoria) pra criar um token ja' com a foto certa - ver
  // CharacterSheetsModal.jsx/handlePickCharacter abaixo (pedido explicito do usuario: "a foto
  // pode ser transformada em um token"). So' os personagens que ESSE usuario enxerga (o mestre
  // ve todos, o jogador so' os vinculados a ele - ver CharacterSheetService.list no backend).
  const [characters, setCharacters] = useState([]);
  const [showCharacterPicker, setShowCharacterPicker] = useState(false);
  const [pendingTokenTemplate, setPendingTokenTemplate] = useState(null); // { label, color, imageUrl } | null

  const activeMap = maps.find((m) => m.id === activeMapId) || null;

  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  const tokenImageInputRef = useRef(null);
  const panStateRef = useRef(null); // { startX, startY, originX, originY, moved }
  const dragTokenRef = useRef(null); // { id, lastSentAt }
  const editorRef = useRef(null);
  const mapsMenuRef = useRef(null);
  const characterPickerRef = useRef(null);

  // Reposiciona o popover de editar token com a ALTURA/LARGURA REAIS dele (medidas depois de
  // renderizado) em vez de um numero fixo chutado - senao, quando o conteudo cresce (rename +
  // cores + imagem customizada + remover), o popover podia nascer perto da borda da tela e ficar
  // cortado com uma barra de rolagem (reportado pelo usuario: "está cortando e ficando com uma
  // barra de lateral"). Mesma tecnica ja' usada pro popover de moderacao de participante (ver
  // ChannelSidebar.jsx).
  useLayoutEffect(() => {
    if (!editingToken || !editorRef.current) return;
    const el = editorRef.current;
    const margin = 8;
    const offset = 14; // afasta um pouco do ponto clicado, senao o popover nasce EM CIMA do proprio token
    const rect = el.getBoundingClientRect();
    let left = Math.min(editingToken.anchorX + offset, window.innerWidth - rect.width - margin);
    let top = Math.min(editingToken.anchorY + offset, window.innerHeight - rect.height - margin);
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [editingToken?.id, editingToken?.imageUrl, editingToken?.anchorX, editingToken?.anchorY]);

  // Fecha o popover de editar token ao clicar fora - mesmo padrao usado no resto do app (ver
  // ChannelSidebar.jsx/MemberList.jsx).
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

  // Fecha o seletor de personagem/o menu de mapas ao clicar fora - mesmo padrao do popover de
  // editar token acima.
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
      setTokens(data.tokens);
      setCanManageMap(data.canManageMap);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToMap(stompClient, channelId, (event) => {
      if (event.type === "MAPS_CHANGED") {
        // Mudanca estrutural (mapa criado/ativado/apagado) - recarrega o snapshot inteiro, mais
        // simples que tentar remontar o estado a partir do proprio evento.
        loadSnapshot().catch(() => {});
      } else if (event.type === "TOKEN_ADDED") {
        setTokens((prev) => (event.token.mapId === activeMapId ? [...prev, event.token] : prev));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stompClient, stompConnected, channelId, activeMapId]);

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
      setShowMapsMenu(false);
      // O estado local atualiza sozinho via WebSocket (o proprio backend transmite de volta
      // pra quem subiu tambem, ver MapController) - nao precisa mexer no state aqui.
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível subir o mapa");
    } finally {
      setUploading(false);
    }
  }

  async function handleActivateMap(mapId) {
    if (mapId === activeMapId) {
      setShowMapsMenu(false);
      return;
    }
    try {
      await api.put(`/api/channels/${channelId}/map/${mapId}/activate`);
      setShowMapsMenu(false);
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível trocar o mapa");
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

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((s) => Math.max(0.4, Math.min(4, +(s + delta).toFixed(2))));
  }

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
    if (wasPan?.moved) return; // foi arrastar o mapa, nao clicar pra adicionar token
    if (!addMode || !imageRef.current || !stompClient || !stompConnected || !activeMapId) return;
    const rect = imageRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return;
    if (pendingTokenTemplate) {
      addMapToken(stompClient, channelId, { mapId: activeMapId, ...pendingTokenTemplate, x: fracX, y: fracY });
      setPendingTokenTemplate(null);
    } else {
      addMapToken(stompClient, channelId, { mapId: activeMapId, label: "Token", color: randomColor(), x: fracX, y: fracY });
    }
    // Um clique = um token so', sempre - o botao "desliga" sozinho depois de colocar (pedido
    // explicito do usuario: senao o mestre pode se confundir e adicionar varios sem querer).
    // Pra colocar outro, precisa clicar em "Adicionar token"/"Usar personagem" de novo.
    setAddMode(false);
  }

  function openCharacterPicker() {
    setShowCharacterPicker((v) => !v);
    if (serverId && categoryId) {
      api
        .get(`/api/servers/${serverId}/categories/${categoryId}/sheets`)
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
    // Throttle - manda no MAXIMO a cada ~80ms enquanto arrasta, senao um arraste de 1s vira
    // dezenas de mensagens WS por segundo (pedido explicito: precisa ser ao vivo, mas nao
    // precisa ser CADA pixel).
    if (stompClient && stompConnected && now - dragTokenRef.current.lastSentAt > 80) {
      dragTokenRef.current.lastSentAt = now;
      moveMapToken(stompClient, channelId, token.id, x, y);
    }
  }
  function handleTokenPointerUp(e, token) {
    // Sem isso, soltar o arraste de um token "vazava" pro container do mapa por baixo (que
    // escuta o MESMO pointerup pra criar um token novo quando "addMode" esta' ligado) - soltar
    // um arraste enquanto "Adicionar token" estava ativo criava um token extra do nada no
    // ponto onde voce largou o mouse (reportado: "quando clico pra mexer um token, ele acaba
    // criando outro").
    e.stopPropagation();
    if (dragTokenRef.current?.id === token.id) {
      if (dragTokenRef.current.moved && imageRef.current && stompClient && stompConnected) {
        const { x, y } = tokenFracFromEvent(e);
        moveMapToken(stompClient, channelId, token.id, x, y); // garante a posicao FINAL certinha
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

  // Imagem CUSTOMIZADA do token (retrato do personagem, etc - pedido explicito do usuario) -
  // qualquer um pode subir uma pro PROPRIO token, nao precisa ser o mestre (diferente de
  // adicionar/apagar um token). Sobe pro GCS primeiro (REST), depois manda a URL junto com o
  // resto via WebSocket - mesmo caminho que trocar nome/cor usa (ver renameMapToken).
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
                    {maps.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={"battle-map-menu-item" + (m.id === activeMapId ? " active" : "")}
                        onClick={() => handleActivateMap(m.id)}
                        title={m.id === activeMapId ? "Mapa que os jogadores estão vendo agora" : "Mostrar esse mapa pros jogadores"}
                      >
                        <img src={m.imageUrl} alt="" />
                        <span className="battle-map-menu-item-name">{m.name || `Mapa ${maps.indexOf(m) + 1}`}</span>
                        {m.id === activeMapId && <span className="battle-map-menu-badge">Ativo</span>}
                        <span
                          role="button"
                          tabIndex={0}
                          className="battle-map-menu-delete"
                          onClick={(e) => handleDeleteMap(e, m.id)}
                          title="Apagar esse mapa"
                        >
                          <TrashIcon size={13} />
                        </span>
                      </button>
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
        {activeMap && (
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
                {categoryId && (
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

      {loading ? (
        <p className="admin-hint">Carregando mapa...</p>
      ) : !activeMap ? (
        <p className="admin-hint">
          {canManageMap
            ? "Nenhum mapa ainda - clique em \"Mapas\" pra subir uma imagem (jpg, png ou webp)."
            : "O mestre dessa categoria ainda não subiu um mapa."}
        </p>
      ) : (
        <div
          className="battle-map-viewport"
          onWheel={handleWheel}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
          onPointerLeave={handleContainerPointerUp}
          style={{ cursor: addMode ? "crosshair" : panStateRef.current ? "grabbing" : "grab" }}
        >
          <div className="battle-map-canvas" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}>
            <img ref={imageRef} src={activeMap.imageUrl} alt="Mapa de batalha" className="battle-map-image" draggable={false} />
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
