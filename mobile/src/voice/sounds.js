import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

// Os mesmos sons do site (renderizados da síntese de frontend/src/utils/soundEffects.js).
const FILES = {
  join: require("../../assets/sounds/join.wav"),
  leave: require("../../assets/sounds/leave.wav"),
  mute: require("../../assets/sounds/mute.wav"),
  unmute: require("../../assets/sounds/unmute.wav"),
  liveStart: require("../../assets/sounds/live_start.wav"),
  liveStop: require("../../assets/sounds/live_stop.wav"),
  message: require("../../assets/sounds/message.wav"),
};

const KEY = "concorde:sound-effects";
let enabled = true;
let modeSet = false;
const players = {};

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === "false") enabled = false;
  })
  .catch(() => {});

export function getSoundsEnabled() {
  return enabled;
}

export function setSoundsEnabled(value) {
  enabled = !!value;
  AsyncStorage.setItem(KEY, String(enabled)).catch(() => {});
}

async function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  // mesmo modo da call (grava + toca, mistura com o resto) pra não derrubar o áudio do LiveKit
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: "mixWithOthers",
    allowsRecording: true,
    shouldPlayInBackground: true,
  }).catch(() => {});
}

export async function playSound(name) {
  if (!enabled || !FILES[name]) return;
  try {
    await ensureMode();
    let p = players[name];
    if (!p) {
      p = createAudioPlayer(FILES[name]);
      p.volume = 0.8;
      players[name] = p;
    }
    await p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // sem som: segue a vida
  }
}
