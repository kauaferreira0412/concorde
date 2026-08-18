import { useEffect, useState } from "react";
import { MaximizeIcon, ScreenShareIcon } from "./icons.jsx";

/**
 * Seletor de tela/janela customizado, so' usado dentro do app desktop (Electron - ver
 * preload.cjs/main.cjs). Existe pra dar mais controle do que o dialogo nativo do
 * navegador permite: aqui a gente sabe exatamente se o usuario escolheu "Tela Inteira"
 * (video + audio do sistema inteiro, nativo do Electron) ou "Janela" (video + audio so'
 * daquela janela, via modulo nativo do Windows - ver electron/native/window-audio-capture/
 * e startWindowAudioTrack em VoiceCallContext.jsx/windowAudioTrack.js).
 *
 * No NAVEGADOR normal (sem Electron) esse componente nunca e' montado - o fluxo cai pro
 * getDisplayMedia padrao, sem nenhuma mudanca (ver toggleScreenShare em VoiceCallContext.jsx).
 */
export default function ScreenSharePicker({ onSelect, onClose }) {
  const [sources, setSources] = useState(null); // null = carregando ainda
  const [tab, setTab] = useState("screen");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.concordeDesktop
      .listScreenSources()
      .then((list) => {
        if (!cancelled) setSources(list);
      })
      .catch((err) => {
        if (!cancelled) setError("Não foi possível listar as telas/janelas: " + err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (sources || []).filter((s) => s.type === tab);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Escolha o que compartilhar</h2>

        <div className="screen-picker-tabs">
          <button
            type="button"
            className={"screen-picker-tab" + (tab === "screen" ? " active" : "")}
            onClick={() => setTab("screen")}
          >
            <MaximizeIcon size={15} /> Tela Inteira
          </button>
          <button
            type="button"
            className={"screen-picker-tab" + (tab === "window" ? " active" : "")}
            onClick={() => setTab("window")}
          >
            <ScreenShareIcon size={15} /> Janela
          </button>
        </div>

        <p className="admin-hint" style={{ margin: 0 }}>
          {tab === "screen"
            ? "Compartilha a tela toda, com o áudio do sistema junto (o que estiver tocando no seu computador)."
            : "Compartilha só essa janela, com o áudio só dela (não leva o resto do que estiver tocando no seu computador)."}
        </p>

        {error && <p className="auth-error">{error}</p>}

        {sources === null && !error ? (
          <p className="admin-hint" style={{ margin: "20px 0", textAlign: "center" }}>
            Carregando…
          </p>
        ) : (
          <div className="screen-picker-grid">
            {filtered.length === 0 && (
              <p className="admin-hint" style={{ gridColumn: "1 / -1", textAlign: "center", margin: "20px 0" }}>
                {tab === "screen" ? "Nenhuma tela encontrada." : "Nenhuma janela aberta encontrada."}
              </p>
            )}
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="screen-picker-card"
                onClick={() => onSelect(s)}
                title={s.name}
              >
                <span className="screen-picker-thumb">
                  {s.thumbnailDataUrl ? (
                    <img src={s.thumbnailDataUrl} alt="" />
                  ) : (
                    <ScreenShareIcon size={26} />
                  )}
                </span>
                <span className="screen-picker-name">
                  {s.iconDataUrl && <img className="screen-picker-icon" src={s.iconDataUrl} alt="" />}
                  {s.name || (tab === "screen" ? "Tela" : "Janela")}
                </span>
              </button>
            ))}
          </div>
        )}

        <button type="button" className="link-btn" onClick={onClose} style={{ width: "auto", alignSelf: "flex-end" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
