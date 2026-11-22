// Buffer circular de "replay" da call: grava continuamente os últimos 60s (video
// do que está em destaque + áudio de todo mundo) em pedaços de 1s, descartando os
// mais antigos - e quando alguém clica em "Clipar", junta os últimos N segundos
// num arquivo de vídeo. Singleton (não é hook) porque precisa sobreviver a troca
// de telas/componentes sem perder o buffer.

const MAX_BUFFER_SECONDS = 60;
const CHUNK_MS = 1000;
const VIDEO_FPS = 20;
const VIDEO_BITRATE = 1_800_000; // ~1.8 Mbps - 60s fica em torno de 13-15MB, 30s ~7MB

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "video/webm";
}

class ClipRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = []; // { blob, t }
    this.audioCtx = null;
    this.audioDest = null;
    this.audioSources = new Map(); // key -> AudioNode
    this.videoCandidates = new Map(); // key -> { el, priority }
    this.currentVideoKey = null;
    this.enabled = false;
    this.restartTimer = null;
  }

  // ---------- áudio (mic de todo mundo, misturado) ----------

  _ensureAudioGraph() {
    if (this.audioCtx) return;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.audioDest = this.audioCtx.createMediaStreamDestination();
  }

  setAudioTrack(key, mediaStreamTrack) {
    this._ensureAudioGraph();
    this.removeAudioTrack(key);
    if (!mediaStreamTrack) return;
    try {
      const source = this.audioCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      source.connect(this.audioDest);
      this.audioSources.set(key, source);
    } catch {
      // track sem suporte a MediaStreamSource (raro) - segue sem esse áudio
    }
  }

  removeAudioTrack(key) {
    const source = this.audioSources.get(key);
    if (source) {
      try {
        source.disconnect();
      } catch {
        // já desconectado
      }
      this.audioSources.delete(key);
    }
  }

  // ---------- vídeo (quem está em destaque: tela compartilhada > quem fala > qualquer câmera) ----------

  registerVideoCandidate(key, el, priority) {
    if (!el) return;
    this.videoCandidates.set(key, { el, priority });
    this._reevaluateVideoSource();
  }

  unregisterVideoCandidate(key) {
    this.videoCandidates.delete(key);
    this._reevaluateVideoSource();
  }

  _bestVideoCandidate() {
    let best = null;
    for (const [key, cand] of this.videoCandidates) {
      if (!cand.el.isConnected) continue;
      if (!best || cand.priority > best.priority) best = { key, ...cand };
    }
    return best;
  }

  _reevaluateVideoSource() {
    if (!this.enabled) return;
    const best = this._bestVideoCandidate();
    const bestKey = best?.key ?? null;
    if (bestKey === this.currentVideoKey) return;
    // debounce pra nao reiniciar toda hora quando varias camaras entram/saem junto
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this._restartRecording(), 400);
  }

  // ---------- gravação ----------

  start() {
    this.enabled = true;
    this._restartRecording();
  }

  stop() {
    this.enabled = false;
    clearTimeout(this.restartTimer);
    this._stopRecorder();
    this.chunks = [];
    this.currentVideoKey = null;
  }

  _stopRecorder() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        // ja parado
      }
    }
    this.recorder = null;
  }

  _restartRecording() {
    if (!this.enabled) return;
    this._stopRecorder();
    this._ensureAudioGraph();

    const best = this._bestVideoCandidate();
    this.currentVideoKey = best?.key ?? null;

    const tracks = [];
    if (best?.el?.captureStream) {
      try {
        const videoStream = best.el.captureStream(VIDEO_FPS);
        tracks.push(...videoStream.getVideoTracks());
      } catch {
        // elemento sem captureStream (navegador antigo) - segue so' com audio
      }
    }
    tracks.push(...this.audioDest.stream.getAudioTracks());
    if (tracks.length === 0) return;

    const combined = new MediaStream(tracks);
    let recorder;
    try {
      recorder = new MediaRecorder(combined, {
        mimeType: pickMimeType(),
        videoBitsPerSecond: VIDEO_BITRATE,
      });
    } catch {
      return;
    }
    this.recorder = recorder;
    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      this.chunks.push({ blob: e.data, t: Date.now() });
      const cutoff = Date.now() - (MAX_BUFFER_SECONDS + 2) * 1000;
      while (this.chunks.length && this.chunks[0].t < cutoff) this.chunks.shift();
    };
    recorder.start(CHUNK_MS);
  }

  hasFootage() {
    return this.chunks.length > 0;
  }

  /** Junta os últimos `seconds` segundos do buffer num Blob de vídeo (ou null se não tiver nada). */
  async clip(seconds) {
    if (!this.chunks.length) return null;
    const cutoff = Date.now() - seconds * 1000;
    const picked = this.chunks.filter((c) => c.t >= cutoff);
    if (!picked.length) return null;
    const type = picked[0].blob.type || "video/webm";
    return new Blob(picked.map((c) => c.blob), { type });
  }
}

export const clipRecorder = new ClipRecorder();

export const CLIP_DURATIONS = [30, 45, 60];
