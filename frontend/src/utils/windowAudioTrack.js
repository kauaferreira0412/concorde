const WORKLET_SOURCE = `
class WindowAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.readOffset = 0;
    this.channels = 2;
    this.port.onmessage = (e) => {
      this.channels = e.data.channels || 2;
      this.queue.push(e.data.buffer);
      // Evita o atraso crescer pra sempre se o processo principal atrasar - descarta os
      // pedacos mais antigos em vez de acumular latencia infinita.
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
registerProcessor("window-audio-processor", WindowAudioProcessor);
`;

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

  const removeChunkListener = desktop.onWindowAudioChunk((audioData) => {
    workletNode.port.postMessage({ buffer: audioData.buffer, channels: audioData.channels });
  });

  const track = destNode.stream.getAudioTracks()[0];
  track._concordeCleanup = async () => {
    removeChunkListener();
    try {
      await desktop.stopWindowAudioCapture();
    } catch {
    }
    workletNode.disconnect();
    await audioContext.close();
  };
  return track;
}
