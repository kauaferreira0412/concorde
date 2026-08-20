const INPUT_KEY = "audioInputDeviceId";
const OUTPUT_KEY = "audioOutputDeviceId";
const VIDEO_INPUT_KEY = "videoInputDeviceId";
const SOUND_EFFECTS_KEY = "voiceSoundEffectsEnabled";
const NOISE_SUPPRESSION_KEY = "voiceNoiseSuppressionEnabled"; // legado (boolean) - migrado abaixo
const NOISE_SUPPRESSION_MODE_KEY = "voiceNoiseSuppressionMode";

export function getSavedAudioInput() {
  return localStorage.getItem(INPUT_KEY) || "";
}
export function setSavedAudioInput(deviceId) {
  if (deviceId) localStorage.setItem(INPUT_KEY, deviceId);
  else localStorage.removeItem(INPUT_KEY);
}

export function getSavedAudioOutput() {
  return localStorage.getItem(OUTPUT_KEY) || "";
}
export function setSavedAudioOutput(deviceId) {
  if (deviceId) localStorage.setItem(OUTPUT_KEY, deviceId);
  else localStorage.removeItem(OUTPUT_KEY);
}

export function getSavedVideoInput() {
  return localStorage.getItem(VIDEO_INPUT_KEY) || "";
}
export function setSavedVideoInput(deviceId) {
  if (deviceId) localStorage.setItem(VIDEO_INPUT_KEY, deviceId);
  else localStorage.removeItem(VIDEO_INPUT_KEY);
}

/** Som ao alguem entrar/sair da call - ligado por padrao, como no Discord. */
export function getSoundEffectsEnabled() {
  const raw = localStorage.getItem(SOUND_EFFECTS_KEY);
  return raw === null ? true : raw === "true";
}
export function setSoundEffectsEnabled(enabled) {
  localStorage.setItem(SOUND_EFFECTS_KEY, String(enabled));
}

/**
 * Supressao de ruido do microfone - "off" | "rnnoise" | "gtcrn" (ver
 * utils/noiseSuppression.js pras duas opcoes de IA de verdade, no lugar da constraint nativa
 * fraca do navegador que tinha antes). Vale a partir da proxima vez que entrar numa call.
 */
export function getNoiseSuppressionMode() {
  const raw = localStorage.getItem(NOISE_SUPPRESSION_MODE_KEY);
  if (raw === "off" || raw === "rnnoise" || raw === "gtcrn") return raw;
  // Migra o valor antigo (checkbox liga/desliga a supressao nativa do navegador) - "ligado"
  // vira RNNoise (a opcao leve, mais parecida com o que existia), "desligado" vira "off".
  const legacyRaw = localStorage.getItem(NOISE_SUPPRESSION_KEY);
  if (legacyRaw !== null) return legacyRaw === "true" ? "rnnoise" : "off";
  return "rnnoise";
}
export function setNoiseSuppressionMode(mode) {
  localStorage.setItem(NOISE_SUPPRESSION_MODE_KEY, mode);
}
