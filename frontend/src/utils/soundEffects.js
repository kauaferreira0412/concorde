import { getSoundEffectsEnabled } from "./audioSettings";

let audioCtx = null;

const fileAudioEls = {};
function getFileAudioEl(filename) {
  if (!fileAudioEls[filename]) {
    const el = new Audio(`${import.meta.env.BASE_URL}sounds/${filename}`);
    el.preload = "auto";
    el.volume = 0.55;
    fileAudioEls[filename] = el;
  }
  return fileAudioEls[filename];
}

function playFile(filename) {
  const el = getFileAudioEl(filename);
  el.currentTime = 0;
  el.play().catch(() => {
  });
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq, startOffset, duration, gainPeak = 0.16) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  const startTime = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

export function playMessageSound() {
  try {
    playFile("message.mp3");
  } catch {
  }
}

export function playJoinSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playFile("join.mp3");
  } catch {
  }
}

export function playLeaveSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playFile("leave.mp3");
  } catch {
  }
}

export function playMuteSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(440, 0, 0.08, 0.13);
  } catch {
  }
}

export function playUnmuteSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(659.25, 0, 0.08, 0.13);
  } catch {
  }
}

export function playScreenShareStartSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(523.25, 0, 0.09, 0.14);
    playTone(659.25, 0.06, 0.09, 0.14);
    playTone(783.99, 0.12, 0.16, 0.14);
  } catch {
  }
}

export function playScreenShareStopSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(783.99, 0, 0.09, 0.14);
    playTone(523.25, 0.07, 0.16, 0.14);
  } catch {
  }
}
