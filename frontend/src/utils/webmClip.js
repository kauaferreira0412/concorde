// Lê o WebM que o MediaRecorder vai soltando aos pedaços e guarda cada quadro (bloco)
// com seu tempo, pra depois montar um arquivo NOVO só com o trecho pedido: começando
// num quadro-chave (senão o vídeo abre com imagem velha/cinza até o próximo) e com os
// tempos recontados a partir de zero (senão o player acha que o clipe tem a duração
// da call inteira).

const ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Info: 0x1549a966,
  Tracks: 0x1654ae6b,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  ReferenceBlock: 0xfb,
  TimecodeScale: 0x2ad7b1,
  Duration: 0x4489,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
};

// Elementos que vivem direto dentro do Segment - quando aparecem, o Cluster atual acabou
const SEGMENT_LEVEL = new Set([
  ID.Cluster,
  ID.Info,
  ID.Tracks,
  0x114d9b74, // SeekHead
  0x1c53bb6b, // Cues
  0x1043a770, // Chapters
  0x1254c367, // Tags
  0x1941a469, // Attachments
]);

const UNKNOWN = -1;

function readId(buf, pos) {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  let len = 1;
  while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 4) throw new Error("WebM inválido (id)");
  if (pos + len > buf.length) return null;
  let value = 0;
  for (let i = 0; i < len; i++) value = value * 256 + buf[pos + i];
  return { value, len };
}

function readSize(buf, pos) {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8) throw new Error("WebM inválido (tamanho)");
  if (pos + len > buf.length) return null;
  let value = first & (0xff >> len);
  let allOnes = value === 0xff >> len;
  for (let i = 1; i < len; i++) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) allOnes = false;
  }
  return { value: allOnes ? UNKNOWN : value, len };
}

/** Lê o cabeçalho (id + tamanho) de um elemento; null se ainda faltam bytes. */
function readHeader(buf, pos) {
  const id = readId(buf, pos);
  if (!id) return null;
  const size = readSize(buf, pos + id.len);
  if (!size) return null;
  return { id: id.value, size: size.value, headerLen: id.len + size.len };
}

function readUint(buf, start, end) {
  let v = 0;
  for (let i = start; i < end; i++) v = v * 256 + buf[i];
  return v;
}

/** Percorre os filhos de um elemento já completo. */
function* children(buf, start, end) {
  let pos = start;
  while (pos < end) {
    const h = readHeader(buf, pos);
    if (!h || h.size === UNKNOWN) return;
    const dataStart = pos + h.headerLen;
    yield { id: h.id, start: pos, dataStart, end: dataStart + h.size };
    pos = dataStart + h.size;
  }
}

function concat(a, b) {
  if (!a.length) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---------- escrita ----------

function encodeId(id) {
  const bytes = [];
  while (id > 0) {
    bytes.unshift(id & 0xff);
    id = Math.floor(id / 256);
  }
  return bytes;
}

function encodeSize(n) {
  // sempre 8 bytes: simples e válido pra qualquer tamanho
  const bytes = [0x01];
  for (let i = 6; i >= 0; i--) bytes.push(Math.floor(n / 2 ** (8 * i)) & 0xff);
  return bytes;
}

function element(id, payloadParts) {
  const size = payloadParts.reduce((s, p) => s + p.length, 0);
  return [Uint8Array.from([...encodeId(id), ...encodeSize(size)]), ...payloadParts];
}

function uintElement(id, value) {
  const bytes = [];
  do {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  } while (value > 0);
  return element(id, [Uint8Array.from(bytes)]);
}

function floatElement(id, value) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, value);
  return element(id, [b]);
}

/**
 * Parser incremental do WebM ao vivo do MediaRecorder (Segment e Clusters com tamanho
 * "desconhecido"). Guarda o cabeçalho e uma lista de blocos com tempo absoluto.
 */
export class WebmBuffer {
  constructor() {
    this.pending = new Uint8Array(0);
    this.state = "ebml"; // ebml -> segment -> body
    this.ebmlBytes = null;
    this.infoBytes = null;
    this.tracksBytes = null;
    this.videoTrack = null;
    this.timecodeScale = 1_000_000; // ns por unidade (1ms é o padrão do Chrome)
    this.inCluster = false;
    this.clusterTime = 0;
    this.blocks = []; // { bytes, tcOffset, time, track, key }
    this.broken = false;
  }

  get ready() {
    return !!(this.ebmlBytes && this.infoBytes && this.tracksBytes);
  }

  /** Tempo (ms) do bloco mais recente. */
  get lastTimeMs() {
    const last = this.blocks[this.blocks.length - 1];
    return last ? this._ms(last.time) : 0;
  }

  _ms(time) {
    return (time * this.timecodeScale) / 1e6;
  }

  push(bytes) {
    if (this.broken) return;
    this.pending = concat(this.pending, bytes);
    try {
      this._parse();
    } catch (err) {
      console.warn("Clipe: não deu pra ler a gravação:", err);
      this.broken = true;
    }
  }

  _parse() {
    const buf = this.pending;
    let pos = 0;
    for (;;) {
      const h = readHeader(buf, pos);
      if (!h) break;
      const dataStart = pos + h.headerLen;

      if (this.state === "ebml") {
        if (h.id !== ID.EBML) throw new Error("WebM sem cabeçalho EBML");
        if (dataStart + h.size > buf.length) break;
        this.ebmlBytes = buf.slice(pos, dataStart + h.size);
        pos = dataStart + h.size;
        this.state = "segment";
        continue;
      }
      if (this.state === "segment") {
        if (h.id !== ID.Segment) throw new Error("WebM sem Segment");
        pos = dataStart; // entra no Segment (tamanho desconhecido)
        this.state = "body";
        continue;
      }

      // Dentro de um Cluster de tamanho desconhecido: segue até aparecer um elemento do Segment
      if (this.inCluster && !SEGMENT_LEVEL.has(h.id)) {
        if (h.size === UNKNOWN) throw new Error("bloco sem tamanho");
        if (dataStart + h.size > buf.length) break;
        this._clusterChild(buf, h.id, pos, dataStart, dataStart + h.size);
        pos = dataStart + h.size;
        continue;
      }

      if (h.id === ID.Cluster) {
        if (h.size === UNKNOWN) {
          this.inCluster = true;
          this.clusterTime = 0;
          pos = dataStart;
          continue;
        }
        if (dataStart + h.size > buf.length) break;
        this.inCluster = false;
        this.clusterTime = 0;
        for (const c of children(buf, dataStart, dataStart + h.size)) {
          this._clusterChild(buf, c.id, c.start, c.dataStart, c.end);
        }
        pos = dataStart + h.size;
        continue;
      }

      this.inCluster = false;
      if (h.size === UNKNOWN) throw new Error("elemento sem tamanho");
      if (dataStart + h.size > buf.length) break;
      if (h.id === ID.Info) this._readInfo(buf.slice(pos, dataStart + h.size));
      else if (h.id === ID.Tracks) this._readTracks(buf.slice(pos, dataStart + h.size));
      pos = dataStart + h.size;
    }
    this.pending = pos ? buf.slice(pos) : buf;
  }

  _readInfo(bytes) {
    this.infoBytes = bytes;
    const h = readHeader(bytes, 0);
    for (const c of children(bytes, h.headerLen, bytes.length)) {
      if (c.id === ID.TimecodeScale) this.timecodeScale = readUint(bytes, c.dataStart, c.end);
    }
  }

  _readTracks(bytes) {
    this.tracksBytes = bytes;
    const h = readHeader(bytes, 0);
    for (const entry of children(bytes, h.headerLen, bytes.length)) {
      if (entry.id !== ID.TrackEntry) continue;
      let number = null;
      let type = null;
      for (const c of children(bytes, entry.dataStart, entry.end)) {
        if (c.id === ID.TrackNumber) number = readUint(bytes, c.dataStart, c.end);
        if (c.id === ID.TrackType) type = readUint(bytes, c.dataStart, c.end);
      }
      if (type === 1 && number != null) this.videoTrack = number;
    }
  }

  _clusterChild(buf, id, start, dataStart, end) {
    if (id === ID.Timecode) {
      this.clusterTime = readUint(buf, dataStart, end);
      return;
    }
    let blockStart = dataStart;
    let key;
    if (id === ID.SimpleBlock) {
      key = !!(buf[dataStart + readSize(buf, dataStart).len + 2] & 0x80);
    } else if (id === ID.BlockGroup) {
      blockStart = null;
      let hasRef = false;
      for (const c of children(buf, dataStart, end)) {
        if (c.id === ID.Block) blockStart = c.dataStart;
        if (c.id === ID.ReferenceBlock) hasRef = true;
      }
      if (blockStart == null) return;
      key = !hasRef;
    } else {
      return; // outros filhos do Cluster não importam pro clipe
    }
    const trackVint = readSize(buf, blockStart);
    const tcPos = blockStart + trackVint.len;
    const rel = ((buf[tcPos] << 24) >> 16) | buf[tcPos + 1]; // int16 com sinal
    const bytes = buf.slice(start, end);
    this.blocks.push({
      bytes,
      tcOffset: tcPos - start,
      time: this.clusterTime + rel,
      track: trackVint.value,
      key,
    });
  }

  _isStart(block) {
    // Com vídeo, o clipe tem que começar num quadro-chave do vídeo; só áudio, qualquer bloco serve
    return this.videoTrack == null ? true : block.track === this.videoTrack && block.key;
  }

  /**
   * Descarta o que ficou mais velho que `keepMs`, mas sem jogar fora o último
   * quadro-chave antes desse corte (senão o começo do clipe não teria de onde decodificar).
   * `hardMaxMs` é o teto de memória mesmo se o quadro-chave estiver muito longe.
   */
  prune(keepMs, hardMaxMs) {
    if (!this.blocks.length) return;
    const lastMs = this.lastTimeMs;
    const cut = lastMs - keepMs;
    const hardCut = lastMs - hardMaxMs;
    let drop = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const ms = this._ms(this.blocks[i].time);
      if (ms > cut) break;
      if (this._isStart(this.blocks[i])) drop = i;
    }
    while (drop < this.blocks.length && this._ms(this.blocks[drop].time) < hardCut) drop++;
    if (drop > 0) this.blocks.splice(0, drop);
  }

  /** Monta um WebM independente com os últimos `seconds` segundos; null se não tiver nada. */
  build(seconds) {
    if (!this.ready || !this.blocks.length) return null;
    const blocks = this.blocks;
    const targetMs = this.lastTimeMs - seconds * 1000;

    // Último quadro-chave em ou antes do início pedido (clipe fica com >= `seconds`);
    // se o buffer ainda não alcança, pega o primeiro quadro-chave que existir.
    let startIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (!this._isStart(blocks[i])) continue;
      if (this._ms(blocks[i].time) <= targetMs) startIdx = i;
      else {
        if (startIdx === -1) startIdx = i;
        break;
      }
    }
    if (startIdx === -1) startIdx = 0;
    const base = blocks[startIdx].time;
    const picked = blocks.slice(startIdx).filter((b) => b.time >= base);

    // Recria os Clusters com tempos a partir de zero (um Cluster novo a cada quadro-chave
    // do vídeo ou quando o tempo relativo não cabe mais em int16)
    const clusterParts = [];
    let group = [];
    let groupTime = 0;
    const flush = () => {
      if (!group.length) return;
      clusterParts.push(...element(ID.Cluster, [...uintElement(ID.Timecode, groupTime), ...group]));
      group = [];
    };
    for (const b of picked) {
      const t = b.time - base;
      if (!group.length || t - groupTime > 30000 || (b.track === this.videoTrack && b.key)) {
        flush();
        groupTime = t;
      }
      const bytes = b.bytes.slice();
      const rel = t - groupTime;
      bytes[b.tcOffset] = (rel >> 8) & 0xff;
      bytes[b.tcOffset + 1] = rel & 0xff;
      group.push(bytes);
    }
    flush();

    const lastTime = picked[picked.length - 1].time - base;
    const frameGuess = 1000 / 24 / (this.timecodeScale / 1e6);
    const infoParts = this._infoWithDuration(lastTime + frameGuess);
    const segmentParts = element(ID.Segment, [...infoParts, this.tracksBytes, ...clusterParts]);
    return new Blob([this.ebmlBytes, ...segmentParts], { type: "video/webm" });
  }

  _infoWithDuration(duration) {
    const bytes = this.infoBytes;
    const h = readHeader(bytes, 0);
    const kept = [];
    for (const c of children(bytes, h.headerLen, bytes.length)) {
      if (c.id !== ID.Duration) kept.push(bytes.slice(c.start, c.end));
    }
    return element(ID.Info, [...kept, ...floatElement(ID.Duration, duration)]);
  }
}
