const INPUT_KEY = "audioInputDeviceId";
const OUTPUT_KEY = "audioOutputDeviceId";
const VIDEO_INPUT_KEY = "videoInputDeviceId";
const SOUND_EFFECTS_KEY = "voiceSoundEffectsEnabled";
const NOISE_SUPPRESSION_KEY = "voiceNoiseSuppressionEnabled";

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
 * Supressao de ruido do microfone (feita pelo proprio navegador, via constraint padrao
 * de getUserMedia) - ligada por padrao, mas o usuario pode desativar (ex: alguns
 * microfones de estudio/instrumentos musicais soam pior com ela ligada, porque o filtro
 * confunde o som "incomum" com ruido). Vale a partir da proxima vez que entrar numa call.
 */
export function getNoiseSuppressionEnabled() {
  const raw = localStorage.getItem(NOISE_SUPPRESSION_KEY);
  return raw === null ? true : raw === "true";
}
export function setNoiseSuppressionEnabled(enabled) {
  localStorage.setItem(NOISE_SUPPRESSION_KEY, String(enabled));
}
