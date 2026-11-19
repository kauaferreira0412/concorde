// Cópia da parte "pura" de frontend/src/theme/themes.js (mesmos tokens, temas base e presets),
// pra o app ter exatamente os mesmos temas do site. Mudou lá? Atualize aqui também.
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


// ---------- Código compartilhável ("CONCORDE-TEMA:<base64>"), compatível com o site ----------

const SHARE_PREFIX = "CONCORDE-TEMA:";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function utf8Bytes(str) {
  const out = [];
  for (const ch of str) {
    let c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function utf8Decode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let c;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    s += String.fromCodePoint(c);
  }
  return s;
}

function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

function fromBase64(str) {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((B64.indexOf(clean[i + 2]) & 63) << 6) |
      (B64.indexOf(clean[i + 3]) & 63);
    bytes.push((n >> 16) & 255);
    if (clean[i + 2] !== undefined) bytes.push((n >> 8) & 255);
    if (clean[i + 3] !== undefined) bytes.push(n & 255);
  }
  return bytes;
}

export function encodePreset({ name, base, colors, waves }) {
  return SHARE_PREFIX + toBase64(utf8Bytes(JSON.stringify({ v: 1, name, base, colors, waves })));
}

export function decodePreset(code) {
  const raw = (code || "").trim();
  if (!raw.startsWith(SHARE_PREFIX)) throw new Error("Código de tema inválido");
  let data;
  try {
    data = JSON.parse(utf8Decode(fromBase64(raw.slice(SHARE_PREFIX.length))));
  } catch {
    throw new Error("Código de tema inválido");
  }
  if (!data || (data.base !== "light" && data.base !== "dark")) throw new Error("Código de tema inválido");
  const name = String(data.name || "Tema importado").slice(0, 40);
  return { name, ...presetToAppearance(data) };
}

export function defaultAppearanceState() {
  const preset = BUILTIN_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
  return { ...presetToAppearance(preset), activePresetId: preset.id, customPresets: [] };
}

export function sanitizeAppearanceState(data) {
  if (!data || typeof data !== "object") return defaultAppearanceState();
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
}

// ---------- color-mix (srgb) pros tokens derivados, igual ao theme.css ----------

function hexToRgb(hex) {
  const h = (normalizeHex(hex) || "#000000").slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** color-mix(in srgb, a pct%, b) */
export function mix(a, pct, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const p = pct / 100;
  const ch = (x, y) => Math.round(x * p + y * (1 - p)).toString(16).padStart(2, "0");
  return "#" + ch(r1, r2) + ch(g1, g2) + ch(b1, b2);
}

/** a com transparência (pra fundos suaves) */
export function alpha(hex, pct) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${pct / 100})`;
}

/** Tokens finais do tema (os --c-* + os --t-* derivados do theme.css). */
export function buildTokens(base, colors, waves) {
  const c = resolveColors(base, colors);
  const dark = base !== "light";
  return {
    ...c,
    base,
    dark,
    waves,
    shadow: dark ? 6 : 5,
    textFaint: mix(c.textMuted, dark ? 85 : 80, c.surface),
    lineSoft: dark ? c.line : mix(c.line, 16, c.surface),
    voiceBg: dark ? mix(c.success, 22, c.surface) : mix(c.mint, 30, c.surface),
    accentText: dark ? mix(c.accent, 45, "#FFFFFF") : mix(c.accent, 80, c.ink),
    mintText: dark ? c.mint : mix(c.success, 85, c.ink),
    orangeText: dark ? c.orange : mix(c.orange, 45, "#7A2A00"),
    toneA: { bg: dark ? mix(c.accent, 45, c.surface) : mix(c.accent, 18, c.surface), fg: c.text, name: dark ? mix(c.accent, 45, "#FFFFFF") : mix(c.accent, 80, c.ink) },
    toneB: { bg: dark ? mix(c.success, 35, c.surface) : mix(c.mint, 45, c.surface), fg: c.text, name: dark ? c.mint : mix(c.success, 85, c.ink) },
    toneC: { bg: c.orange, fg: c.onPop, name: dark ? c.orange : mix(c.orange, 45, "#7A2A00") },
    hover: mix(c.accent, 12, c.surface),
    hoverStrong: mix(c.accent, 22, c.surface),
    mentionBg: dark ? c.orange : mix(c.orange, 35, c.surface),
    backdrop: alpha(c.ink, 62),
  };
}

const TONES = ["a", "b", "c"];

/** Mesmo sorteio de cor de avatar/nome do site (hash do nome). */
export function toneFor(name) {
  const s = (name || "?").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
