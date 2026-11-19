import { useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";

export const ACCENT_SWATCHES = [
  "#7C5CFF",
  "#FF5C8A",
  "#E5484D",
  "#FF8A3D",
  "#FFC93D",
  "#A3E635",
  "#3DDC97",
  "#2EC4F1",
  "#3D7BFF",
  "#C084FC",
];

/**
 * Estilo inline com a cor de destaque do perfil (vira a var --profile-accent no CSS).
 * Com a segunda cor, também define --profile-accent-2 (gradiente).
 */
export function accentStyle(color, extra, color2) {
  if (!color) return extra;
  const style = { ...extra, "--profile-accent": color };
  if (color2) style["--profile-accent-2"] = color2;
  return style;
}

/** Uma fileira de cores (nenhuma + paleta + cor livre) que salva sozinha no perfil. */
function ColorRow({ field, endpoint, label, noneTitle, disabled }) {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = user?.[field] || null;
  const customTimer = useRef(null);
  const savedRef = useRef(current);

  // O seletor nativo dispara a cada arrastada: mostra na hora e só salva quando para de mexer.
  function pickCustom(color) {
    updateUser({ [field]: color });
    clearTimeout(customTimer.current);
    customTimer.current = setTimeout(() => save(color, savedRef.current), 450);
  }

  async function save(color, prev = savedRef.current) {
    clearTimeout(customTimer.current);
    if ((color || null) === prev) return;
    updateUser({ [field]: color || null });
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put(endpoint, { color: color || "" });
      updateUser({ [field]: data[field] || null });
      savedRef.current = data[field] || null;
    } catch (err) {
      updateUser({ [field]: prev });
      setError(err.response?.data?.error || "Não deu pra salvar a cor agora");
    } finally {
      setSaving(false);
    }
  }

  const isCustom = current && !ACCENT_SWATCHES.includes(current);
  const off = saving || disabled;

  return (
    <>
      <div className={"accent-picker" + (disabled ? " disabled" : "")} role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={!current}
          className={"accent-swatch accent-swatch-none" + (!current ? " selected" : "")}
          onClick={() => save(null)}
          disabled={off}
          title={noneTitle}
        >
          <span aria-hidden="true">∅</span>
        </button>
        {ACCENT_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={current === c}
            className={"accent-swatch" + (current === c ? " selected" : "")}
            style={{ "--swatch": c }}
            onClick={() => save(c)}
            disabled={off}
            title={c}
          />
        ))}
        <label
          className={"accent-swatch accent-swatch-custom" + (isCustom ? " selected" : "")}
          style={isCustom ? { "--swatch": current } : undefined}
          title="Escolher outra cor"
        >
          <input
            type="color"
            value={current || "#7C5CFF"}
            onChange={(e) => pickCustom(e.target.value.toUpperCase())}
            disabled={disabled}
            aria-label={`${label}: escolher outra cor`}
          />
          {!isCustom && <span aria-hidden="true">+</span>}
        </label>
      </div>
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}

/** Cor de destaque do perfil: tinge o card do perfil e o seu nome no chat. Com a 2ª cor, vira gradiente. */
export default function AccentColorPicker() {
  const { user } = useAuth();
  const hasMain = !!user?.accentColor;
  const c1 = user?.accentColor;
  const c2 = user?.accentColor2;

  return (
    <div className="settings-field">
      <label className="settings-label">Cor do perfil</label>
      <ColorRow field="accentColor" endpoint="/api/users/me/accent-color" label="Cor do perfil" noneTitle="Padrão do tema" />
      <label className="settings-label" style={{ marginTop: 6 }}>
        Segunda cor (gradiente)
      </label>
      <ColorRow
        field="accentColor2"
        endpoint="/api/users/me/accent-color-2"
        label="Segunda cor do perfil"
        noneTitle="Sem gradiente (só uma cor)"
        disabled={!hasMain}
      />
      {hasMain && c2 && (
        <span
          className="accent-gradient-preview"
          style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }}
          aria-label="Prévia do gradiente"
        />
      )}
      <p className="admin-hint" style={{ margin: 0 }}>
        Pinta o fundo do seu card de perfil (quando não tem banner) e o seu nome nas mensagens.
        {hasMain ? " Com a segunda cor, os dois viram um gradiente." : " Escolha a primeira cor pra liberar o gradiente."}
      </p>
    </div>
  );
}
