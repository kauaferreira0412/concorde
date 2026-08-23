/**
 * Supressao de ruido "de verdade" do microfone - antes disso, a unica opcao era a constraint
 * nativa do navegador (getUserMedia { noiseSuppression: true }), que e' bem fraca (nao pega
 * ruido nao-estacionario tipo teclado/passos/cachorro) e, combinada com echo cancellation +
 * auto gain control em alguns drivers de microfone, as vezes cortava o audio inteiro (os dois
 * problemas relatados pelo usuario). Aqui usamos redes neurais rodando local no navegador via
 * AudioWorklet/WASM (@sapphi-red/web-noise-suppressor, MIT) - mesma familia de tecnica que o
 * "Krisp" do Discord usa (supressao por IA, nao so' um filtro de frequencia fixo):
 *
 *  - RNNoise: rede neural recorrente (xiph/rnnoise), o "padrao da industria" open-source pra
 *    isso - leve, roda bem em qualquer PC, ja usada em produtos como Mumble.
 *  - GTCRN: modelo mais novo e mais pesado (rede convolucional+recorrente), tende a limpar
 *    ruido MELHOR que o RNNoise em casos dificeis (varias vozes de fundo, ruido nao-continuo),
 *    ao custo de mais CPU.
 *
 * A constraint nativa (noiseSuppression) fica DESLIGADA quando um desses esta ativo - aplicar
 * os dois em cima um do outro e' provavelmente a causa do "corta o audio inteiro" relatado
 * (dois filtros agressivos brigando), entao so' um fica ativo de cada vez.
 *
 * Implementa a interface TrackProcessor do livekit-client (ver room/track/processor/types.d.ts
 * na lib) - assim que o microfone e' publicado, LocalAudioTrack.setProcessor(processor) troca o
 * track de verdade que vai pro resto dos participantes pelo track filtrado (processedTrack).
 */
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

/**
 * Forca um node do Web Audio a trabalhar com UM canal so' (mono), fazendo o DOWNMIX de
 * verdade se a entrada vier em estereo (soma os dois lados, "speakers" - nao descarta
 * nenhum canal). Sem isso, alguns microfones (principalmente USB/headset que capturam em
 * estereo mesmo tendo so' uma capsula de verdade) faziam o audio de quem estava com a
 * supressao de ruido/volume do microfone ligados sair so' de UM LADO do fone pra quem
 * escutava (reportado: "as vezes so ouve de um lado, desliga a supressao/sai e entra da call
 * que volta ao normal") - os defaults do Web Audio (channelCountMode "max") deixavam passar
 * 2 canais adiante em vez de combinar os dois num so'.
 */
function forceMonoDownmix(node) {
  node.channelCount = 1;
  node.channelCountMode = "explicit";
  node.channelInterpretation = "speakers";
}

// audioWorklet.addModule() da erro se voce registrar o MESMO nome de processor duas vezes no
// MESMO AudioContext - guarda a promise por contexto pra nunca tentar de novo (acontece se o
// usuario trocar de dispositivo de microfone varias vezes na mesma call, ver restart() abaixo).
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

/** Base comum: MediaStreamSource -> WorkletNode -> GainNode -> MediaStreamDestination. So'
 *  muda como o WorkletNode e' criado (RNNoise vs GTCRN) - ver subclasses abaixo. O GainNode
 *  aplica o volume do PROPRIO microfone (ver "gain" abaixo/createNoiseSuppressionProcessor) -
 *  fica DEPOIS do filtro de ruido de proposito (amplificar ANTES prejudicaria a rede neural
 *  detectando ruido, que espera o nivel "cru" do microfone). */
class BaseWasmNoiseSuppressionProcessor {
  name = "concorde-noise-suppression";
  // Setado ANTES de "track.setProcessor(processor)" chamar init() por baixo dos panos (ver
  // createNoiseSuppressionProcessor abaixo) - o LiveKit so' repassa {kind,track,audioContext,
  // localTrack} pro init(), sem espaco pra opcoes extras nossas passarem por ali.
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
      // AudioContext ja' pode ter sido fechado (call encerrada) - nao ha' o que limpar
    }
  }
}

/** So' o volume do microfone, sem supressao de ruido nenhuma (modo "off") - usado quando o
 *  volume do microfone NAO esta em 100% mas a supressao de ruido esta desligada, senao o
 *  ganho nao teria como ser aplicado (sem processador nenhum, o track cru vai direto). */
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
      // idem
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

/**
 * null quando NAO precisa de processador nenhum (modo "off" E volume do microfone em 100%) -
 * quem chama deve usar track.stopProcessor() nesse caso, o track cru vai direto. "gainPercent"
 * (0-200, ver getMicGain em utils/audioSettings.js) sempre entra no processador quando ele
 * existe - se so' o volume mudou (supressao "off"), cai no GainOnlyProcessor (so' o ganho, sem
 * filtro de ruido nenhum).
 */
export function createNoiseSuppressionProcessor(mode, gainPercent = 100) {
  const gain = Math.max(0, gainPercent) / 100;
  let processor = null;
  if (mode === "rnnoise") processor = new RnnoiseProcessor();
  else if (mode === "gtcrn") processor = new GtcrnProcessor();
  else if (gain !== 1) processor = new GainOnlyProcessor();
  if (processor) processor.gain = gain;
  return processor;
}
