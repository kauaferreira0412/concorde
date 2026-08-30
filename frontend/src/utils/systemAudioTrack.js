// Constroi uma MediaStreamTrack de audio pra "Tela Inteira, sem o proprio Concorde" (Windows,
// app desktop - ver main.cjs concorde:start-system-audio-excluding-self). Diferente de
// windowAudioTrack.js (UM processo so'), aqui o Windows nao oferece um jeito de capturar "tudo
// menos X" de uma vez - a solucao e' capturar TODOS os outros processos que estiverem tocando
// som, um de cada vez (o processo principal ja filtra fora os do proprio Concorde, ver
// ownProcessPids em main.cjs), e MISTURAR tudo numa unica faixa aqui - um AudioWorkletNode
// "tocador" por processo, todos conectados no MESMO destino (o proprio Web Audio soma os sinais
// automaticamente ao conectar varias fontes no mesmo no', sem precisar somar amostra por
// amostra na mao). Processos novos que comecem a tocar som DEPOIS que a transmissao ja comecou
// entram sozinhos (o processo principal reforca a lista a cada poucos segundos), com um pequeno
// atraso ate' serem percebidos - avisado ao usuario ao iniciar (ver VoiceCallContext.jsx).
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

  const destNode = audioContext.createMediaStreamDestination();
  // pid -> AudioWorkletNode, um "tocador" por processo capturado - todos somados no mesmo
  // destNode (ver comentario no topo do arquivo).
  const nodesByPid = new Map();

  function nodeFor(pid) {
    let node = nodesByPid.get(pid);
    if (!node) {
      node = new AudioWorkletNode(audioContext, "system-audio-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.connect(destNode);
      nodesByPid.set(pid, node);
    }
    return node;
  }

  const removeChunkListener = desktop.onSystemAudioChunk((audioData) => {
    nodeFor(audioData.pid).port.postMessage({ buffer: audioData.buffer, channels: audioData.channels });
  });
  const removeStoppedListener = desktop.onSystemAudioPidStopped((pid) => {
    const node = nodesByPid.get(pid);
    if (!node) return;
    node.disconnect();
    nodesByPid.delete(pid);
  });

  const track = destNode.stream.getAudioTracks()[0];
  track._concordeCleanup = async () => {
    removeChunkListener();
    removeStoppedListener();
    try {
      await desktop.stopSystemAudioExcludingSelf();
    } catch {
      /* processo principal ja' pode ter derrubado tudo (ex: app fechando) */
    }
    nodesByPid.forEach((node) => node.disconnect());
    nodesByPid.clear();
    await audioContext.close();
  };
  return track;
}
