import { useEffect } from "react";

/** Substitui o alert() nativo do navegador (aquela caixinha feia "localhost diz...") por um
 *  modal com a mesma cara do resto do app - ver AlertContext.jsx/useAlert(). */
export default function AlertModal({ title, message, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Enter" || e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title || "Aviso"}</h2>
        <p className="admin-hint" style={{ margin: "8px 0 18px", color: "var(--text-secondary)", fontSize: 13.5 }}>
          {message}
        </p>
        <div className="settings-actions" style={{ justifyContent: "flex-end" }}>
          <button type="button" autoFocus onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
