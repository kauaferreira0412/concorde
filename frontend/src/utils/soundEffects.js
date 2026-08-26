import { getSoundEffectsEnabled } from "./audioSettings";

/**
 * Efeitos sonoros da call (entrar/sair, mutar/desmutar, compartilhar tela). A maioria e'
 * sintetizada via Web Audio API - sem depender de arquivo .mp3 externo, funciona offline,
 * sem licenciamento, sem CORS. Os de "entrar"/"sair" da call sao .mp3 de verdade (ver
 * public/sounds/join.mp3 e leave.mp3) - todos respeitam o toggle "Tocar som..." de
 * Configuracoes.
 */
let audioCtx = null;

// import.meta.env.BASE_URL: "/" no site, "./" no app desktop empacotado (ver vite.config.js) -
// precisa disso em vez de "/sounds/<arquivo>" direto pro caminho funcionar dentro do .exe
// tambem (que serve os arquivos via app://, nao file:// na raiz). Um <audio> por arquivo,
// criado so' na primeira vez que toca - reaproveitado depois (evita recarregar do zero
// toda vez que alguem entra/sai da call).
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
  el.currentTime = 0; // permite tocar de novo mesmo se o anterior ainda nao tinha acabado
  el.play().catch(() => {
    // Navegador pode bloquear play() antes de qualquer interacao do usuario na pagina -
    // sem problema, so nao toca dessa vez.
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

/** Toca ao chegar mensagem nova em canal que voce nao esta olhando - mesmo gatilho da
 *  notificacao do desktop (ver notifyDesktop em useUnreadMessages.js), so' que sem precisar de
 *  permissao nenhuma do navegador (a notificacao visual precisa; o som nao). Arquivo escolhido
 *  pelo proprio usuario (ver public/sounds/message.mp3). */
export function playMessageSound() {
  try {
    playFile("message.mp3");
  } catch {
    // idem
  }
}

export function playJoinSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playFile("join.mp3");
  } catch {
    // idem
  }
}

export function playLeaveSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playFile("leave.mp3");
  } catch {
    // idem
  }
}

export function playMuteSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(440, 0, 0.08, 0.13); // A4 - um "toc" curto e seco
  } catch {
    // idem
  }
}

export function playUnmuteSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(659.25, 0, 0.08, 0.13); // E5 - mais agudo que o de mutar, pra diferenciar no ouvido
  } catch {
    // idem
  }
}

export function playScreenShareStartSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(523.25, 0, 0.09, 0.14); // C5
    playTone(659.25, 0.06, 0.09, 0.14); // E5
    playTone(783.99, 0.12, 0.16, 0.14); // G5 - arpejo subindo, "começou algo"
  } catch {
    // idem
  }
}

export function playScreenShareStopSound() {
  if (!getSoundEffectsEnabled()) return;
  try {
    playTone(783.99, 0, 0.09, 0.14); // G5
    playTone(523.25, 0.07, 0.16, 0.14); // C5 - desce direto, "parou algo"
  } catch {
    // idem
  }
}
