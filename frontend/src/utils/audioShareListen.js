// Preferência: entrar (ouvir) automaticamente nas transmissões só de áudio da call.
const KEY = "concorde:auto-listen-audio-share";

export function getAutoListenAudioShare() {
  try {
    return localStorage.getItem(KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoListenAudioShare(enabled) {
  try {
    localStorage.setItem(KEY, String(!!enabled));
  } catch {
    // sem storage: vale só nessa sessão
  }
}
