const INPUT_KEY = "audioInputDeviceId";
const OUTPUT_KEY = "audioOutputDeviceId";
const VIDEO_INPUT_KEY = "videoInputDeviceId";
const SOUND_EFFECTS_KEY = "voiceSoundEffectsEnabled";
const NOISE_SUPPRESSION_KEY = "voiceNoiseSuppressionEnabled";
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

export function getSoundEffectsEnabled() {
  const raw = localStorage.getItem(SOUND_EFFECTS_KEY);
  return raw === null ? true : raw === "true";
}
export function setSoundEffectsEnabled(enabled) {
  localStorage.setItem(SOUND_EFFECTS_KEY, String(enabled));
}

export function getNoiseSuppressionMode() {
  const raw = localStorage.getItem(NOISE_SUPPRESSION_MODE_KEY);
  if (raw === "off" || raw === "rnnoise" || raw === "gtcrn") return raw;
  const legacyRaw = localStorage.getItem(NOISE_SUPPRESSION_KEY);
  if (legacyRaw !== null) return legacyRaw === "true" ? "rnnoise" : "off";
  return "rnnoise";
}
export function setNoiseSuppressionMode(mode) {
  localStorage.setItem(NOISE_SUPPRESSION_MODE_KEY, mode);
}

const PARTICIPANT_VOLUME_PREFIX = "voiceParticipantVolume_";
const STREAM_VOLUME_PREFIX = "voiceStreamVolume_";

export function getSavedParticipantVolume(userId) {
  const raw = localStorage.getItem(PARTICIPANT_VOLUME_PREFIX + userId);
  return raw === null ? null : Number(raw);
}
export function setSavedParticipantVolume(userId, percent) {
  localStorage.setItem(PARTICIPANT_VOLUME_PREFIX + userId, String(percent));
}
export function getSavedStreamVolume(userId) {
  const raw = localStorage.getItem(STREAM_VOLUME_PREFIX + userId);
  return raw === null ? null : Number(raw);
}
export function setSavedStreamVolume(userId, percent) {
  localStorage.setItem(STREAM_VOLUME_PREFIX + userId, String(percent));
}

const MIC_GAIN_KEY = "micGainPercent";

export function getMicGain() {
  const raw = localStorage.getItem(MIC_GAIN_KEY);
  return raw === null ? 100 : Number(raw);
}
export function setMicGain(percent) {
  localStorage.setItem(MIC_GAIN_KEY, String(percent));
}

const MASTER_VOLUME_KEY = "masterVolumePercent";

export function getMasterVolume() {
  const raw = localStorage.getItem(MASTER_VOLUME_KEY);
  return raw === null ? 100 : Number(raw);
}
export function setMasterVolume(percent) {
  localStorage.setItem(MASTER_VOLUME_KEY, String(percent));
}
