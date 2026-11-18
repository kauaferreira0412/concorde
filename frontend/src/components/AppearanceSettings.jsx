import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { BASE_THEMES, THEME_TOKENS, TOKEN_GROUPS, normalizeHex, resolveColors } from "../theme/themes";
import { CheckIcon, CopyIcon, PlusIcon, TrashIcon, XIcon } from "./icons.jsx";

const SWATCH_KEYS = ["bg", "surface", "accent", "mint", "orange"];

/** Miniatura do layout (trilho + sidebar + chat) desenhada com as cores do tema. */
function ThemeThumb({ colors, waves }) {
  return (
    <span
      className={"appearance-thumb" + (waves ? " waves" : "")}
      style={{ "--th-bg": colors.bg, "--th-surface": colors.surface, "--th-ink": colors.ink, "--th-accent": colors.accent, "--th-mint": colors.mint, "--th-orange": colors.orange, "--th-text": colors.text, "--th-wave": colors.wave }}
      aria-hidden="true"
    >
      <span className="appearance-thumb-rail" />
      <span className="appearance-thumb-side">
        <span className="appearance-thumb-side-head" />
        <span className="appearance-thumb-line" />
        <span className="appearance-thumb-line active" />
        <span className="appearance-thumb-line" />
      </span>
      <span className="appearance-thumb-main">
        <span className="appearance-thumb-msg"><i style={{ background: colors.orange }} /><b /></span>
        <span className="appearance-thumb-msg"><i style={{ background: colors.mint }} /><b /></span>
        <span className="appearance-thumb-send" />
      </span>
    </span>
  );
}

function ColorRow({ token, value, overridden, onChange, onReset }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  function commitText() {
    const hex = normalizeHex(text);
    if (hex) onChange(hex);
    else setText(value);
  }

  return (
    <div className={"appearance-color-row" + (overridden ? " overridden" : "")}>
      <label className="appearance-color-swatch" style={{ background: value }} title={`Escolher cor: ${token.label}`}>
        <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value)} aria-label={token.label} />
      </label>
      <span className="appearance-color-label">{token.label}</span>
      <input
        className="appearance-color-hex"
        value={text}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => e.key === "Enter" && commitText()}
        aria-label={`${token.label} (hex)`}
      />
      <button
        type="button"
        className="appearance-color-reset"
        onClick={onReset}
        disabled={!overridden}
        title="Voltar pra cor do tema base"
      >
        <XIcon size={14} />
      </button>
    </div>
  );
}

export default function AppearanceSettings() {
  const theme = useTheme();
  const [presetName, setPresetName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const [message, setMessage] = useState(null);
  const flashTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const activePreset = theme.presets.find((p) => p.id === theme.activePresetId);
  const activeCustom = activePreset && !activePreset.builtin ? activePreset : null;

  function flash(text, kind = "ok") {
    setMessage({ text, kind });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setMessage(null), 3500);
  }

  function handleSave(e) {
    e.preventDefault();
    const name = presetName.trim();
    if (!name) return;
    theme.savePreset(name);
    setPresetName("");
    flash(`Preset "${name}" salvo.`);
  }

  async function handleCopy() {
    const code = theme.exportCurrent(activePreset?.name || presetName.trim() || "Meu tema");
    try {
      await navigator.clipboard.writeText(code);
      flash("Código do tema copiado — manda pros amigos colarem em Importar.");
    } catch {
      setImportOpen(true);
      setImportCode(code);
      flash("Não deu pra copiar automático; o código está no campo abaixo.", "error");
    }
  }

  function handleImport(e) {
    e.preventDefault();
    try {
      theme.importPreset(importCode);
      setImportCode("");
      setImportOpen(false);
      flash("Tema importado e aplicado.");
    } catch (err) {
      flash(err.message || "Código de tema inválido", "error");
    }
  }

  const resolved = theme.resolved;

  return (
    <>
      <p className="settings-section-title">Tema base</p>
      <p className="admin-hint" style={{ margin: 0 }}>
        Tudo muda na hora e fica salvo nesse dispositivo.
      </p>
      <div className="appearance-base-grid">
        {["light", "dark"].map((base) => {
          const isActive = theme.base === base;
          return (
            <button
              key={base}
              type="button"
              className={"appearance-base-card" + (isActive ? " active" : "")}
              onClick={() => !isActive && theme.setBase(base)}
              aria-pressed={isActive}
            >
              <ThemeThumb colors={BASE_THEMES[base].colors} waves={BASE_THEMES[base].waves} />
              <span className="appearance-base-name">
                {isActive && <CheckIcon size={16} />}
                {BASE_THEMES[base].label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="settings-divider" />

      <p className="settings-section-title">Presets</p>
      <div className="appearance-preset-grid">
        {theme.presets.map((p) => {
          const colors = resolveColors(p.base, p.colors);
          const isActive = p.id === theme.activePresetId;
          return (
            <div key={p.id} className={"appearance-preset" + (isActive ? " active" : "")}>
              <button type="button" className="appearance-preset-apply" onClick={() => theme.applyPreset(p.id)} title={`Aplicar "${p.name}"`}>
                <span className="appearance-preset-swatches" aria-hidden="true">
                  {SWATCH_KEYS.map((k) => (
                    <span key={k} style={{ background: colors[k] }} />
                  ))}
                </span>
                <span className="appearance-preset-name">{p.name}</span>
                <span className="appearance-preset-meta">
                  {p.builtin ? "padrão" : "seu"} · {p.base === "light" ? "claro" : "escuro"}
                </span>
              </button>
              {!p.builtin && (
                <button
                  type="button"
                  className="appearance-preset-delete"
                  onClick={() => theme.deletePreset(p.id)}
                  title={`Apagar "${p.name}"`}
                >
                  <TrashIcon size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!activePreset && (
        <p className="appearance-unsaved">
          Você mexeu nas cores — esse tema ainda não está salvo como preset.
        </p>
      )}

      <form className="appearance-save-row" onSubmit={handleSave}>
        <input
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="Nome do preset (ex.: Roxo da madrugada)"
          maxLength={40}
          aria-label="Nome do novo preset"
        />
        <button type="submit" className="appearance-btn primary" disabled={!presetName.trim()}>
          <PlusIcon size={16} /> Salvar como preset
        </button>
      </form>
      <div className="appearance-actions">
        {activeCustom && (
          <button type="button" className="appearance-btn" onClick={() => theme.overwritePreset(activeCustom.id)}>
            Atualizar "{activeCustom.name}"
          </button>
        )}
        <button type="button" className="appearance-btn" onClick={handleCopy}>
          <CopyIcon size={15} /> Copiar código do tema
        </button>
        <button type="button" className="appearance-btn" onClick={() => setImportOpen((v) => !v)} aria-expanded={importOpen}>
          Importar código
        </button>
      </div>
      {importOpen && (
        <form className="appearance-save-row" onSubmit={handleImport}>
          <input
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            placeholder="Cole aqui o CONCORDE-TEMA:..."
            spellCheck={false}
            aria-label="Código do tema pra importar"
          />
          <button type="submit" className="appearance-btn primary" disabled={!importCode.trim()}>
            Importar
          </button>
        </form>
      )}
      {message && <p className={"appearance-message " + message.kind}>{message.text}</p>}

      <div className="settings-divider" />

      <div className="appearance-colors-head">
        <p className="settings-section-title">Cores</p>
        <button type="button" className="link-btn" onClick={theme.resetAll} disabled={Object.keys(theme.colors).length === 0 && theme.waves === BASE_THEMES[theme.base].waves}>
          Restaurar tema {BASE_THEMES[theme.base].label.toLowerCase()}
        </button>
      </div>

      <label className="settings-checkbox-row">
        <input type="checkbox" checked={theme.waves} onChange={(e) => theme.setWaves(e.target.checked)} />
        Ondas no fundo
      </label>

      {TOKEN_GROUPS.map((group) => (
        <div key={group} className="appearance-color-group">
          <p className="settings-label">{group}</p>
          <div className="appearance-color-list">
            {THEME_TOKENS.filter((t) => t.group === group).map((t) => (
              <ColorRow
                key={t.key}
                token={t}
                value={resolved[t.key]}
                overridden={!!theme.colors[t.key]}
                onChange={(v) => theme.setColor(t.key, v)}
                onReset={() => theme.resetColor(t.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
