// Sistema de temas do Concorde (estilo "adesivo": contorno grosso + sombra sólida).
//
// Um tema é sempre: um tema BASE (claro ou escuro) + cores sobrescritas pelo usuário + ondas no fundo.
// As cores editáveis viram variáveis CSS --c-* no <html>; o resto (hover, tons de avatar, fundos suaves)
// é derivado delas no CSS com color-mix, então qualquer combinação continua coerente.

export const THEME_TOKENS = [
  { key: "bg", css: "--c-bg", label: "Fundo do app", group: "Superfícies" },
  { key: "surface", css: "--c-surface", label: "Painéis", group: "Superfícies" },
  { key: "surface2", css: "--c-surface-2", label: "Campos e cartões", group: "Superfícies" },
  { key: "ink", css: "--c-ink", label: "Contorno e sombra", group: "Superfícies" },
  { key: "line", css: "--c-line", label: "Divisórias", group: "Superfícies" },
  { key: "wave", css: "--c-wave", label: "Ondas do fundo", group: "Superfícies" },
  { key: "text", css: "--c-text", label: "Texto", group: "Texto" },
  { key: "textMuted", css: "--c-text-muted", label: "Texto secundário", group: "Texto" },
  { key: "onAccent", css: "--c-on-accent", label: "Texto sobre o destaque", group: "Texto" },
  { key: "onPop", css: "--c-on-pop", label: "Texto sobre menta/laranja", group: "Texto" },
  { key: "accent", css: "--c-accent", label: "Destaque", group: "Cores" },
  { key: "mint", css: "--c-mint", label: "Secundária", group: "Cores" },
  { key: "orange", css: "--c-orange", label: "Realce", group: "Cores" },
  { key: "success", css: "--c-success", label: "Online / sucesso", group: "Cores" },
  { key: "danger", css: "--c-danger", label: "Perigo", group: "Cores" },
];

export const TOKEN_GROUPS = ["Cores", "Superfícies", "Texto"];

// Valores exatos dos designs "A · Adesivo (claro)" e "A7 · Noturno Roxo do Fone".
export const BASE_THEMES = {
  light: {
    label: "Claro",
    waves: false,
    colors: {
      bg: "#8EE6D6",
      surface: "#FFFDF7",
      surface2: "#F3EEFF",
      ink: "#1A1423",
      line: "#1A1423",
      wave: "#7FD9C9",
      text: "#1A1423",
      textMuted: "#3B3346",
      onAccent: "#FFFDF7",
      onPop: "#1A1423",
      accent: "#6B3FD6",
      mint: "#8EE6D6",
      orange: "#F6A56E",
      success: "#13806C",
      danger: "#E5484D",
    },
  },
  dark: {
    label: "Escuro",
    waves: true,
    colors: {
      bg: "#2B1A63",
      surface: "#15122B",
      surface2: "#2A2550",
      ink: "#000000",
      line: "#3A3368",
      wave: "#3A2585",
      text: "#F4F1FF",
      textMuted: "#B4ACD6",
      onAccent: "#FFFDF7",
      onPop: "#1A1423",
      accent: "#7C4DEB",
      mint: "#6FE3CF",
      orange: "#F6A56E",
      success: "#3DDC97",
      danger: "#E5484D",
    },
  },
};

export const BUILTIN_PRESETS = [
  { id: "builtin:escuro", name: "Noturno roxo", base: "dark", waves: true, colors: {}, builtin: true },
  { id: "builtin:claro", name: "Adesivo claro", base: "light", waves: false, colors: {}, builtin: true },
  {
    id: "builtin:ceu",
    name: "Céu de tarde",
    base: "light",
    waves: true,
    colors: { bg: "#7FD8F0", wave: "#6CCBE6", mint: "#7FD8F0", accent: "#5A2FC2", orange: "#FFB980" },
    builtin: true,
  },
  {
    id: "builtin:floresta",
    name: "Floresta à noite",
    base: "dark",
    waves: true,
    colors: { bg: "#0F3B36", wave: "#165047", surface: "#10201E", surface2: "#1B3531", line: "#2A4D47", accent: "#8B5CF6", textMuted: "#A9C9C2" },
    builtin: true,
  },
];

export const DEFAULT_PRESET_ID = "builtin:escuro";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHex(value) {
  return typeof value === "string" && HEX_RE.test(value);
}

export function normalizeHex(value) {
  if (typeof value !== "string") return null;
  let v = value.trim();
  if (!v.startsWith("#")) v = "#" + v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) v = "#" + v.slice(1).split("").map((c) => c + c).join("");
  return isValidHex(v) ? v.toUpperCase() : null;
}

/** Remove chaves desconhecidas, cores inválidas e cores iguais às do tema base. */
export function cleanColors(base, colors) {
  const baseColors = BASE_THEMES[base]?.colors || BASE_THEMES.dark.colors;
  const out = {};
  for (const { key } of THEME_TOKENS) {
    const v = normalizeHex(colors?.[key]);
    if (v && v !== baseColors[key].toUpperCase()) out[key] = v;
  }
  return out;
}

export function resolveColors(base, colors) {
  return { ...(BASE_THEMES[base] || BASE_THEMES.dark).colors, ...(colors || {}) };
}

export function presetToAppearance(preset) {
  const base = preset.base === "light" ? "light" : "dark";
  return {
    base,
    colors: cleanColors(base, preset.colors),
    waves: typeof preset.waves === "boolean" ? preset.waves : BASE_THEMES[base].waves,
  };
}

export function sameAppearance(a, b) {
  if (a.base !== b.base || a.waves !== b.waves) return false;
  const ka = Object.keys(a.colors);
  const kb = Object.keys(b.colors);
  return ka.length === kb.length && ka.every((k) => a.colors[k] === b.colors[k]);
}

// ---------- Código compartilhável de preset ("CONCORDE-TEMA:<base64>") ----------

const SHARE_PREFIX = "CONCORDE-TEMA:";

export function encodePreset({ name, base, colors, waves }) {
  const json = JSON.stringify({ v: 1, name, base, colors, waves });
  return SHARE_PREFIX + btoa(unescape(encodeURIComponent(json)));
}

export function decodePreset(code) {
  const raw = (code || "").trim();
  if (!raw.startsWith(SHARE_PREFIX)) throw new Error("Código de tema inválido");
  const data = JSON.parse(decodeURIComponent(escape(atob(raw.slice(SHARE_PREFIX.length)))));
  if (!data || (data.base !== "light" && data.base !== "dark")) throw new Error("Código de tema inválido");
  const name = String(data.name || "Tema importado").slice(0, 40);
  return { name, ...presetToAppearance(data) };
}

// ---------- Persistência + aplicação no DOM ----------

const STORAGE_KEY = "concorde:appearance:v1";

export function defaultAppearanceState() {
  const preset = BUILTIN_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
  return { ...presetToAppearance(preset), activePresetId: preset.id, customPresets: [] };
}

export function loadAppearanceState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAppearanceState();
    const data = JSON.parse(raw);
    const base = data.base === "light" ? "light" : "dark";
    const customPresets = Array.isArray(data.customPresets)
      ? data.customPresets
          .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
          .map((p) => ({ id: p.id, name: p.name.slice(0, 40), ...presetToAppearance(p) }))
      : [];
    return {
      base,
      colors: cleanColors(base, data.colors),
      waves: typeof data.waves === "boolean" ? data.waves : BASE_THEMES[base].waves,
      activePresetId: typeof data.activePresetId === "string" ? data.activePresetId : null,
      customPresets,
    };
  } catch {
    return defaultAppearanceState();
  }
}

export function saveAppearanceState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // armazenamento cheio/bloqueado: o tema continua valendo só nessa sessão
  }
}

export function applyAppearance({ base, colors, waves }) {
  const root = document.documentElement;
  root.dataset.theme = base;
  root.dataset.waves = waves ? "on" : "off";
  for (const { key, css } of THEME_TOKENS) {
    if (colors[key]) root.style.setProperty(css, colors[key]);
    else root.style.removeProperty(css);
  }
  root.style.colorScheme = base;

  const resolved = resolveColors(base, colors);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved.bg);
  try {
    window.concordeDesktop?.setTitleBarColors?.({ color: resolved.bg, symbolColor: resolved.text });
  } catch {
    // instalador antigo sem essa API: ignora
  }
}
