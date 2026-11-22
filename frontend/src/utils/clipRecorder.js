// Buffer circular de "replay" da call: grava continuamente os últimos 60s (video
// de quem está em destaque + áudio de todo mundo) em pedaços de 1s, descartando os
// mais antigos - e quando alguém clica em "Clipar", junta os últimos N segundos
// num arquivo de vídeo. Singleton (não é hook) porque precisa sobreviver a troca
// de telas/componentes sem perder o buffer.

const MAX_BUFFER_SECONDS = 60;
const CHUNK_MS = 1000;
const VIDEO_BITRATE = 1_800_000; // ~1.8 Mbps - 60s fica em torno de 13-15MB, 30s ~7MB

function pickMimeType(hasVideo) {
  const candidates = hasVideo
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    : ["audio/webm;codecs=opus", "audio/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

function captureError(message, track) {
  track?.stop();
  const err = new Error(message);
  err.concordeMessage = message;
  return err;
}

/**
 * Garante que a captura do navegador mostra só o Concorde: aba (Chrome/Edge) passa direto;
 * janela (Firefox não captura aba) tem que ser a do Concorde e perde a barra do navegador;
 * tela inteira é recusada.
 */
function onlyConcordeTrack(track) {
  if (!track) return null;
  const surface = track.getSettings?.().displaySurface;
  if (surface === "monitor") {
    throw captureError(
      "Pro clipe, escolha a janela do navegador com o Concorde (não a tela inteira) - assim ele grava só o Concorde.",
      track
    );
  }
  if (surface === "window") {
    const title = (document.title || "Concorde").toLowerCase();
    if (track.label && !track.label.toLowerCase().includes(title)) {
      throw captureError(
        "Pro clipe, escolha a janela do navegador em que o Concorde está aberto - outras janelas não são gravadas.",
        track
      );
    }
    return cropToPageContent(track);
  }
  return track;
}

/**
 * Corta a barra do navegador (abas/endereço) de uma captura de janela, deixando só a
 * página. Se a aba do Concorde não estiver visível (trocou de aba), congela no último
 * quadro em vez de gravar a outra aba.
 */
function cropToPageContent(sourceTrack) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([sourceTrack]);
  video.play().catch(() => {});

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const timer = setInterval(() => {
    if (document.hidden || !video.videoWidth) return;
    const scale = video.videoWidth / window.outerWidth;
    // Firefox informa onde a página começa na tela; nos outros, a barra fica toda em cima
    const offsetX = (window.mozInnerScreenX != null ? window.mozInnerScreenX - window.screenX : (window.outerWidth - window.innerWidth) / 2) * scale;
    const offsetY = (window.mozInnerScreenY != null ? window.mozInnerScreenY - window.screenY : window.outerHeight - window.innerHeight) * scale;
    const w = Math.min(video.videoWidth - offsetX, window.innerWidth * scale);
    const h = Math.min(video.videoHeight - offsetY, window.innerHeight * scale);
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== Math.round(w) || canvas.height !== Math.round(h)) {
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
    }
    ctx.drawImage(video, offsetX, offsetY, w, h, 0, 0, canvas.width, canvas.height);
  }, 1000 / 24);

  const output = canvas.captureStream(24).getVideoTracks()[0];
  const cleanup = () => {
    clearInterval(timer);
    video.srcObject = null;
    sourceTrack.stop();
  };
  output._concordeCleanup = cleanup;
  // "Parar de compartilhar" do navegador encerra a captura original - repassa pro recorte
  sourceTrack.addEventListener("ended", () => {
    cleanup();
    output.stop();
    output.dispatchEvent(new Event("ended"));
  });
  return output;
}

class ClipRecorder {
  constructor() {
    this.recorder = null;
    this.chunks = []; // { blob, t }
    // Só o primeiro pedaço de cada gravação tem o cabeçalho do WebM - sem ele o arquivo
    // não abre. Fica guardado à parte pra não sair do buffer junto com os antigos.
    this.headerChunk = null;
    this.audioCtx = null;
    this.audioDest = null;
    this.audioSources = new Map(); // key -> AudioNode
    this.videoCandidates = new Map(); // key -> { track, priority }
    this.currentVideoTrack = null;
    this.appTrack = null; // captura da tela do próprio Concorde
    this.enabled = false;
    this.restartTimer = null;
  }

  // ---------- áudio (mic de todo mundo, misturado) ----------

  _ensureAudioGraph() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.audioDest = this.audioCtx.createMediaStreamDestination();
    }
    // Criado fora de um clique, o navegador deixa o contexto suspenso e nada é gravado.
    if (this.audioCtx.state === "suspended") this.audioCtx.resume().catch(() => {});
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

  registerVideoCandidate(key, mediaStreamTrack, priority) {
    if (!mediaStreamTrack) return;
    this.videoCandidates.set(key, { track: mediaStreamTrack, priority });
    this._reevaluateVideoSource();
  }

  unregisterVideoCandidate(key) {
    this.videoCandidates.delete(key);
    this._reevaluateVideoSource();
  }

  _bestVideoCandidate() {
    let best = null;
    for (const [key, cand] of this.videoCandidates) {
      if (cand.track.readyState !== "live") continue;
      if (!best || cand.priority > best.priority) best = { key, ...cand };
    }
    return best;
  }

  _reevaluateVideoSource() {
    if (!this.enabled) return;
    const bestTrack = this._bestVideoCandidate()?.track ?? null;
    if (bestTrack === this.currentVideoTrack) return;
    // debounce pra nao reiniciar toda hora quando varias cameras entram/saem junto
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => this._restartRecording(), 400);
  }

  // ---------- tela do próprio Concorde (vira o vídeo do clipe quando existe) ----------

  /**
   * Pede a captura da tela do Concorde: no desktop pega a própria janela sem perguntar;
   * no navegador abre o seletor de tela (por isso precisa ser chamado direto no clique,
   * antes de qualquer await). Reaproveita a captura atual se ainda estiver ativa.
   * Resolve com a faixa de vídeo, ou null se não der/o usuário recusar.
   */
  requestAppCapture() {
    if (this.appTrack?.readyState === "live") return Promise.resolve(this.appTrack);
    let pending;
    try {
      const desktop = window.concordeDesktop;
      if (desktop?.getOwnWindowSourceId) {
        pending = desktop.getOwnWindowSourceId().then((sourceId) =>
          sourceId
            ? navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: "desktop",
                    chromeMediaSourceId: sourceId,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 24,
                  },
                },
              })
            : null
        );
      } else if (navigator.mediaDevices?.getDisplayMedia) {
        // Chrome/Edge: o seletor só oferece a própria aba (só a página, sem barra do navegador)
        pending = navigator.mediaDevices
          .getDisplayMedia({
            video: { frameRate: 24, displaySurface: "browser" },
            audio: false,
            preferCurrentTab: true,
            selfBrowserSurface: "include",
            surfaceSwitching: "exclude",
            monitorTypeSurfaces: "exclude",
          })
          .then((stream) => onlyConcordeTrack(stream.getVideoTracks()[0]));
      }
    } catch {
      pending = null;
    }
    this.lastCaptureError = null;
    return Promise.resolve(pending)
      .then((result) => (result instanceof MediaStream ? result.getVideoTracks()[0] : result) ?? null)
      .catch((err) => {
        if (err?.concordeMessage) this.lastCaptureError = err.concordeMessage;
        return null;
      });
  }

  /** Usa a faixa vinda de requestAppCapture() como vídeo do clipe. */
  useAppCapture(track) {
    if (!track) return;
    if (this.appTrack && this.appTrack !== track) {
      this.appTrack._concordeCleanup?.();
      this.appTrack.stop();
    }
    this.appTrack = track;
    // "Parar de compartilhar" do navegador: volta pras câmeras/telas da call
    track.addEventListener("ended", () => {
      if (this.appTrack !== track) return;
      this.appTrack = null;
      this.unregisterVideoCandidate("app-window");
    });
    this.registerVideoCandidate("app-window", track, 100);
  }

  stopAppCapture() {
    if (!this.appTrack) return;
    const track = this.appTrack;
    this.appTrack = null;
    this.unregisterVideoCandidate("app-window");
    track._concordeCleanup?.();
    track.stop();
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
    this.headerChunk = null;
    this.currentVideoTrack = null;
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
    // trocar de fonte começa um arquivo novo - o que tinha antes não junta com ele
    this.chunks = [];
    this.headerChunk = null;

    const best = this._bestVideoCandidate();
    this.currentVideoTrack = best?.track ?? null;

    const tracks = [];
    if (best) tracks.push(best.track);
    tracks.push(...this.audioDest.stream.getAudioTracks());

    const mimeType = pickMimeType(!!best);
    let recorder;
    try {
      recorder = new MediaRecorder(new MediaStream(tracks), {
        ...(mimeType ? { mimeType } : {}),
        ...(best ? { videoBitsPerSecond: VIDEO_BITRATE } : {}),
      });
      recorder.ondataavailable = (e) => {
        if (recorder !== this.recorder || !e.data || e.data.size === 0) return;
        if (!this.headerChunk) {
          this.headerChunk = e.data;
          return;
        }
        this.chunks.push({ blob: e.data, t: Date.now() });
        const cutoff = Date.now() - (MAX_BUFFER_SECONDS + 2) * 1000;
        while (this.chunks.length && this.chunks[0].t < cutoff) this.chunks.shift();
      };
      this.recorder = recorder;
      recorder.start(CHUNK_MS);
    } catch (err) {
      this.recorder = null;
      console.warn("Não foi possível iniciar a gravação de clipes:", err);
    }
  }

  /** Junta os últimos `seconds` segundos do buffer num Blob de vídeo (ou null se não tiver nada). */
  async clip(seconds) {
    this._ensureAudioGraph();
    if (!this.headerChunk) return null;
    const cutoff = Date.now() - seconds * 1000;
    const picked = this.chunks.filter((c) => c.t >= cutoff).map((c) => c.blob);
    return new Blob([this.headerChunk, ...picked], { type: this.headerChunk.type || "video/webm" });
  }
}

export const clipRecorder = new ClipRecorder();

export const CLIP_DURATIONS = [30, 45, 60];
