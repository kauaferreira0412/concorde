import { GtcrnWorkletNode, RnnoiseWorkletNode, loadGtcrn, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWasmSimdPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import gtcrnWorkletPath from "@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url";
import gtcrnWasmPath from "@sapphi-red/web-noise-suppressor/gtcrn.wasm?url";

export const NOISE_SUPPRESSION_MODES = [
  {
    value: "off",
    label: "Desligada",
    description: "Áudio cru do microfone, sem nenhum filtro de ruído.",
  },
  {
    value: "rnnoise",
    label: "RNNoise (recomendado)",
    description: "IA leve, roda bem em qualquer PC - remove ruído de fundo (teclado, ventilador, passos, animais) sem consumir muito processamento.",
  },
  {
    value: "gtcrn",
    label: "GTCRN (mais forte)",
    description: "IA mais pesada e mais precisa - limpa até ruídos difíceis (várias pessoas falando ao fundo), usa mais CPU que o RNNoise.",
  },
];

function forceMonoDownmix(node) {
  node.channelCount = 1;
  node.channelCountMode = "explicit";
  node.channelInterpretation = "speakers";
}

const moduleLoadPromises = new WeakMap();
function ensureWorkletModule(audioContext, key, path) {
  let byKey = moduleLoadPromises.get(audioContext);
  if (!byKey) {
    byKey = new Map();
    moduleLoadPromises.set(audioContext, byKey);
  }
  if (!byKey.has(key)) {
    byKey.set(key, audioContext.audioWorklet.addModule(path));
  }
  return byKey.get(key);
}

class BaseWasmNoiseSuppressionProcessor {
  name = "concorde-noise-suppression";
  gain = 1;
  processedTrack;
  sourceNode;
  workletNode;
  gainNode;
  destinationNode;

  async init(opts) {
    const { track, audioContext } = opts;
    this.audioContext = audioContext;
    this.workletNode = await this.createWorkletNode(audioContext);
    this.sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
    forceMonoDownmix(this.sourceNode);
    this.gainNode = audioContext.createGain();
    forceMonoDownmix(this.gainNode);
    this.gainNode.gain.value = this.gain;
    this.destinationNode = audioContext.createMediaStreamDestination();
    this.sourceNode.connect(this.workletNode).connect(this.gainNode).connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    try {
      this.sourceNode?.disconnect();
      this.workletNode?.disconnect();
      this.workletNode?.destroy?.();
      this.gainNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
    }
  }
}

class GainOnlyProcessor {
  name = "concorde-mic-gain";
  gain = 1;
  processedTrack;
  sourceNode;
  gainNode;
  destinationNode;

  async init(opts) {
    const { track, audioContext } = opts;
    this.audioContext = audioContext;
    this.sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
    forceMonoDownmix(this.sourceNode);
    this.gainNode = audioContext.createGain();
    forceMonoDownmix(this.gainNode);
    this.gainNode.gain.value = this.gain;
    this.destinationNode = audioContext.createMediaStreamDestination();
    this.sourceNode.connect(this.gainNode).connect(this.destinationNode);
    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart(opts) {
    await this.destroy();
    await this.init(opts);
  }

  async destroy() {
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.destinationNode?.disconnect();
    } catch {
    }
  }
}

class RnnoiseProcessor extends BaseWasmNoiseSuppressionProcessor {
  name = "concorde-rnnoise";
  async createWorkletNode(audioContext) {
    await ensureWorkletModule(audioContext, "rnnoise", rnnoiseWorkletPath);
    const wasmBinary = await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
    return new RnnoiseWorkletNode(audioContext, { maxChannels: 1, wasmBinary });
  }
}

class GtcrnProcessor extends BaseWasmNoiseSuppressionProcessor {
  name = "concorde-gtcrn";
  async createWorkletNode(audioContext) {
    await ensureWorkletModule(audioContext, "gtcrn", gtcrnWorkletPath);
    const wasmBinary = await loadGtcrn({ url: gtcrnWasmPath });
    return new GtcrnWorkletNode(audioContext, { maxChannels: 1, wasmBinary });
  }
}

export function createNoiseSuppressionProcessor(mode, gainPercent = 100) {
  const gain = Math.max(0, gainPercent) / 100;
  let processor = null;
  if (mode === "rnnoise") processor = new RnnoiseProcessor();
  else if (mode === "gtcrn") processor = new GtcrnProcessor();
  else if (gain !== 1) processor = new GainOnlyProcessor();
  if (processor) processor.gain = gain;
  return processor;
}
