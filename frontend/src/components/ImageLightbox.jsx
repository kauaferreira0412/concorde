import { useEffect, useRef, useState } from "react";
import { CopyIcon, DownloadIcon, ExternalLinkIcon, XIcon, ZoomInIcon, ZoomOutIcon } from "./icons.jsx";

export default function ImageLightbox({ src, alt, onClose }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [copyState, setCopyState] = useState("idle");
  const panStateRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onWheelNative(e) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      setScale((s) => {
        const next = Math.max(1, Math.min(5, +(s + delta).toFixed(2)));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    }
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  function zoomBy(delta) {
    setScale((s) => {
      const next = Math.max(1, Math.min(5, +(s + delta).toFixed(2)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function handlePointerDown(e) {
    if (scale <= 1) return;
    e.stopPropagation();
    panStateRef.current = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y, moved: false };
  }
  function handlePointerMove(e) {
    if (!panStateRef.current) return;
    const dx = e.clientX - panStateRef.current.startX;
    const dy = e.clientY - panStateRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panStateRef.current.moved = true;
    setPan({ x: panStateRef.current.originX + dx, y: panStateRef.current.originY + dy });
  }
  function handlePointerUp() {
    panStateRef.current = null;
  }

  const isElectronDesktop = typeof window !== "undefined" && !!window.concordeDesktop;

  async function handleCopy() {
    setCopyState("copying");
    try {
      if (isElectronDesktop) {
        const result = await window.concordeDesktop.copyImage(src);
        if (!result?.ok) throw new Error(result?.error || "falhou");
      } else {
        const res = await fetch(src);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      }
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch (err) {
      console.error("Não foi possível copiar a imagem:", err);
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  function handleDownload() {
    window.concordeDesktop.downloadImage(src);
  }

  function handleOpenExternal() {
    window.concordeDesktop.openExternal(src);
  }

  return (
    <div className="lightbox-backdrop" onClick={scale <= 1 ? onClose : undefined}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={() => zoomBy(-0.5)} disabled={scale <= 1} title="Diminuir zoom">
          <ZoomOutIcon size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(0.5)} disabled={scale >= 5} title="Aumentar zoom">
          <ZoomInIcon size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={handleCopy} title="Copiar imagem">
          <CopyIcon size={18} />
        </button>
        {isElectronDesktop ? (
          <button type="button" className="icon-btn" onClick={handleDownload} title="Baixar imagem">
            <DownloadIcon size={18} />
          </button>
        ) : (
          <a className="icon-btn" href={src} download title="Baixar imagem">
            <DownloadIcon size={18} />
          </a>
        )}
        {isElectronDesktop ? (
          <button type="button" className="icon-btn" onClick={handleOpenExternal} title="Abrir no navegador">
            <ExternalLinkIcon size={18} />
          </button>
        ) : (
          <a className="icon-btn" href={src} target="_blank" rel="noreferrer" title="Abrir em nova aba">
            <ExternalLinkIcon size={18} />
          </a>
        )}
        <button type="button" className="icon-btn" onClick={onClose} title="Fechar (Esc)">
          <XIcon size={18} />
        </button>
      </div>
      {copyState === "done" && <p className="lightbox-copy-toast">Imagem copiada!</p>}
      {copyState === "error" && <p className="lightbox-copy-toast error">Não foi possível copiar essa imagem.</p>}
      <div
        ref={wrapRef}
        className="lightbox-image-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: scale > 1 ? (panStateRef.current ? "grabbing" : "grab") : "default" }}
      >
        <img
          src={src}
          alt={alt}
          className="lightbox-image"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        />
      </div>
    </div>
  );
}
