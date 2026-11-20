/**
 * Cores próprias do card de perfil. Cada cor é opcional: a que ficar vazia segue o tema de quem está vendo.
 * As variáveis do tema são redeclaradas no próprio card, então tudo lá dentro (caixas, textos, botões,
 * contornos) passa a usar as cores escolhidas sem mexer no resto do app.
 */
export const CARD_COLOR_FIELDS = [
  { key: "bg", label: "Fundo do card" },
  { key: "surface", label: "Caixas e blocos" },
  { key: "border", label: "Contorno e sombra" },
  { key: "text", label: "Texto principal" },
  { key: "muted", label: "Texto secundário" },
  { key: "accent", label: "Botões e títulos" },
];

/** Combinações prontas pra começar (dá pra ajustar cada cor depois). */
export const CARD_COLOR_PRESETS = [
  { name: "Meia-noite", colors: { bg: "#14121F", surface: "#221E36", border: "#000000", text: "#F4F1FF", muted: "#A79FCB", accent: "#8B6CFF", banner: "#3B2A7A" } },
  { name: "Papel", colors: { bg: "#FFFDF7", surface: "#F1ECDF", border: "#1A1423", text: "#1A1423", muted: "#5B5466", accent: "#E5484D", banner: "#F6A56E" } },
  { name: "Menta", colors: { bg: "#0F2A27", surface: "#16403B", border: "#04110F", text: "#E8FFF9", muted: "#9CD9CC", accent: "#6FE3CF", banner: "#1F6B60" } },
  { name: "Vinho", colors: { bg: "#1E0E14", surface: "#33171F", border: "#000000", text: "#FFEFF2", muted: "#D49AA8", accent: "#FF5C7A", banner: "#7A1F35" } },
  { name: "Pôr do sol", colors: { bg: "#2A1630", surface: "#3D2042", border: "#12070F", text: "#FFF4E8", muted: "#E6B9A4", accent: "#FF9F5A", banner: "#E0567A" } },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Converte qualquer cor CSS (hex, rgb, color-mix...) pra #RRGGBB usando o próprio navegador. */
function cssColorToHex(value) {
  if (!value) return null;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = rgb.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  // color-mix sai como "color(srgb 0.1 0.2 0.3)" (0 a 1); o resto como "rgb(25, 51, 76)"
  const scale = rgb.startsWith("color(") ? 255 : 1;
  return (
    "#" +
    m
      .slice(0, 3)
      .map((n) => Math.max(0, Math.min(255, Math.round(Number(n) * scale))).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/** As cores do tema que a pessoa está usando agora, no formato do card (pra todo mundo ver igual). */
export function cardColorsFromCurrentTheme() {
  const root = getComputedStyle(document.documentElement);
  const read = (name) => cssColorToHex(root.getPropertyValue(name).trim());
  const banner = read("--c-bg");
  const colors = cleanCardColors({
    bg: read("--c-surface"),
    surface: read("--c-surface-2"),
    border: read("--c-ink"),
    text: read("--c-text"),
    muted: read("--c-text-muted"),
    accent: read("--c-accent"),
  });
  // a faixa vai pra cor do perfil (accentColor)
  return banner ? { ...colors, banner } : colors;
}

export function cleanCardColors(colors) {
  const out = {};
  for (const { key } of CARD_COLOR_FIELDS) {
    const v = colors?.[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v.toUpperCase();
  }
  return out;
}

export function hasCardColors(colors) {
  return Object.keys(cleanCardColors(colors)).length > 0;
}

/** className extra pro card (ativa as regras de CSS do card personalizado). */
export function cardColorClass(colors) {
  const c = cleanCardColors(colors);
  if (!Object.keys(c).length) return "";
  return " card-custom" + (c.accent ? " has-card-accent" : "") + (c.banner ? " has-card-banner" : "");
}

/** Estilo inline: redeclara os tokens do tema dentro do card. Junta com `base` (ex.: o accentStyle). */
export function cardColorStyle(colors, base) {
  const c = cleanCardColors(colors);
  if (!Object.keys(c).length) return base;
  const s = { ...base };
  if (c.bg) s["--c-surface"] = c.bg;
  if (c.surface) s["--c-surface-2"] = c.surface;
  if (c.border) {
    s["--c-ink"] = c.border;
    s["--c-line"] = c.border;
  }
  if (c.text) s["--c-text"] = c.text;
  if (c.muted) s["--c-text-muted"] = c.muted;
  if (c.accent) s["--c-accent"] = c.accent;
  if (c.banner) s["--card-banner"] = c.banner;

  // derivados: precisam ser recalculados aqui, senão continuam com o valor do tema
  Object.assign(s, {
    "--t-text-faint": "color-mix(in srgb, var(--c-text-muted) 85%, var(--c-surface))",
    "--t-line-soft": "color-mix(in srgb, var(--c-line) 30%, var(--c-surface))",
    "--t-accent-text": "color-mix(in oklab, var(--c-accent) 70%, var(--c-text))",
    "--t-hover": "color-mix(in srgb, var(--c-accent) 12%, var(--c-surface))",
    "--t-accent-hover": "color-mix(in srgb, var(--c-accent) 88%, #FFFFFF)",
    "--t-offline-border": "color-mix(in srgb, var(--c-line) 70%, var(--c-accent))",
    "--sticker": "var(--bw) solid var(--c-ink)",
    "--sticker-sm": "var(--bw-sm) solid var(--c-ink)",
    "--pop-1": "3px 3px 0 var(--c-ink)",
    "--pop-2": "4px 4px 0 var(--c-ink)",
    "--pop-3": "var(--t-shadow-offset) var(--t-shadow-offset) 0 var(--c-ink)",
    "--pop-accent": "3px 3px 0 var(--c-accent)",
    "--pop-accent-2": "4px 4px 0 var(--c-accent)",
    "--bg-panel": "var(--c-surface)",
    "--bg-panel-2": "var(--c-surface-2)",
    "--bg-elevated": "var(--c-surface)",
    "--bg-hover": "var(--t-hover)",
    "--bg-input": "var(--c-surface)",
    "--border": "var(--c-ink)",
    "--border-soft": "var(--t-line-soft)",
    "--border-strong": "var(--c-ink)",
    "--text-primary": "var(--c-text)",
    "--text-secondary": "var(--c-text-muted)",
    "--text-muted": "var(--t-text-faint)",
    "--accent": "var(--c-accent)",
    "--accent-hover": "var(--t-accent-hover)",
    "--accent-soft": "color-mix(in srgb, var(--c-accent) 16%, transparent)",
    "--accent-text": "var(--t-accent-text)",
    "--accent-ring": "color-mix(in srgb, var(--c-accent) 45%, transparent)",
    color: "var(--c-text)",
  });
  return s;
}
