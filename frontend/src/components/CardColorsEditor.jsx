import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext.jsx";
import Avatar from "./Avatar.jsx";
import { accentStyle } from "./AccentColorPicker.jsx";
import {
  CARD_COLOR_FIELDS,
  CARD_COLOR_PRESETS,
  cardColorClass,
  cardColorStyle,
  cardColorsFromCurrentTheme,
  cleanCardColors,
  hasCardColors,
} from "../utils/cardColors";

/**
 * "Card do perfil": cores próprias pro card que os outros veem (fundo, caixas, contorno, textos, botões e faixa).
 * Cada cor vazia segue o tema de quem está vendo. Mostra uma prévia ao vivo e salva sozinho.
 */
export default function CardColorsEditor() {
  const { user, updateUser } = useAuth();
  const [colors, setColors] = useState(() => cleanCardColors(user?.cardColors));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savedRef = useRef(JSON.stringify(cleanCardColors(user?.cardColors)));
  const timer = useRef(null);

  // cor do perfil (faixa do topo + sombra do card) e a 2ª cor do gradiente: campos próprios do usuário
  const accentTimers = useRef({});
  const accentSaved = useRef({ accentColor: user?.accentColor || null, accentColor2: user?.accentColor2 || null });

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      Object.values(accentTimers.current).forEach(clearTimeout);
    },
    []
  );

  function setAccent(field, color, delay = 450) {
    const value = color || null;
    const patch = { [field]: value };
    // sem a 1ª cor não existe gradiente
    if (field === "accentColor" && !value) patch.accentColor2 = null;
    updateUser(patch);
    for (const [f, v] of Object.entries(patch)) {
      clearTimeout(accentTimers.current[f]);
      accentTimers.current[f] = setTimeout(() => saveAccent(f, v), delay);
    }
  }

  async function saveAccent(field, value) {
    if (accentSaved.current[field] === value) return;
    const prev = accentSaved.current[field];
    const endpoint = field === "accentColor" ? "/api/users/me/accent-color" : "/api/users/me/accent-color-2";
    try {
      const { data } = await api.put(endpoint, { color: value || "" });
      accentSaved.current[field] = data[field] || null;
      updateUser({ [field]: data[field] || null });
    } catch (err) {
      updateUser({ [field]: prev });
      setError(err.response?.data?.error || "Não deu pra salvar a cor agora");
    }
  }

  /** Aplica um conjunto pronto: cores do card + cor da faixa. */
  function applySet(set) {
    const { banner, ...rest } = set || {};
    apply(rest, 0);
    setAccent("accentColor", banner || null, 0);
    setAccent("accentColor2", null, 0);
  }

  const accentRows = [
    { field: "accentColor", label: "Faixa do topo e sombra", empty: "do tema" },
    { field: "accentColor2", label: "Faixa: 2ª cor (gradiente)", empty: "sem gradiente", disabled: !user?.accentColor },
  ];

  function apply(next, delay = 450) {
    const clean = cleanCardColors(next);
    setColors(clean);
    updateUser({ cardColors: clean });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(clean), delay);
  }

  async function save(clean) {
    const key = JSON.stringify(clean);
    if (key === savedRef.current) return;
    const prev = savedRef.current;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/api/users/me/card-colors", { colors: clean });
      savedRef.current = JSON.stringify(cleanCardColors(data.cardColors));
      updateUser({ cardColors: data.cardColors || {} });
    } catch (err) {
      const old = JSON.parse(prev);
      setColors(old);
      updateUser({ cardColors: old });
      setError(err.response?.data?.error || "Não deu pra salvar as cores do card agora");
    } finally {
      setSaving(false);
    }
  }

  const custom = hasCardColors(colors) || !!user?.accentColor;
  const previewStyle = cardColorStyle(colors, accentStyle(user?.accentColor, undefined, user?.accentColor2));

  return (
    <div className="settings-field card-colors-editor">
      <label className="settings-label">Card do perfil</label>
      <p className="admin-hint" style={{ margin: 0 }}>
        Escolha as cores do seu card do jeito que quiser: elas aparecem igual pra todo mundo, independente do tema de
        cada um. Cor vazia segue o tema de quem está vendo. A faixa do topo aparece quando você não tem banner.
      </p>

      <div className="card-colors-layout">
        <div
          className={"card-colors-preview" + (user?.accentColor ? " has-accent" : "") + cardColorClass(colors)}
          style={previewStyle}
          aria-label="Prévia do seu card"
        >
          <div
            className={"card-colors-preview-banner" + (user?.bannerUrl ? " has-image" : "")}
            style={user?.bannerUrl ? { backgroundImage: `url("${user.bannerUrl}")` } : undefined}
          />
          <div className="card-colors-preview-body">
            <Avatar name={user?.username} url={user?.avatarUrl} className="card-colors-preview-avatar" />
            <strong>{user?.nickname || user?.username}</strong>
            <span className="card-colors-preview-muted">@{user?.username}</span>
            <span className="card-colors-preview-button">Enviar mensagem</span>
            <span className="card-colors-preview-title">Sobre mim</span>
            <span className="card-colors-preview-box">{user?.bio || "Um pouco sobre você..."}</span>
            <span className="card-colors-preview-title">Informações</span>
            <div className="card-colors-preview-info">
              <span className="card-colors-preview-box">
                <small>Membro desde</small>
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "2026"}
              </span>
              <span className="card-colors-preview-box">
                <small>Cargo</small>
                {user?.role === "ADMIN" ? "Admin" : "Usuário"}
              </span>
            </div>
          </div>
        </div>

        <div className="card-colors-fields">
          {CARD_COLOR_FIELDS.map((f) => (
            <div key={f.key} className="card-colors-row">
              <label className={"accent-swatch accent-swatch-custom" + (colors[f.key] ? " selected" : "")} style={colors[f.key] ? { "--swatch": colors[f.key] } : undefined}>
                <input
                  type="color"
                  value={colors[f.key] || "#7C5CFF"}
                  onChange={(e) => apply({ ...colors, [f.key]: e.target.value.toUpperCase() })}
                  aria-label={f.label}
                />
                {!colors[f.key] && <span aria-hidden="true">+</span>}
              </label>
              <span className="card-colors-label">
                {f.label}
                <small>{colors[f.key] || "do tema"}</small>
              </span>
              {colors[f.key] && (
                <button
                  type="button"
                  className="link-btn card-colors-clear"
                  onClick={() => {
                    const next = { ...colors };
                    delete next[f.key];
                    apply(next, 0);
                  }}
                  title="Voltar a usar a cor do tema"
                >
                  tema
                </button>
              )}
            </div>
          ))}
          {accentRows.map((r) => {
            const value = user?.[r.field] || null;
            return (
              <div key={r.field} className={"card-colors-row" + (r.disabled ? " disabled" : "")}>
                <label
                  className={"accent-swatch accent-swatch-custom" + (value ? " selected" : "")}
                  style={value ? { "--swatch": value } : undefined}
                  title={r.disabled ? "Escolha a cor da faixa primeiro" : undefined}
                >
                  <input
                    type="color"
                    value={value || "#7C5CFF"}
                    disabled={r.disabled}
                    onChange={(e) => setAccent(r.field, e.target.value.toUpperCase())}
                    aria-label={r.label}
                  />
                  {!value && <span aria-hidden="true">+</span>}
                </label>
                <span className="card-colors-label">
                  {r.label}
                  <small>{value || r.empty}</small>
                </span>
                {value && (
                  <button type="button" className="link-btn card-colors-clear" onClick={() => setAccent(r.field, null, 0)} title="Tirar essa cor">
                    tirar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-colors-presets">
        <button
          type="button"
          className="appearance-btn card-colors-preset card-colors-preset-mine"
          onClick={() => applySet(cardColorsFromCurrentTheme())}
          title="Copia as cores do tema que você está usando agora pro seu card, e todo mundo passa a ver ele assim"
        >
          <span className="card-colors-preset-dots" aria-hidden="true">
            <i style={{ background: "var(--c-surface)" }} />
            <i style={{ background: "var(--c-accent)" }} />
            <i style={{ background: "var(--c-text)" }} />
          </span>
          Usar meu tema atual
        </button>
        {CARD_COLOR_PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            className="appearance-btn card-colors-preset"
            onClick={() => applySet(p.colors)}
            title={`Usar as cores "${p.name}"`}
          >
            <span className="card-colors-preset-dots" aria-hidden="true">
              {["bg", "accent", "text"].map((k) => (
                <i key={k} style={{ background: p.colors[k] }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
        {custom && (
          <button type="button" className="appearance-btn" onClick={() => applySet({})}>
            Voltar pro tema
          </button>
        )}
        {saving && <span className="admin-hint">Salvando...</span>}
      </div>
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
