// Constroi uma MediaStreamTrack de audio a partir da captura nativa de audio de UMA janela
// (Windows - ver electron/native/window-audio-capture/, modulo C++ que usa a API "Process
// Loopback" do WASAPI, a mesma tecnica que o Discord usa). So' existe no app desktop
// (window.concordeDesktop) e so' funciona no Windows 10 2004+ - em qualquer outro caso essa
// funcao devolve null e quem chamou (VoiceCallContext.jsx) simplesmente compartilha a janela
// sem audio, sem quebrar nada.
//
// Como funciona: os bytes PCM crus (float32, 48kHz, estereo intercalado) chegam por IPC do
// processo principal, em pedacos. Um AudioWorklet funciona como "sintetizador" - enfileira
// esses pedacos e vai tocando eles no ritmo certo, alimentando um MediaStreamDestination (o
// jeito padrao da Web Audio API de transformar audio "de fora" numa MediaStreamTrack de
// verdade, que da' pra publicar no LiveKit igual qualquer outra).
const WORKLET_SOURCE = `
class WindowAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readOffset = 0;
    this.port.onmessage = (e) => {
      this.queue.push(e.data);
      // Evita o atraso crescer pra sempre se o processo principal atrasar - descarta os
      // pedacos mais antigos em vez de acumular latencia infinita.
      while (this.queue.length > 20) this.queue.shift();
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0];
    const frames = (output[0] && output[0].length) || 0;
    for (let i = 0; i < frames; i++) {
      if (this.queue.length === 0) {
        output[0][i] = 0;
        if (output[1]) output[1][i] = 0;
        continue;
      }
      const chunk = this.queue[0];
      output[0][i] = chunk[this.readOffset] || 0;
      if (output[1]) output[1][i] = chunk[this.readOffset + 1] || 0;
      this.readOffset += 2;
      if (this.readOffset >= chunk.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }
    return true;
  }
}
registerProcessor("window-audio-processor", WindowAudioProcessor);
`;

/** hwnd: number (ver id da fonte do desktopCapturer, formato "window:<hwnd>:0"). */
export async function startWindowAudioTrack(hwnd) {
  const desktop = window.concordeDesktop;
  if (!desktop?.startWindowAudioCapture) return null;

  const result = await desktop.startWindowAudioCapture(hwnd);
  if (!result?.ok) {
    console.warn("Áudio da janela indisponível:", result?.error);
    return null;
  }

  const audioContext = new AudioContext({ sampleRate: 48000 });
  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await audioContext.audioWorklet.addModule(blobUrl);
  } catch (err) {
    URL.revokeObjectURL(blobUrl);
    await audioContext.close();
    await desktop.stopWindowAudioCapture();
    console.warn("Não foi possível iniciar o processamento de áudio da janela:", err);
    return null;
  }
  URL.revokeObjectURL(blobUrl);

  const workletNode = new AudioWorkletNode(audioContext, "window-audio-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const destNode = audioContext.createMediaStreamDestination();
  workletNode.connect(destNode);

  const removeChunkListener = desktop.onWindowAudioChunk((buf) => {
    // buf: Buffer/Uint8Array vindo do IPC - bytes crus float32 (little-endian) intercalados.
    const floatData = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    try {
      workletNode.port.postMessage(floatData, [buf.buffer]);
    } catch {
      // buffer ja' foi transferido/detached por algum motivo - ignora esse pedaco, o proximo
      // chega em ~20ms de qualquer jeito.
    }
  });
  const removeErrorListener = desktop.onWindowAudioError((message) => {
    console.warn("Erro na captura de áudio da janela:", message);
  });

  const track = destNode.stream.getAudioTracks()[0];
  // Pendurado no proprio track pra quem for parar (stopElectronScreenShare) saber como
  // desligar tudo isso (native capture + worklet + audio context), nao so' track.stop().
  track._concordeCleanup = async () => {
    removeChunkListener();
    removeErrorListener();
    try {
      await desktop.stopWindowAudioCapture();
    } catch {
      /* processo ja' pode ter fechado */
    }
    workletNode.disconnect();
    await audioContext.close();
  };
  return track;
}
