import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAlert } from "../context/AlertContext.jsx";
import { subscribeToMap, addMapToken, moveMapToken, renameMapToken, removeMapToken } from "../ws/chatSocket";
import { ImageIcon, MapPinIcon, PencilIcon, TrashIcon, ZoomInIcon, ZoomOutIcon } from "./icons.jsx";

const TOKEN_COLORS = ["#ed4245", "#5865f2", "#57f287", "#faa61a", "#eb459e", "#00c2ff"];
function randomColor() {
  return TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)];
}

/**
 * Mapa de batalha do canal de voz - kit de RPG (pedido explicito do usuario: "algo muito
 * parecido com o Roll20", sem precisar ser tão complexo). Sobe uma imagem (vira o mapa de TODO
 * MUNDO nesse canal, ao vivo - ver MapController/MapService no backend), arrasta o fundo pra
 * navegar, roda do mouse pra dar zoom, e qualquer um pode colocar/mover/renomear/apagar um
 * "token" (pin colorido) - a posicao de cada token e' salva como FRACAO da imagem (0..1), nao
 * pixel, entao bate certinho pra todo mundo independente do zoom/tamanho de tela de cada um (ver
 * MapToken.java). Mover um token e' em tempo real de verdade (WebSocket com throttle, nao REST -
 * pedido explicito do usuario), igual o resto do chat ao vivo.
 */
export default function BattleMap({ channelId, stompClient, stompConnected }) {
  const { showAlert } = useAlert();
  const [map, setMap] = useState(null);
  const [tokens, setTokens] = useState([]);
  // So' quem criou a categoria desse canal (o "mestre" - ver ChannelCategory.createdBy no
  // backend) pode subir/trocar o mapa - pedido explicito do usuario. O backend confere de
  // novo (de verdade) no upload; isso aqui e' so' pra mostrar ou nao o botao.
  const [canManageMap, setCanManageMap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [addMode, setAddMode] = useState(false);
  const [editingToken, setEditingToken] = useState(null); // { id, label, color, x, y (tela) }
  const [renameDraft, setRenameDraft] = useState("");

  const imageRef = useRef(null);
  const fileInputRef = useRef(null);
  const panStateRef = useRef(null); // { startX, startY, originX, originY, moved }
  const dragTokenRef = useRef(null); // { id, lastSentAt }
  const editorRef = useRef(null);

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/api/channels/${channelId}/map`)
      .then(({ data }) => {
        if (cancelled) return;
        setMap(data.map);
        setTokens(data.tokens);
        setCanManageMap(data.canManageMap);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToMap(stompClient, channelId, (event) => {
      if (event.type === "MAP_UPLOADED") {
        setMap(event.map);
      } else if (event.type === "TOKEN_ADDED") {
        setTokens((prev) => [...prev, event.token]);
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
  }, [stompClient, stompConnected, channelId]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/api/channels/${channelId}/map/image`, formData);
      // O estado local atualiza sozinho via WebSocket (o proprio backend transmite de volta
      // pra quem subiu tambem, ver MapController) - nao precisa setMap aqui.
    } catch (err) {
      showAlert(err.response?.data?.error || "Não foi possível subir o mapa");
    } finally {
      setUploading(false);
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
    if (!addMode || !imageRef.current || !stompClient || !stompConnected) return;
    const rect = imageRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return;
    addMapToken(stompClient, channelId, { label: "Token", color: randomColor(), x: fracX, y: fracY });
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
    setEditingToken({ id: token.id, color: token.color, x: e.clientX, y: e.clientY });
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

  function handleRemoveToken() {
    if (!editingToken || !stompClient || !stompConnected) return;
    removeMapToken(stompClient, channelId, editingToken.id);
    setEditingToken(null);
  }

  return (
    <div>
      <div className="battle-map-toolbar">
        {canManageMap && (
          <>
            <input type="file" accept="image/png,image/jpeg,image/webp" ref={fileInputRef} onChange={handleUpload} hidden />
            <button type="button" className="icon-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Subir mapa">
              <ImageIcon size={15} /> {uploading ? "Enviando..." : map ? "Trocar mapa" : "Subir mapa"}
            </button>
          </>
        )}
        {map && (
          <>
            <button
              type="button"
              className={"icon-btn" + (addMode ? " icon-btn-active" : "")}
              onClick={() => setAddMode((v) => !v)}
              title="Clique no mapa pra adicionar um token"
            >
              <MapPinIcon size={15} /> {addMode ? "Clique no mapa..." : "Adicionar token"}
            </button>
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
      ) : !map ? (
        <p className="admin-hint">
          {canManageMap
            ? "Nenhum mapa ainda - suba uma imagem pra começar (jpg, png ou webp)."
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
            <img ref={imageRef} src={map.imageUrl} alt="Mapa de batalha" className="battle-map-image" draggable={false} />
            {tokens.map((token) => (
              <div
                key={token.id}
                className="battle-map-token"
                style={{ left: `${token.x * 100}%`, top: `${token.y * 100}%`, background: token.color }}
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
        <div
          className="volume-popover"
          ref={editorRef}
          style={{ left: Math.min(editingToken.x, window.innerWidth - 220), top: Math.min(editingToken.y, window.innerHeight - 180) }}
          onClick={(e) => e.stopPropagation()}
        >
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
