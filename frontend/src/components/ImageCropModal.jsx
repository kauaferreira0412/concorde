import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon, ZoomInIcon, ZoomOutIcon } from "./icons.jsx";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ZOOM = 4;

/**
 * Recorte de imagem antes de enviar (foto de perfil 1:1, banner 3:1).
 * Arrasta pra posicionar, roda/usa o slider pro zoom. GIF vai inteiro, sem recorte, pra não perder a animação.
 *
 * props: file, aspect (largura/altura), outputWidth, title, shape ("rounded" | "banner"), onCancel, onConfirm(blob|file)
 */
export default function ImageCropModal({ file, aspect = 1, outputWidth = 512, title, shape = "rounded", onCancel, onConfirm }) {
  const isGif = file.type === "image/gif";
  const [src, setSrc] = useState(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(isGif && file.size > MAX_BYTES ? "GIF grande demais - o máximo é 8MB." : "");
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const measure = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Escala base = a menor que ainda cobre o quadro inteiro.
  const baseScale = natural && frame.w ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : 0;
  const dispH = natural ? natural.h * scale : 0;

  function clamp(next, z = zoom) {
    if (!natural || !frame.w) return next;
    const w = natural.w * baseScale * z;
    const h = natural.h * baseScale * z;
    const maxX = Math.max(0, (w - frame.w) / 2);
    const maxY = Math.max(0, (h - frame.h) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
  }

  function setZoomClamped(z) {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(nz);
    setOffset((o) => clamp(o, nz));
  }

  function onPointerDown(e) {
    if (isGif) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, start: offset };
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clamp({ x: d.start.x + (e.clientX - d.x), y: d.start.y + (e.clientY - d.y) }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onWheel(e) {
    if (isGif) return;
    setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  }

  async function confirm() {
    if (isGif) {
      if (file.size > MAX_BYTES) return;
      onConfirm(file);
      return;
    }
    if (!natural || !imgRef.current) return;
    setBusy(true);
    try {
      const outW = outputWidth;
      const outH = Math.round(outputWidth / aspect);
      // Pedaço da imagem original que aparece no quadro.
      const sw = frame.w / scale;
      const sh = frame.h / scale;
      const sx = natural.w / 2 - (frame.w / 2 + offset.x) / scale;
      const sy = natural.h / 2 - (frame.h / 2 + offset.y) / scale;
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
      if (!blob) throw new Error("toBlob");
      onConfirm(new File([blob], "imagem.webp", { type: "image/webp" }));
    } catch {
      setError("Não foi possível recortar essa imagem. Tenta outra?");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop crop-backdrop" onClick={onCancel}>
      <div className="modal crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onCancel} title="Cancelar">
            <XIcon size={18} />
          </button>
        </div>

        <div
          ref={frameRef}
          className={"crop-frame " + shape + (isGif ? " gif" : "")}
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {src && (
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={
                isGif
                  ? { width: "100%", height: "100%", objectFit: "cover" }
                  : {
                      width: dispW || undefined,
                      height: dispH || undefined,
                      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                    }
              }
              className={isGif ? "" : "crop-img"}
            />
          )}
          {!isGif && <span className="crop-grid" aria-hidden="true" />}
        </div>

        {isGif ? (
          <p className="admin-hint" style={{ margin: 0 }}>
            GIF animado: ele é usado inteiro (centralizado) pra continuar animando. Pra escolher o pedaço, use uma imagem
            parada (PNG, JPG ou WEBP).
          </p>
        ) : (
          <div className="crop-zoom">
            <button type="button" className="icon-btn" onClick={() => setZoomClamped(zoom / 1.2)} title="Diminuir zoom">
              <ZoomOutIcon size={18} />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoomClamped(Number(e.target.value))}
              aria-label="Zoom"
            />
            <button type="button" className="icon-btn" onClick={() => setZoomClamped(zoom * 1.2)} title="Aumentar zoom">
              <ZoomInIcon size={18} />
            </button>
          </div>
        )}
        {!isGif && <p className="admin-hint crop-tip">Arraste a imagem pra posicionar · role o mouse ou use o controle pro zoom</p>}

        {error && <p className="auth-error">{error}</p>}

        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="crop-confirm" onClick={confirm} disabled={busy || !!error || (!isGif && !natural)}>
            {busy ? "Preparando..." : "Usar imagem"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
