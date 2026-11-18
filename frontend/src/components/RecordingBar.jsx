import { CheckIcon, TrashIcon } from "./icons.jsx";

const BAR_COUNT = 48;

function formatTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Barra que ocupa o composer enquanto grava uma mensagem de voz. */
export default function RecordingBar({ recorder, onStop }) {
  const levels = recorder.levels || [];
  const padded = Array.from({ length: BAR_COUNT }, (_, i) => levels[levels.length - BAR_COUNT + i] ?? 0);

  return (
    <div className="rec-bar" role="status" aria-live="polite">
      <button type="button" className="rec-bar-cancel" onClick={recorder.cancel} title="Descartar gravação">
        <TrashIcon size={18} />
      </button>
      <span className="rec-bar-dot" aria-hidden="true" />
      <span className="rec-bar-time">{formatTime(recorder.seconds)}</span>
      <span className="rec-bar-wave" aria-hidden="true">
        {padded.map((v, i) => (
          <span key={i} style={{ transform: `scaleY(${0.12 + v * 0.88})` }} />
        ))}
      </span>
      <span className="rec-bar-label">gravando</span>
      <button type="button" className="rec-bar-done" onClick={onStop} title="Parar e revisar antes de enviar">
        <CheckIcon size={18} /> <span className="rec-bar-done-label">PRONTO</span>
      </button>
    </div>
  );
}
