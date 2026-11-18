import { getSoundEffectsEnabled } from "./audioSettings";

// Sons do Concorde, sintetizados na hora com Web Audio (sem arquivos pra baixar).
// Estilo "bolha/adesivo": notas curtas com um deslize de afinação pra cima ou pra baixo,
// um brilho de oitava por cima e um reverb curtinho pra não soar seco.

const MASTER_VOLUME = 0.5;

let ctx = null;
let bus = null;

function getEngine() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    const master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 0.9, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.18;

    const dry = ctx.createGain();
    dry.gain.value = 1;

    dry.connect(master);
    dry.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);
    bus = dry;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return { ctx, bus };
}

/** Resposta de impulso sintética (ruído que decai) pra um reverb de sala pequena. */
function makeImpulse(audioCtx, seconds, decay) {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = audioCtx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

/**
 * Uma "bolha": oscilador com deslize de afinação, filtro que fecha junto com o volume
 * e um harmônico de oitava bem baixinho pra dar brilho.
 */
function blip({ at = 0, from, to = from, dur = 0.14, gain = 0.32, type = "triangle", sparkle = 0.22, cutoff = 4200 }) {
  const { ctx: c, bus: out } = getEngine();
  const t0 = c.currentTime + 0.01 + at;
  const end = t0 + dur;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(cutoff, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, cutoff / 5), end);

  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  filter.connect(amp);
  amp.connect(out);

  const voices = [
    { type, mult: 1, level: 1 },
    { type: "sine", mult: 2, level: sparkle },
  ];
  for (const v of voices) {
    const osc = c.createOscillator();
    osc.type = v.type;
    osc.frequency.setValueAtTime(from * v.mult, t0);
    osc.frequency.exponentialRampToValueAtTime(to * v.mult, t0 + dur * 0.55);
    const level = c.createGain();
    level.gain.value = v.level;
    osc.connect(level);
    level.connect(filter);
    osc.start(t0);
    osc.stop(end + 0.05);
  }
}

/** Sino curtinho (parciais inarmônicas) pra notificação de mensagem. */
function bell({ at = 0, freq, dur = 0.6, gain = 0.22 }) {
  const { ctx: c, bus: out } = getEngine();
  const t0 = c.currentTime + 0.01 + at;
  const partials = [
    { mult: 1, level: 1, decay: 1 },
    { mult: 2.01, level: 0.45, decay: 0.6 },
    { mult: 3.98, level: 0.18, decay: 0.35 },
  ];
  for (const p of partials) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * p.mult;
    const amp = c.createGain();
    const end = t0 + dur * p.decay;
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain * p.level, t0 + 0.005);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp);
    amp.connect(out);
    osc.start(t0);
    osc.stop(end + 0.05);
  }
}

function safely(fn, respectToggle = true) {
  if (respectToggle && !getSoundEffectsEnabled()) return;
  try {
    fn();
  } catch {
    // áudio bloqueado (sem interação ainda) ou Web Audio indisponível: segue sem som
  }
}

// Notas (Hz)
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5;

/**
 * Nota macia: seno puro com ataque lento (sem "clique"), filtro passa-baixa fechado
 * e decaimento curto — soa como uma gota/marimba abafada, sem brilho agudo.
 */
function softNote({ at = 0, freq, dur = 0.4, gain = 0.1 }) {
  const { ctx: c, bus: out } = getEngine();
  const t0 = c.currentTime + 0.01 + at;
  const end = t0 + dur;

  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  filter.Q.value = 0.5;

  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.025);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  filter.connect(amp);
  amp.connect(out);

  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 0.985, t0);
  osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.04);
  osc.connect(filter);
  osc.start(t0);
  osc.stop(end + 0.05);
}

const D5 = 587.33;
const MESSAGE_COOLDOWN_MS = 1500;
let lastMessageSoundAt = 0;

/** Mensagem nova (DM): duas notas graves e macias. Várias mensagens seguidas tocam um som só. */
export function playMessageSound() {
  const now = Date.now();
  if (now - lastMessageSoundAt < MESSAGE_COOLDOWN_MS) return;
  lastMessageSoundAt = now;
  safely(() => {
    softNote({ freq: D5, dur: 0.32, gain: 0.11 });
    softNote({ at: 0.09, freq: A5, dur: 0.42, gain: 0.08 });
  }, false);
}

/** Alguém entrou na call (ou você): duas bolhas subindo. */
export function playJoinSound() {
  safely(() => {
    blip({ from: C5 * 0.9, to: E5, dur: 0.12 });
    blip({ at: 0.09, from: G5 * 0.92, to: C6, dur: 0.2, sparkle: 0.3 });
  });
}

/** Alguém saiu: duas bolhas descendo, mais graves e abafadas. */
export function playLeaveSound() {
  safely(() => {
    blip({ from: G5, to: E5 * 0.98, dur: 0.12, cutoff: 3000 });
    blip({ at: 0.1, from: E5, to: C5 * 0.82, dur: 0.22, cutoff: 2200, sparkle: 0.1 });
  });
}

/** Mutou: "tup" curto que cai. */
export function playMuteSound() {
  safely(() => {
    blip({ from: 520, to: 260, dur: 0.11, type: "sine", gain: 0.36, sparkle: 0.05, cutoff: 2400 });
  });
}

/** Desmutou: "tip" curto que sobe. */
export function playUnmuteSound() {
  safely(() => {
    blip({ from: 380, to: 720, dur: 0.1, type: "sine", gain: 0.34, sparkle: 0.15, cutoff: 3600 });
  });
}

/** Começou a transmitir: arpejo brilhante subindo. */
export function playScreenShareStartSound() {
  safely(() => {
    [C5, E5, G5, C6].forEach((f, i) => blip({ at: i * 0.055, from: f * 0.96, to: f, dur: 0.16, gain: 0.26, sparkle: 0.3 }));
    bell({ at: 0.22, freq: E6, dur: 0.45, gain: 0.08 });
  });
}

/** Parou de transmitir: arpejo descendo. */
export function playScreenShareStopSound() {
  safely(() => {
    [A5, E5, C5].forEach((f, i) => blip({ at: i * 0.06, from: f, to: f * 0.94, dur: 0.16, gain: 0.24, cutoff: 3000 }));
  });
}
