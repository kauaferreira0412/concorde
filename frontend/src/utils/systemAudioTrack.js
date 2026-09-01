// Constroi uma MediaStreamTrack de audio pra "Tela Inteira, sem o proprio Concorde" (Windows,
// app desktop) - UMA UNICA sessao de captura nativa do lado do processo principal (WASAPI
// Process Loopback em modo EXCLUDE, a mesma API que Discord/OBS usam pra isso - a lib
// "process-audio-capture" so' expunha o modo INCLUDE por padrao, patcheamos ela pra adicionar
// "startCaptureExcludingSelf" via patch-package, ver patches/process-audio-capture+*.patch e
// main.cjs). Sistema inteiro (jogo, musica, qualquer coisa tocando), menos o proprio Concorde -
// e' o Windows quem faz a exclusao de verdade, entao nao tem atraso nenhum pra pegar som de um
// programa aberto DEPOIS que a transmissao ja comecou (era o problema da versao anterior, que
// tentava capturar cada processo na mao).
//
// Mesmo "sintetizador" de audio que windowAudioTrack.js usa - os chunks PCM (Float32Array, ja'
// pronto) chegam por IPC do processo principal, um AudioWorklet vai tocando eles no ritmo
// certo, alimentando um MediaStreamDestination (a forma padrao da Web Audio API de virar uma
// MediaStreamTrack de verdade, publicavel no LiveKit).
const WORKLET_SOURCE = `
class SystemAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readOffset = 0;
    this.channels = 2;
    this.port.onmessage = (e) => {
      this.channels = e.data.channels || 2;
      this.queue.push(e.data.buffer);
      while (this.queue.length > 30) this.queue.shift();
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
      if (output[1]) output[1][i] = chunk[this.readOffset + (this.channels > 1 ? 1 : 0)] || 0;
      this.readOffset += this.channels;
      if (this.readOffset >= chunk.length) {
        this.queue.shift();
        this.readOffset = 0;
      }
    }
    return true;
  }
}
registerProcessor("system-audio-processor", SystemAudioProcessor);
`;

export async function startSystemAudioExcludingSelfTrack() {
  const desktop = window.concordeDesktop;
  if (!desktop?.startSystemAudioExcludingSelf) return null;

  const result = await desktop.startSystemAudioExcludingSelf();
  if (!result?.ok) {
    console.warn("Áudio de sistema (excluindo o Concorde) indisponível:", result?.error);
    return null;
  }

  const audioContext = new AudioContext({ sampleRate: 48000 });
  const blobUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
  try {
    await audioContext.audioWorklet.addModule(blobUrl);
  } catch (err) {
    URL.revokeObjectURL(blobUrl);
    await audioContext.close();
    await desktop.stopSystemAudioExcludingSelf();
    console.warn("Não foi possível iniciar o processamento de áudio do sistema:", err);
    return null;
  }
  URL.revokeObjectURL(blobUrl);

  const workletNode = new AudioWorkletNode(audioContext, "system-audio-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  const destNode = audioContext.createMediaStreamDestination();
  workletNode.connect(destNode);

  const removeChunkListener = desktop.onSystemAudioChunk((audioData) => {
    workletNode.port.postMessage({ buffer: audioData.buffer, channels: audioData.channels });
  });

  const track = destNode.stream.getAudioTracks()[0];
  track._concordeCleanup = async () => {
    removeChunkListener();
    try {
      await desktop.stopSystemAudioExcludingSelf();
    } catch {
      /* processo principal ja' pode ter derrubado tudo (ex: app fechando) */
    }
    workletNode.disconnect();
    await audioContext.close();
  };
  return track;
}
