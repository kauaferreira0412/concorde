import { useEffect } from "react";
import { DownloadIcon, ExternalLinkIcon, XIcon } from "./icons.jsx";

/**
 * Visualizador de imagem em tela cheia, estilo Discord (ver print de referencia do usuario) -
 * antes clicar numa imagem do chat abria uma aba nova do navegador; agora abre por cima da
 * propria pagina, com uma barrinha de acoes (baixar / abrir em nova aba / fechar) no canto.
 * Fecha clicando fora da imagem, no X, ou apertando Esc.
 */
export default function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        {/* "download" so' funciona de verdade pra imagens da mesma origem - em imagens de
            outro dominio (ex: bucket de storage) o navegador pode abrir em vez de baixar,
            mas nunca quebra: e' so' um link normal por baixo. */}
        <a className="icon-btn" href={src} download title="Baixar imagem">
          <DownloadIcon size={18} />
        </a>
        <a className="icon-btn" href={src} target="_blank" rel="noreferrer" title="Abrir em nova aba">
          <ExternalLinkIcon size={18} />
        </a>
        <button type="button" className="icon-btn" onClick={onClose} title="Fechar (Esc)">
          <XIcon size={18} />
        </button>
      </div>
      <img src={src} alt={alt} className="lightbox-image" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
