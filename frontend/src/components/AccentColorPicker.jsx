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

/** Estilo inline com a cor de destaque do perfil (vira a var --profile-accent no CSS). */
export function accentStyle(color, extra) {
  if (!color) return extra;
  return { ...extra, "--profile-accent": color };
}

/** Cor de destaque do perfil: tinge o card do perfil e o seu nome no chat. */
export default function AccentColorPicker() {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = user?.accentColor || null;
  const customTimer = useRef(null);
  const savedRef = useRef(current);

  // O seletor nativo dispara a cada arrastada: mostra na hora e só salva quando para de mexer.
  function pickCustom(color) {
    updateUser({ accentColor: color });
    clearTimeout(customTimer.current);
    customTimer.current = setTimeout(() => save(color, savedRef.current), 450);
  }

  async function save(color, prev = savedRef.current) {
    clearTimeout(customTimer.current);
    if ((color || null) === prev) return;
    updateUser({ accentColor: color || null });
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/api/users/me/accent-color", { color: color || "" });
      updateUser({ accentColor: data.accentColor || null });
      savedRef.current = data.accentColor || null;
    } catch (err) {
      updateUser({ accentColor: prev });
      setError(err.response?.data?.error || "Não deu pra salvar a cor agora");
    } finally {
      setSaving(false);
    }
  }

  const isCustom = current && !ACCENT_SWATCHES.includes(current);

  return (
    <div className="settings-field">
      <label className="settings-label">Cor do perfil</label>
      <div className="accent-picker" role="radiogroup" aria-label="Cor do perfil">
        <button
          type="button"
          role="radio"
          aria-checked={!current}
          className={"accent-swatch accent-swatch-none" + (!current ? " selected" : "")}
          onClick={() => save(null)}
          disabled={saving}
          title="Padrão do tema"
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
            disabled={saving}
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
            aria-label="Escolher outra cor"
          />
          {!isCustom && <span aria-hidden="true">+</span>}
        </label>
      </div>
      <p className="admin-hint" style={{ margin: 0 }}>
        Pinta o fundo do seu card de perfil (quando não tem banner) e o seu nome nas mensagens.
      </p>
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
