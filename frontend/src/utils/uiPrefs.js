// Preferências visuais do aparelho que NÃO fazem parte do tema (o tema e os códigos
// CONCORDE-TEMA continuam iguais): estilo das mensagens e imagem de fundo.
// A imagem fica no IndexedDB (não no localStorage) pra não disputar espaço com os temas salvos.
import { useSyncExternalStore } from "react";

const KEY = "concorde:ui-prefs";
const DB_NAME = "concorde-ui";
const STORE = "files";
const WALLPAPER_ID = "wallpaper";

const DEFAULTS = {
  chatStyle: "list", // "list" | "bubbles"
  wallpaperMode: "off", // "off" | "chat" | "app"
  wallpaperDim: 55, // 0-90: quanto a cor do tema cobre a imagem (legibilidade)
  wallpaperBlur: 0, // 0-20 px
  glassPanels: false, // no modo "app": painéis um pouco transparentes
  wallpaperRemote: null, // imagem que veio de um tema da galeria (link); a local tem prioridade
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    const p = { ...DEFAULTS, ...raw };
    if (!["list", "bubbles"].includes(p.chatStyle)) p.chatStyle = DEFAULTS.chatStyle;
    if (!["off", "chat", "app"].includes(p.wallpaperMode)) p.wallpaperMode = DEFAULTS.wallpaperMode;
    p.wallpaperDim = clamp(Number(p.wallpaperDim), 0, 90, DEFAULTS.wallpaperDim);
    p.wallpaperBlur = clamp(Number(p.wallpaperBlur), 0, 20, DEFAULTS.wallpaperBlur);
    p.glassPanels = !!p.glassPanels;
    p.wallpaperRemote = typeof p.wallpaperRemote === "string" && /^https?:\/\//.test(p.wallpaperRemote) ? p.wallpaperRemote : null;
    return p;
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp(n, min, max, fallback) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

let state = { ...load(), wallpaperUrl: null };
state.wallpaperUrl = state.wallpaperRemote;
const listeners = new Set();

function emit() {
  apply();
  listeners.forEach((l) => l());
}

function persist() {
  const { wallpaperUrl, ...rest } = state; // eslint-disable-line no-unused-vars
  try {
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    // sem storage: vale só nessa sessão
  }
}

/** Joga as preferências no <html> (atributos + variáveis); o CSS faz o resto. */
function apply() {
  const root = document.documentElement;
  root.dataset.chatStyle = state.chatStyle;
  const wallpaperOn = state.wallpaperMode !== "off" && !!state.wallpaperUrl;
  if (wallpaperOn) {
    root.dataset.wallpaper = state.wallpaperMode;
    root.style.setProperty("--wallpaper-image", `url("${state.wallpaperUrl}")`);
    root.style.setProperty("--wallpaper-dim", `${state.wallpaperDim}%`);
    root.style.setProperty("--wallpaper-blur", `${state.wallpaperBlur}px`);
  } else {
    delete root.dataset.wallpaper;
    root.style.removeProperty("--wallpaper-image");
    root.style.removeProperty("--wallpaper-dim");
    root.style.removeProperty("--wallpaper-blur");
  }
  if (wallpaperOn && state.wallpaperMode === "app" && state.glassPanels) root.dataset.glass = "on";
  else delete root.dataset.glass;
}

export function setUiPrefs(patch) {
  state = { ...state, ...patch };
  persist();
  emit();
}

export function getUiPrefs() {
  return state;
}

export function useUiPrefs() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

// ---------- imagem (IndexedDB) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Sem IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function setWallpaperBlob(blob) {
  if (state.wallpaperUrl?.startsWith("blob:")) URL.revokeObjectURL(state.wallpaperUrl);
  state = { ...state, wallpaperUrl: blob ? URL.createObjectURL(blob) : state.wallpaperRemote };
  emit();
}

/** Diminui fotos grandes (GIF vai inteiro pra continuar animando). */
async function shrinkImage(file) {
  if (file.type === "image/gif") return file;
  const MAX = 2560;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob || file;
  } catch {
    return file;
  }
}

export const WALLPAPER_MAX_BYTES = 15 * 1024 * 1024;

/** Salva a imagem de fundo nesse aparelho e liga (no chat, se estava desligado). */
export async function saveWallpaper(file) {
  if (!file || !file.type?.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > WALLPAPER_MAX_BYTES) throw new Error("Imagem muito grande (máx. 15MB).");
  const blob = await shrinkImage(file);
  await idb("readwrite", (s) => s.put(blob, WALLPAPER_ID));
  state = { ...state, wallpaperRemote: null };
  setWallpaperBlob(blob);
  setUiPrefs(state.wallpaperMode === "off" ? { wallpaperMode: "chat" } : {});
}

/** Usa a imagem de fundo de um tema da galeria (por link) com os ajustes dele. */
export async function applyRemoteWallpaper(url, opts = {}) {
  try {
    await idb("readwrite", (s) => s.delete(WALLPAPER_ID));
  } catch {
    // sem IndexedDB: tudo bem
  }
  state = { ...state, wallpaperRemote: url };
  setWallpaperBlob(null);
  setUiPrefs({
    wallpaperMode: opts.mode === "app" ? "app" : "chat",
    wallpaperDim: clamp(Number(opts.dim), 0, 90, DEFAULTS.wallpaperDim),
    wallpaperBlur: clamp(Number(opts.blur), 0, 20, DEFAULTS.wallpaperBlur),
    glassPanels: !!opts.glass,
  });
}

/** A imagem de fundo atual como arquivo (pra publicar um tema). null se não tiver. */
export async function getWallpaperFile() {
  try {
    const blob = await idb("readonly", (s) => s.get(WALLPAPER_ID));
    if (blob) return new File([blob], "fundo." + (blob.type?.split("/")[1] || "jpg"), { type: blob.type || "image/jpeg" });
  } catch {
    // segue pro link
  }
  if (state.wallpaperRemote) {
    const res = await fetch(state.wallpaperRemote);
    if (!res.ok) throw new Error("Não deu pra baixar a imagem de fundo atual");
    const blob = await res.blob();
    return new File([blob], "fundo." + (blob.type?.split("/")[1] || "jpg"), { type: blob.type || "image/jpeg" });
  }
  return null;
}

export async function removeWallpaper() {
  try {
    await idb("readwrite", (s) => s.delete(WALLPAPER_ID));
  } catch {
    // sem IndexedDB: nada salvo mesmo
  }
  state = { ...state, wallpaperRemote: null };
  setWallpaperBlob(null);
  setUiPrefs({ wallpaperMode: "off" });
}

/** Chamado uma vez no início: aplica o estilo e carrega a imagem salva. */
export function initUiPrefs() {
  apply();
  idb("readonly", (s) => s.get(WALLPAPER_ID))
    .then((blob) => {
      if (blob) setWallpaperBlob(blob);
    })
    .catch(() => {
      // sem IndexedDB (modo privado etc.): sem imagem de fundo
    });
}
