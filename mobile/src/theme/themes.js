// Mesmo sistema de temas do app web, portado pra cá: tema BASE (claro/escuro) + cores
// sobrescritas pelo usuário. Aqui não tem CSS var/DOM — a tela toda recalcula o estilo
// quando o objeto de cores resolvido muda (useAppTheme()).

export const THEME_TOKENS = [
  { key: "bg", label: "Fundo do app", group: "Superfícies" },
  { key: "surface", label: "Painéis", group: "Superfícies" },
  { key: "surface2", label: "Campos e cartões", group: "Superfícies" },
  { key: "line", label: "Divisórias", group: "Superfícies" },
  { key: "text", label: "Texto", group: "Texto" },
  { key: "textMuted", label: "Texto secundário", group: "Texto" },
  { key: "onAccent", label: "Texto sobre o destaque", group: "Texto" },
  { key: "accent", label: "Destaque", group: "Cores" },
  { key: "mint", label: "Secundária", group: "Cores" },
  { key: "orange", label: "Realce", group: "Cores" },
  { key: "success", label: "Online / sucesso", group: "Cores" },
  { key: "danger", label: "Perigo", group: "Cores" },
];

export const TOKEN_GROUPS = ["Cores", "Superfícies", "Texto"];

export const BASE_THEMES = {
  light: {
    label: "Claro",
    colors: {
      bg: "#8EE6D6",
      surface: "#FFFDF7",
      surface2: "#F3EEFF",
      line: "#D8D0F0",
      text: "#1A1423",
      textMuted: "#5B5468",
      onAccent: "#FFFDF7",
      accent: "#6B3FD6",
      mint: "#8EE6D6",
      orange: "#F6A56E",
      success: "#13806C",
      danger: "#E5484D",
    },
  },
  dark: {
    label: "Escuro",
    colors: {
      bg: "#2B1A63",
      surface: "#15122B",
      surface2: "#2A2550",
      line: "#3A3368",
      text: "#F4F1FF",
      textMuted: "#B4ACD6",
      onAccent: "#FFFDF7",
      accent: "#7C4DEB",
      mint: "#6FE3CF",
      orange: "#F6A56E",
      success: "#3DDC97",
      danger: "#E5484D",
    },
  },
};

export const BUILTIN_PRESETS = [
  { id: "builtin:escuro", name: "Noturno roxo", base: "dark", colors: {}, builtin: true },
  { id: "builtin:claro", name: "Adesivo claro", base: "light", colors: {}, builtin: true },
  {
    id: "builtin:ceu",
    name: "Céu de tarde",
    base: "light",
    colors: { bg: "#7FD8F0", mint: "#7FD8F0", accent: "#5A2FC2", orange: "#FFB980" },
    builtin: true,
  },
  {
    id: "builtin:floresta",
    name: "Floresta à noite",
    base: "dark",
    colors: { bg: "#0F3B36", surface: "#10201E", surface2: "#1B3531", line: "#2A4D47", accent: "#8B5CF6", textMuted: "#A9C9C2" },
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
  return { base, colors: cleanColors(base, preset.colors) };
}

export function sameAppearance(a, b) {
  if (a.base !== b.base) return false;
  const ka = Object.keys(a.colors);
  const kb = Object.keys(b.colors);
  return ka.length === kb.length && ka.every((k) => a.colors[k] === b.colors[k]);
}

const STORAGE_KEY = "concorde:appearance:v1";

export function defaultAppearanceState() {
  const preset = BUILTIN_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID);
  return { ...presetToAppearance(preset), activePresetId: preset.id, customPresets: [] };
}

export async function loadAppearanceState(AsyncStorage) {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
      activePresetId: typeof data.activePresetId === "string" ? data.activePresetId : null,
      customPresets,
    };
  } catch {
    return defaultAppearanceState();
  }
}

export async function saveAppearanceState(AsyncStorage, state) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // guardado só nessa sessão
  }
}
