import { useRef, useState } from "react";
import { removeWallpaper, saveWallpaper, setUiPrefs, useUiPrefs } from "../utils/uiPrefs";
import { CheckIcon, ImageIcon, TrashIcon } from "./icons.jsx";

/** Miniatura do chat em lista ou em bolhas. */
function StyleThumb({ bubbles }) {
  return (
    <span className={"chatstyle-thumb" + (bubbles ? " bubbles" : "")} aria-hidden="true">
      <span className="chatstyle-line other">
        <i />
        <b />
      </span>
      <span className="chatstyle-line mine">
        <i />
        <b />
      </span>
      <span className="chatstyle-line other">
        <i />
        <b className="short" />
      </span>
    </span>
  );
}

/** Aparência: estilo das mensagens e imagem de fundo (salvos só nesse aparelho, fora do tema). */
export default function ChatLookSettings() {
  const prefs = useUiPrefs();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      await saveWallpaper(file);
    } catch (err) {
      setError(err.message || "Não deu pra usar essa imagem");
    } finally {
      setBusy(false);
    }
  }

  const hasImage = !!prefs.wallpaperUrl;

  return (
    <>
      <p className="settings-section-title">Mensagens</p>
      <div className="appearance-base-grid">
        {[
          { id: "list", label: "Lista" },
          { id: "bubbles", label: "Bolhas" },
        ].map((opt) => {
          const active = prefs.chatStyle === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={"appearance-base-card" + (active ? " active" : "")}
              onClick={() => setUiPrefs({ chatStyle: opt.id })}
              aria-pressed={active}
            >
              <StyleThumb bubbles={opt.id === "bubbles"} />
              <span className="appearance-base-name">
                {active && <CheckIcon size={16} />}
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="admin-hint" style={{ margin: 0 }}>
        Bolhas: suas mensagens ficam à direita e as dos outros à esquerda, tipo WhatsApp. Canais de avisos continuam
        do jeito normal.
      </p>

      <div className="settings-divider" />

      <p className="settings-section-title">Imagem de fundo</p>
      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" ref={fileRef} onChange={onPick} hidden />
      <div className="wallpaper-editor">
        <button
          type="button"
          className={"wallpaper-preview" + (hasImage ? " has-image" : "")}
          style={hasImage ? { backgroundImage: `url("${prefs.wallpaperUrl}")` } : undefined}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title={hasImage ? "Trocar imagem" : "Escolher imagem"}
        >
          {!hasImage && (
            <span>
              <ImageIcon size={22} />
              {busy ? "Carregando..." : "Escolher imagem"}
            </span>
          )}
        </button>
        <div className="wallpaper-controls">
          <div className="wallpaper-actions">
            <button type="button" className="appearance-btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImageIcon size={15} /> {busy ? "Carregando..." : hasImage ? "Trocar imagem" : "Escolher imagem"}
            </button>
            {hasImage && (
              <button type="button" className="appearance-btn" onClick={() => removeWallpaper()} disabled={busy}>
                <TrashIcon size={15} /> Remover
              </button>
            )}
          </div>
          <div className="wallpaper-mode" role="radiogroup" aria-label="Onde mostrar a imagem">
            {[
              { id: "off", label: "Desligado" },
              { id: "chat", label: "Só no chat" },
              { id: "app", label: "Fundo do app" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={prefs.wallpaperMode === m.id}
                className={"wallpaper-mode-btn" + (prefs.wallpaperMode === m.id ? " active" : "")}
                onClick={() => setUiPrefs({ wallpaperMode: m.id })}
                disabled={!hasImage && m.id !== "off"}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label className="wallpaper-slider">
            <span>Escurecer / clarear (legibilidade)</span>
            <input
              type="range"
              min={0}
              max={90}
              value={prefs.wallpaperDim}
              onChange={(e) => setUiPrefs({ wallpaperDim: Number(e.target.value) })}
              disabled={!hasImage}
            />
            <em>{prefs.wallpaperDim}%</em>
          </label>
          <label className="wallpaper-slider">
            <span>Desfoque</span>
            <input
              type="range"
              min={0}
              max={20}
              value={prefs.wallpaperBlur}
              onChange={(e) => setUiPrefs({ wallpaperBlur: Number(e.target.value) })}
              disabled={!hasImage}
            />
            <em>{prefs.wallpaperBlur}px</em>
          </label>
          {prefs.wallpaperMode === "app" && (
            <label className="settings-checkbox-row">
              <input type="checkbox" checked={prefs.glassPanels} onChange={(e) => setUiPrefs({ glassPanels: e.target.checked })} />
              Painéis de vidro (deixa a imagem aparecer por trás das listas e do chat)
            </label>
          )}
        </div>
      </div>
      <p className="admin-hint" style={{ margin: 0 }}>
        Fica salvo só nesse aparelho e não muda o seu tema nem os códigos de tema. A camada por cima usa a cor do tema,
        então o texto continua legível no claro e no escuro.
      </p>
      {error && <p className="auth-error">{error}</p>}

      <div className="settings-divider" />

      <p className="settings-section-title">Natal 🎄</p>
      <label className="settings-checkbox-row">
        <input type="checkbox" checked={prefs.snowEffect} onChange={(e) => setUiPrefs({ snowEffect: e.target.checked })} />
        Neve caindo e enfeite no canto da tela
      </label>
    </>
  );
}
