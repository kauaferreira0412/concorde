import { AudioFrame } from "@livekit/rtc-node";
import { CHANNELS, SAMPLE_RATE } from "./config.js";

const FRAME_MS = 20;
const FRAME_SAMPLES = Math.round((SAMPLE_RATE * FRAME_MS) / 1000) * CHANNELS;
const FRAME_BYTES = FRAME_SAMPLES * 2;
const BYTES_PER_MS = (SAMPLE_RATE * CHANNELS * 2) / 1000;

/**
 * Fila de bytes PCM crus (16 bits) de UMA fonte (musica OU soundboard) - cresce conforme o
 * ffmpeg dessa fonte vai decodificando, encolhe em passos fixos de FRAME_BYTES conforme o
 * mixer consome pra montar cada frame. Falta de dado no meio de uma leitura vira silencio
 * (zero-fill), nao trava o mixer inteiro esperando um decoder lento.
 */
class PcmChannel {
  constructor() {
    this.chunks = [];
    this.available = 0;
  }
  push(buffer) {
    if (!buffer || !buffer.length) return;
    this.chunks.push(buffer);
    this.available += buffer.length;
  }
  read(bytes) {
    const out = Buffer.alloc(bytes);
    let offset = 0;
    while (offset < bytes && this.chunks.length) {
      const head = this.chunks[0];
      const take = Math.min(head.length, bytes - offset);
      head.copy(out, offset, 0, take);
      offset += take;
      this.available -= take;
      if (take === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(take);
    }
    return out;
  }
  get bufferedMs() {
    return this.available / BYTES_PER_MS;
  }
  get hasData() {
    return this.available > 0;
  }
}

function mixInto(target, addition) {
  for (let i = 0; i < target.length; i++) {
    const sum = target[i] + addition[i];
    target[i] = sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum;
  }
}

/**
 * UM bot, UMA faixa de audio publicada no LiveKit (Track.Source.Microphone) - musica e
 * soundboard entram por canais PCM separados (ver PcmChannel acima) e saem somadas num frame
 * so', a cada 20ms.
 *
 * Antes, musica e soundboard publicavam cada um a SUA PROPRIA faixa (as duas com
 * Track.Source.Microphone, ver session.js/soundboard.js antigos) - so' que o frontend so' sabe
 * controlar UMA faixa de microfone por participante (mutar o bot, ensurdecer, ajustar volume -
 * ver resolveParticipantVolume/toggleDeafen em VoiceCallContext.jsx, que usam
 * participant.getTrackPublication(Track.Source.Microphone), que so' enxerga UMA publicacao).
 * Com duas faixas de microfone simultaneas do mesmo bot, uma delas ficava "invisivel" pros
 * controles - tocando sem ninguem conseguir calar ela, nem ensurdecendo (bug reportado pelo
 * usuario: "uso o soundboard, dps quero tocar musica, nao consigo mutar/baixar volume/
 * ensurdecer o Melodion"). Com uma faixa so' aqui, o controle existente do frontend passa a
 * valer pra musica E soundboard ao mesmo tempo, sempre - sem precisar mexer em nada no
 * frontend.
 */
export function createMixer(session) {
  const music = new PcmChannel();
  const soundboard = new PcmChannel();
  let running = false;
  let stopped = false;

  async function tick() {
    while (!stopped) {
      if (!music.hasData && !soundboard.hasData) {
        running = false;
        return;
      }
      const musicChunk = music.read(FRAME_BYTES);
      const samples = new Int16Array(musicChunk.buffer, musicChunk.byteOffset, FRAME_SAMPLES);
      if (soundboard.hasData) {
        const sbChunk = soundboard.read(FRAME_BYTES);
        mixInto(samples, new Int16Array(sbChunk.buffer, sbChunk.byteOffset, FRAME_SAMPLES));
      }
      try {
        await session.source.captureFrame(new AudioFrame(samples, SAMPLE_RATE, CHANNELS, FRAME_SAMPLES));
      } catch {
        stopped = true;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
    }
  }

  function ensureRunning() {
    if (running || stopped) return;
    running = true;
    tick();
  }

  return {
    pushMusic(buffer) {
      music.push(buffer);
      ensureRunning();
    },
    pushSoundboard(buffer) {
      soundboard.push(buffer);
      ensureRunning();
    },
    musicBufferedMs() {
      return music.bufferedMs;
    },
    soundboardBufferedMs() {
      return soundboard.bufferedMs;
    },
    stop() {
      stopped = true;
    },
  };
}
