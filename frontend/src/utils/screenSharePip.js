// Janela flutuante (Picture-in-Picture nativo) pras transmissões de tela.
// - Botão no card da transmissão abre/fecha na hora.
// - Automático: ao minimizar o app desktop (o Electron chama window.__concordeAutoPip) ou ao trocar de
//   aba no Chrome (Media Session "enterpictureinpicture"), a transmissão que você está vendo vira janela
//   flutuante; ao voltar pro app ela volta pro lugar.

const AUTO_KEY = "concorde:screenshare-auto-pip";

export const pipSupported =
  typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled;

export function getAutoPipEnabled() {
  try {
    return localStorage.getItem(AUTO_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoPipEnabled(enabled) {
  try {
    localStorage.setItem(AUTO_KEY, String(!!enabled));
  } catch {
    // sem storage: vale só nessa sessão
  }
}

// Vídeos de transmissões (de outras pessoas) que estão sendo assistidas agora, na ordem em que entraram.
const candidates = new Set();
let lastUsed = null;
let autoEntered = false;

function pickCandidate() {
  if (lastUsed && candidates.has(lastUsed) && lastUsed.isConnected) return lastUsed;
  for (const el of candidates) {
    if (el.isConnected && el.readyState >= 1) return el;
  }
  return null;
}

export async function enterPip(video) {
  if (!pipSupported || !video) return false;
  try {
    lastUsed = video;
    if (document.pictureInPictureElement === video) return true;
    await video.requestPictureInPicture();
    return true;
  } catch {
    return false;
  }
}

export async function exitPip() {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
  } catch {
    // já saiu
  }
}

export async function autoEnterPip() {
  if (!getAutoPipEnabled() || document.pictureInPictureElement) return;
  const video = pickCandidate();
  if (!video) return;
  autoEntered = await enterPip(video);
}

export async function autoExitPip() {
  if (!autoEntered) return;
  autoEntered = false;
  await exitPip();
}

function updateMediaSessionHandler() {
  try {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("enterpictureinpicture", candidates.size > 0 ? autoEnterPip : null);
  } catch {
    // navegador sem suporte a PiP automático
  }
}

/** Registra o <video> de uma transmissão assistida; devolve a função pra remover. */
export function registerPipCandidate(video) {
  if (!video) return () => {};
  candidates.add(video);
  updateMediaSessionHandler();
  return () => {
    candidates.delete(video);
    if (lastUsed === video) lastUsed = null;
    updateMediaSessionHandler();
  };
}

if (typeof window !== "undefined") {
  window.__concordeAutoPip = autoEnterPip;
  window.__concordeExitAutoPip = autoExitPip;
  // Voltou pro app (navegador): fecha a janela que abriu sozinha.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") autoExitPip();
  });
}
