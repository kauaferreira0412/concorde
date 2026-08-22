const MUTE_KEY = "shortcutMuteToggle";
const DEAFEN_KEY = "shortcutDeafenToggle";

export const DEFAULT_MUTE_SHORTCUT = "ctrl+shift+m";
export const DEFAULT_DEAFEN_SHORTCUT = "ctrl+shift+d";

export function getMuteShortcut() {
  return localStorage.getItem(MUTE_KEY) || DEFAULT_MUTE_SHORTCUT;
}
export function setMuteShortcut(combo) {
  localStorage.setItem(MUTE_KEY, combo);
  syncGlobalShortcuts();
}

export function getDeafenShortcut() {
  return localStorage.getItem(DEAFEN_KEY) || DEFAULT_DEAFEN_SHORTCUT;
}
export function setDeafenShortcut(combo) {
  localStorage.setItem(DEAFEN_KEY, combo);
  syncGlobalShortcuts();
}

/**
 * No app desktop (Electron), os atalhos de mutar/ensurdecer sao registrados no SISTEMA
 * OPERACIONAL (globalShortcut, ver electron/main.cjs) - continuam funcionando mesmo com o
 * Concorde em segundo plano, ao contrario de um "keydown" comum no navegador (so' dispara com
 * a janela em foco). "window.concordeDesktop" so existe dentro do app desktop - no navegador
 * normal essa funcao nao faz nada, o atalho continua funcionando so' com a janela em foco (ver
 * VoiceCallContext.jsx). Chamada aqui (toda vez que o usuario salva um atalho novo em
 * Configuracoes) e tambem uma vez na entrada do app (ver VoiceCallContext.jsx).
 */
export function syncGlobalShortcuts() {
  window.concordeDesktop?.registerGlobalShortcuts(getMuteShortcut(), getDeafenShortcut());
}

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);

/** Transforma um KeyboardEvent em algo tipo "ctrl+shift+m", pra comparar/salvar. */
export function shortcutFromEvent(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");
  const key = e.key.toLowerCase();
  if (!MODIFIER_KEYS.has(key)) {
    parts.push(key === " " ? "space" : key);
  }
  return parts.join("+");
}

/** true se o evento so tem modificadores pressionados (ainda esperando a tecla "de verdade"). */
export function isOnlyModifier(e) {
  return MODIFIER_KEYS.has(e.key.toLowerCase());
}

export function formatShortcut(combo) {
  if (!combo) return "—";
  return combo
    .split("+")
    .map((part) => (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" + ");
}
