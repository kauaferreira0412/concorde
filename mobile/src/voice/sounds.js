import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import { playFile } from "../../modules/concorde-sfx";

// Os mesmos sons do site (renderizados da síntese de frontend/src/utils/soundEffects.js).
// Tocam como "sons de sistema" do iOS (módulo nativo modules/concorde-sfx): NÃO mexem na sessão
// de áudio. Um player comum (expo-audio) desativava a sessão ao terminar e derrubava o áudio da call.
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
const uris = {};

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

async function uriOf(name) {
  if (uris[name]) return uris[name];
  const asset = Asset.fromModule(FILES[name]);
  if (!asset.localUri) await asset.downloadAsync();
  uris[name] = asset.localUri || asset.uri;
  return uris[name];
}

export async function playSound(name) {
  if (!enabled || !FILES[name]) return;
  try {
    playFile(await uriOf(name));
  } catch {
    // sem som: segue a vida
  }
}
