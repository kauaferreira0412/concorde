import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function CameraPipWindow({ onClose, onError, children }) {
  const [pipWindow, setPipWindow] = useState(null);

  useEffect(() => {
    if (!("documentPictureInPicture" in window)) {
      onError?.("Seu navegador não suporta abrir as câmeras numa janela separada.");
      onClose();
      return;
    }
    let cancelled = false;
    let win = null;
    window.documentPictureInPicture
      .requestWindow({ width: 900, height: 560 })
      .then((w) => {
        if (cancelled) {
          w.close();
          return;
        }
        win = w;
        w.document.title = "Concorde — Câmeras";
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
          w.document.head.appendChild(node.cloneNode(true));
        });
        w.document.body.className = "camera-pip-body";
        w.addEventListener("pagehide", () => onClose(), { once: true });
        setPipWindow(w);
      })
      .catch((err) => {
        onError?.("Não foi possível abrir a janela das câmeras: " + (err?.message || err));
        onClose();
      });
    return () => {
      cancelled = true;
      win?.close();
    };
  }, []);

  if (!pipWindow) return null;
  return createPortal(children, pipWindow.document.body);
}
