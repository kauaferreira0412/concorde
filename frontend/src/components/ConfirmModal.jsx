export default function ConfirmModal({ title, message, confirmLabel = "Confirmar", danger = false, onConfirm, onClose }) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="admin-hint" style={{ margin: "8px 0 18px" }}>
          {message}
        </p>
        <div className="settings-actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={danger ? "danger" : ""} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
