import { requireOptionalNativeModule } from "expo";

// null fora do iOS (ou num build sem o módulo): os sons simplesmente não tocam
const Native = requireOptionalNativeModule("ConcordeSfx");

export function isAvailable() {
  return !!Native;
}

/** Toca um arquivo de som curto (file:// ou caminho) sem mexer na sessão de áudio. */
export function playFile(uri) {
  if (!Native || !uri) return;
  try {
    Native.play(uri);
  } catch {
    // sem som
  }
}

/** Abre o Picture in Picture da live que está na tela (iOS). true se achou um vídeo com PiP. */
export async function startPictureInPicture() {
  if (!Native?.startPictureInPicture) return false;
  try {
    return !!(await Native.startPictureInPicture());
  } catch {
    return false;
  }
}

/** O PiP de alguma live está aberto agora? (iOS) */
export async function isPictureInPictureActive() {
  if (!Native?.isPictureInPictureActive) return false;
  try {
    return !!(await Native.isPictureInPictureActive());
  } catch {
    return false;
  }
}

/** Fecha o PiP e devolve a live pro app (iOS). */
export async function stopPictureInPicture() {
  if (!Native?.stopPictureInPicture) return false;
  try {
    return !!(await Native.stopPictureInPicture());
  } catch {
    return false;
  }
}
