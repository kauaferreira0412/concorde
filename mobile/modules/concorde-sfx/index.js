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
