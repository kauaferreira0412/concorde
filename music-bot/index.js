// Bot de musica - servico Node.js SEPARADO do backend (Spring Boot) de proposito: publicar
// audio como um participante de verdade na sala do LiveKit exige o SDK nativo
// "@livekit/rtc-node" (a mesma engine usada nos outros SDKs "de verdade" do LiveKit), que so'
// existe pra Node/Python/Go - nao ha equivalente maduro pra Java. Em vez de forcar isso dentro
// do Spring Boot, esse processo pequeno cuida so' disso: entra na call como "Melodion" e
// toca o que o /play (ver ChatWindow.jsx/MusicController.java) mandar.
//
// Pipeline por musica: yt-dlp (extrai o audio do link/busca) -> ffmpeg (decodifica pra PCM cru)
// -> AudioSource do LiveKit (empacota em frames e publica). Tudo em streaming - nada e' salvo
// em disco, o audio so' passa pela memoria a caminho da call.
import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AccessToken, TrackSource as GrantTrackSource } from "livekit-server-sdk";
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
  dispose,
} from "@livekit/rtc-node";

const PORT = process.env.PORT || 4001;
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
// So' pra avisar o backend "entrei/saí de verdade da call" (ver MusicBotInternalController) -
// assim o bot aparece na lista de presenca de voz igual qualquer outro participante, em vez de
// ser invisivel pro app (o LiveKit sabe que ele esta la', mas o app tem seu PROPRIO controle de
// presenca separado, que so' quem publica nele aparece na sidebar).
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";
// 48kHz mono - mesma taxa que o resto do app usa (ver joinChannel em VoiceCallContext.jsx),
// evita reamostragem desnecessaria dentro do proprio LiveKit.
const SAMPLE_RATE = 48000;
const CHANNELS = 1;
// Ninguem tocou nada novo depois que uma musica termina - desconecta o bot da call sozinho
// depois desse tempo, em vez de ficar pra sempre como um participante mudo parado ali.
const IDLE_DISCONNECT_MS = 60_000;

if (!LIVEKIT_WS_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error("Faltam variáveis de ambiente: LIVEKIT_WS_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET");
  process.exit(1);
}

// channelId (string) -> sessao ativa (uma call de voz em que o bot esta conectado agora)
const sessions = new Map();

/** Entra numa sala do LiveKit como "Melodion" e publica um track de audio vazio, pronto
 *  pra receber frames - usado tanto pra entrar pela primeira vez (connectSession) quanto pra
 *  mover de canal (moveSession, que entra na sala NOVA antes de sair da antiga). */
async function connectToRoom(channelId) {
  const roomName = `channel-${channelId}`;
  const identity = `musicbot-${channelId}`;
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: "Melodion" });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    // O bot nunca precisa OUVIR ninguem - so' fala (toca musica). autoSubscribe:false abaixo
    // reforca isso (economiza banda/CPU decodificando audio que ninguem vai usar).
    canSubscribe: false,
    // Precisa ser o enum TrackSource de verdade (numero), nao a string "microphone" - passar
    // string aqui faz o FFI do LiveKit quebrar na hora de serializar o grant pro JWT
    // ("Cannot convert TrackSource microphone to string").
    canPublishSources: [GrantTrackSource.MICROPHONE],
  });
  const token = await at.toJwt();

  const room = new Room();
  await room.connect(LIVEKIT_WS_URL, token, { autoSubscribe: false, dynacast: false });

  const source = new AudioSource(SAMPLE_RATE, CHANNELS);
  const track = LocalAudioTrack.createAudioTrack("music", source);
  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(track, options);

  return { room, source, track };
}

/** So' chamado na primeira vez que alguem pede musica naquele canal. */
async function connectSession(channelId) {
  const { room, source, track } = await connectToRoom(channelId);
  const session = {
    channelId, room, source, track, ytdlp: null, ffmpeg: null, idleTimer: null,
    forceMuted: false, paused: false, resumePause: null,
    nowPlaying: null, // { title, durationSec } da musica TOCANDO agora, ou null
    queue: [], // [{ title, durationSec, resolvedQuery }, ...] - proximas na fila (ver /fila)
    // So' pode ter UMA fila "aberta" (o card do /fila) por vez nesse canal - abrir uma nova
    // ENCERRA a anterior automaticamente (ver POST /queue/:channelId/open), nao precisa apagar
    // na mao antes. Nao trava o /play (que continua enfileirando normalmente mesmo sem nenhuma
    // fila aberta) - e' so' o controle de "qual card esta ativo agora".
    queueOpen: false,
    queueName: null, // nome opcional dado no /fila <nome> - null = mostra so' "Fila de música"
    // Cada vez que uma fila e' aberta ganha um id novo (ver openQueue) - o card no chat (ver
    // MusicQueueCard.jsx) guarda o id de QUANDO ELE FOI CRIADO e so' continua se atualizando ao
    // vivo enquanto esse id bater com o atual; se nao bater mais (uma fila nova substituiu a
    // dele), o card se tranca pra sempre como "encerrada" em vez de virar a fila nova por baixo
    // dos panos (todos os cards do mesmo canal escutam o MESMO broadcast, entao sem isso o card
    // ANTIGO literalmente virava a fila NOVA na tela assim que alguem abria outra).
    queueId: null,
  };
  sessions.set(channelId, session);
  console.log(`[${channelId}] bot entrou em channel-${channelId}`);
  notifyBackendPresence(channelId, true);
  return session;
}

/**
 * Move o bot de canal SEM parar a musica - a musica atual (yt-dlp/ffmpeg) continua rodando
 * normalmente, so' troca PRA ONDE os frames sao publicados: conecta na sala NOVA primeiro,
 * so' desconecta da antiga DEPOIS de ja estar publicando na nova (evita um instante sem audio
 * saindo em canal nenhum). A propria sessao (mesmo objeto) e' reindexada pro channelId novo.
 */
async function moveSession(fromChannelId, toChannelId) {
  const session = sessions.get(fromChannelId);
  if (!session) throw new Error("O bot não está tocando nesse canal");
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }

  const { room: newRoom, source: newSource, track: newTrack } = await connectToRoom(toChannelId);
  const oldRoom = session.room;
  const oldTrack = session.track;

  sessions.delete(fromChannelId);
  session.channelId = toChannelId;
  session.room = newRoom;
  session.source = newSource;
  session.track = newTrack;
  sessions.set(toChannelId, session);

  try {
    await oldTrack.close();
    await oldRoom.disconnect();
  } catch (err) {
    console.warn(`[${fromChannelId}] erro desconectando da sala antiga após mover:`, err.message);
  }

  console.log(`[${fromChannelId}] bot movido pra channel-${toChannelId}`);
  notifyBackendPresence(fromChannelId, false);
  notifyBackendPresence(toChannelId, true);
}

/** Avisa o backend que o bot entrou/saiu de verdade - melhor esforco (nao trava nada da call
 *  se o backend estiver fora do ar nesse instante, so' o bot fica "invisivel" na sidebar). */
async function notifyBackendPresence(channelId, joined) {
  try {
    await fetch(`${BACKEND_URL}/internal/music-bot/${channelId}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joined }),
    });
  } catch (err) {
    console.warn(`[${channelId}] falha ao avisar presença pro backend:`, err.message);
  }
}

async function getSession(channelId) {
  const existing = sessions.get(channelId);
  if (existing) {
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    return existing;
  }
  return connectSession(channelId);
}

/** Mata os processos da musica ATUAL (se houver) - nao mexe na conexao com a call em si. */
function stopPlayback(session) {
  if (session.ytdlp) {
    session.ytdlp.kill("SIGKILL");
    session.ytdlp = null;
  }
  if (session.ffmpeg) {
    session.ffmpeg.kill("SIGKILL");
    session.ffmpeg = null;
  }
  // Se estava pausado (ver pumpAudio), acorda o loop preso esperando o /continue - senao ele
  // fica pendurado pra sempre esperando um resume que nunca vai chegar (a musica que ele
  // estava tocando acabou de ser morta acima).
  session.paused = false;
  if (session.resumePause) {
    session.resumePause();
    session.resumePause = null;
  }
}

async function disconnectSession(channelId) {
  const session = sessions.get(channelId);
  if (!session) return;
  sessions.delete(channelId);
  if (session.idleTimer) clearTimeout(session.idleTimer);
  stopPlayback(session);
  session.nowPlaying = null;
  session.queue = [];
  session.queueOpen = false;
  session.queueName = null;
  session.queueId = null;
  try {
    await session.track.close();
    await session.room.disconnect();
  } catch (err) {
    console.warn(`[${channelId}] erro ao desconectar:`, err.message);
  }
  console.log(`[${channelId}] bot saiu da call`);
  notifyBackendPresence(channelId, false);
  broadcastQueue(session); // avisa o card no chat que esvaziou (bot saiu = fila acabou tambem)
}

/** Titulo + duracao, sem baixar audio nenhum - pra devolver/mostrar algo bonito na fila (ver
 *  MusicQueueCard.jsx) sem precisar rodar o pipeline inteiro so' pra descobrir isso. */
function fetchMetadata(channelId, query) {
  return new Promise((resolve) => {
    const p = spawn("yt-dlp", [
      "--no-playlist",
      "--print",
      "%(title)s",
      "--print",
      "%(duration)s",
      "--skip-download",
      query,
    ]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => {
      console.error(`[${channelId}] yt-dlp não iniciou (metadados):`, e.message);
      resolve({ title: query, durationSec: null });
    });
    p.on("close", (code) => {
      if (code !== 0 && err.trim()) console.error(`[${channelId}] yt-dlp (metadados, código ${code}):`, err.trim());
      const [titleLine, durationLine] = out.trim().split("\n");
      const durationSec = Number(durationLine);
      resolve({
        title: titleLine?.trim() || query,
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec) : null,
      });
    });
  });
}

// Limite bem folgado so' pra alguem nao conseguir enfileirar milhares de musicas por engano
// (ou de proposito) - a fila em si e' so' uma lista de titulos/duracoes em memoria (bem leve),
// isso aqui e' mais bom-senso do que uma questao de peso na VPS.
const MAX_QUEUE = 50;

/**
 * Pedido de tocar uma musica (link ou busca livre, vira "ytsearch1:<busca>" pro proprio
 * yt-dlp resolver o primeiro resultado) - se NAO tiver nada tocando nesse canal agora, comeca
 * na hora; se ja' tiver, entra no FIM da fila (ver MAX_QUEUE) e toca sozinha quando chegar a
 * vez dela (ver advanceNext). Devolve {title, durationSec, queued} - queued=true quando so'
 * entrou na fila (nao comecou a tocar ainda).
 */
async function enqueue(channelId, queryRaw) {
  const query = queryRaw.trim();
  if (!query) throw new Error("Link ou nome da música vazio");
  const resolvedQuery = /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;

  const session = await getSession(channelId);
  // Decide AGORA (sincrono, antes do yt-dlp resolver os metadados - que pode levar ~1s) se essa
  // musica vai tocar na hora ou entrar na fila, RESERVANDO a vaga de "tocando agora" na hora.
  // Sem isso, dois /play quase simultaneos numa call ociosa podiam os dois se acharem "livres
  // pra tocar" (nenhum via o outro ainda tocando, porque nenhum tinha COMECADO a tocar de
  // verdade ainda) e chamar startPlayback ao mesmo tempo, spawnando dois pipelines por cima
  // um do outro.
  const playNow = !session.ffmpeg && !session.nowPlaying;
  if (playNow) {
    session.nowPlaying = { title: query, durationSec: null, resolvedQuery }; // placeholder ate' resolver
  } else if (session.queue.length >= MAX_QUEUE) {
    throw new Error(`Fila cheia (máximo ${MAX_QUEUE} músicas) - remova alguma antes de adicionar mais`);
  }

  const { title, durationSec } = await fetchMetadata(channelId, resolvedQuery);
  const item = { title, durationSec, resolvedQuery };

  if (playNow) {
    await startPlayback(session, item);
    return { title, durationSec, queued: false };
  }
  session.queue.push(item);
  broadcastQueue(session);
  return { title, durationSec, queued: true };
}

/** Toca UM item (ja' com titulo/duracao resolvidos) - troca o que estiver tocando agora, se
 *  houver (usado tanto pelo primeiro /play quanto por advanceNext, pra puxar o proximo da fila). */
async function startPlayback(session, item) {
  const channelId = session.channelId;
  stopPlayback(session);
  session.nowPlaying = item;
  broadcastQueue(session);

  const ytdlp = spawn("yt-dlp", ["--no-playlist", "-f", "bestaudio", "-o", "-", "--quiet", item.resolvedQuery]);
  const ffmpeg = spawn("ffmpeg", [
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-vn",
    "-ac",
    String(CHANNELS),
    "-ar",
    String(SAMPLE_RATE),
    "-f",
    "s16le",
    "pipe:1",
  ]);
  ytdlp.stdout.pipe(ffmpeg.stdin);
  // Quando a musica TROCA ou alguem manda /stop, stopPlayback mata os dois processos com
  // SIGKILL - se o yt-dlp ainda estiver escrevendo no stdin do ffmpeg bem nesse instante, o
  // pipe quebra (EPIPE) e, sem um listener de "error" no lado gravavel, o Node trata isso como
  // erro NAO TRATADO e derruba o processo INTEIRO (matava o bot pra todo mundo, nao so' essa
  // musica - ja aconteceu). "error" em stream so' precisa de UM listener pra virar seguro.
  ffmpeg.stdin.on("error", () => {});
  ytdlp.stdout.on("error", () => {});
  ffmpeg.stdout.on("error", () => {});
  // --quiet ja' tira o progresso normal do yt-dlp, entao o que sobra no stderr e' erro de
  // verdade (link invalido, video indisponivel, etc) - loga em vez de descartar, senao a
  // "musica" simplesmente fica muda sem nenhuma pista do motivo (ja aconteceu, ver historico).
  let ytdlpErr = "";
  ytdlp.stderr.on("data", (d) => (ytdlpErr += d.toString()));
  ytdlp.on("error", (err) => console.error(`[${channelId}] yt-dlp não iniciou:`, err.message));
  ytdlp.on("close", (code) => {
    if (code !== 0 && ytdlpErr.trim()) console.error(`[${channelId}] yt-dlp (código ${code}):`, ytdlpErr.trim());
  });
  ffmpeg.on("error", (err) => console.error(`[${channelId}] ffmpeg não iniciou:`, err.message));

  session.ytdlp = ytdlp;
  session.ffmpeg = ffmpeg;
  session.paused = false;
  pumpAudio(session, ffmpeg).finally(() => {
    if (session.ffmpeg !== ffmpeg) return; // uma musica nova ja comecou - isso e' resto da antiga
    session.ffmpeg = null;
    session.ytdlp = null;
    session.nowPlaying = null;
    advanceNext(session);
  });
}

/** Musica atual acabou (ou foi parada) - se tiver mais alguma na fila, toca a proxima na hora;
 *  senao, so' fica esperando quieto ate' o timeout de inatividade (ver IDLE_DISCONNECT_MS). */
function advanceNext(session) {
  const next = session.queue.shift();
  if (next) {
    broadcastQueue(session);
    startPlayback(session, next).catch((err) => {
      console.error(`[${session.channelId}] falha ao tocar a proxima da fila:`, err.message);
      advanceNext(session); // essa deu errado - tenta a de depois em vez de travar a fila inteira
    });
    return;
  }
  broadcastQueue(session);
  // session.channelId (nao uma variavel capturada la' em cima) porque o bot pode ter sido
  // MOVIDO de canal (ver moveSession) enquanto essa musica tocava.
  session.idleTimer = setTimeout(() => disconnectSession(session.channelId), IDLE_DISCONNECT_MS);
}

/** Avisa o backend o estado atual da fila (o que esta tocando + o que vem depois), pra ele
 *  repassar pro card ao vivo no chat (ver MusicBotInternalController/MusicQueueCard.jsx) -
 *  melhor esforco, igual notifyBackendPresence. */
async function broadcastQueue(session) {
  const channelId = session.channelId;
  const payload = {
    queueId: session.queueId,
    active: session.queueOpen,
    name: session.queueName,
    nowPlaying: session.nowPlaying
      ? { title: session.nowPlaying.title, durationSec: session.nowPlaying.durationSec }
      : null,
    queue: session.queue.map((item) => ({ title: item.title, durationSec: item.durationSec })),
  };
  try {
    await fetch(`${BACKEND_URL}/internal/music-bot/${channelId}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`[${channelId}] falha ao avisar fila pro backend:`, err.message);
  }
}

/**
 * Le o PCM que o ffmpeg vai cuspindo e publica na call, um frame de cada vez - PACEADO em
 * tempo real (ver AHEAD_MS abaixo). Sem isso, o ffmpeg entrega o audio MUITO mais rapido do
 * que a duracao real da musica (nao tem nenhum "player" do lado dele te esperando), entao a
 * musica inteira seria empurrada pro AudioSource do LiveKit em poucos segundos - o buffer
 * interno dele so' segura ~1s por padrao, entao quase tudo seria descartado e a call ficaria
 * quase muda (foi exatamente o bug: o bot entrava, mas nao saia som nenhum).
 */
async function pumpAudio(session, ffmpeg) {
  const AHEAD_MS = 300; // quanto de audio deixa "adiantado" na fila antes de pausar a leitura
  let leftover = Buffer.alloc(0);
  try {
    for await (const chunk of ffmpeg.stdout) {
      if (session.ffmpeg !== ffmpeg) return; // trocou de musica no meio - para de bombear a antiga
      // /pause (ver POST /pause) - trava aqui, SEM consumir mais nada do ffmpeg ate' o /continue
      // (resumePause abaixo) acordar isso. Diferente do forceMuted (que so' manda silencio e
      // deixa a musica andar escondida), pausar de verdade CONGELA o ponto da musica.
      if (session.paused) {
        await new Promise((resolve) => {
          session.resumePause = resolve;
        });
        if (session.ffmpeg !== ffmpeg) return; // parou/trocou de musica enquanto estava pausado
      }
      const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      const usableLength = data.length - (data.length % 2);
      leftover = Buffer.from(data.subarray(usableLength));
      if (usableLength === 0) continue;
      // Forcado a mudo por um moderador (ver VoiceModerationController/POST /mute) - manda
      // SILENCIO em vez de pular o frame, pra manter o pacing (queuedDuration abaixo) e a
      // musica continuar avancando escondida, pronta pra voltar do ponto certo quando desmutar.
      const int16 = session.forceMuted
        ? new Int16Array(usableLength / 2)
        : new Int16Array(data.buffer, data.byteOffset, usableLength / 2);
      const frame = new AudioFrame(int16, SAMPLE_RATE, CHANNELS, int16.length);
      try {
        await session.source.captureFrame(frame);
      } catch {
        // Sessao pode ja ter sido fechada (alguem mandou /stop no meio) - so' para de bombear.
        return;
      }
      const queued = session.source.queuedDuration;
      if (queued > AHEAD_MS) {
        await new Promise((resolve) => setTimeout(resolve, queued - AHEAD_MS));
      }
    }
  } catch (err) {
    console.error(`[${session.channelId}] erro lendo áudio do ffmpeg:`, err.message);
  }
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));

app.post("/play", async (req, res) => {
  const { channelId, query } = req.body || {};
  if (!channelId || !query) return res.status(400).json({ error: "channelId e query são obrigatórios" });
  try {
    const { title, durationSec, queued } = await enqueue(String(channelId), String(query));
    res.json({ title, durationSec, queued });
  } catch (err) {
    console.error(`Falha ao tocar/enfileirar no canal ${channelId}:`, err);
    res.status(500).json({ error: err.message || "Falha ao tocar a música" });
  }
});

/** Estado atual da fila desse canal - usado pro card carregar quando abre (ver
 *  MusicQueueCard.jsx); as atualizações AO VIVO depois disso vêm via WebSocket (broadcastQueue). */
app.get("/queue/:channelId", (req, res) => {
  const session = sessions.get(req.params.channelId);
  if (!session) return res.json({ queueId: null, active: false, name: null, nowPlaying: null, queue: [] });
  res.json({
    queueId: session.queueId,
    active: session.queueOpen,
    name: session.queueName,
    nowPlaying: session.nowPlaying
      ? { title: session.nowPlaying.title, durationSec: session.nowPlaying.durationSec }
      : null,
    queue: session.queue.map((item) => ({ title: item.title, durationSec: item.durationSec })),
  });
});

/** Abre a fila desse canal (ver /fila [nome] em ChatWindow.jsx) - ENCERRA automaticamente
 *  qualquer fila que ja estivesse aberta nesse canal (sem precisar apagar na mao antes: o card
 *  antigo, que guarda o queueId de quando foi criado, vai notar sozinho que o queueId mudou e
 *  se trancar como "encerrada" pra sempre, ver MusicQueueCard.jsx - so' o card NOVO, criado com
 *  esse queueId aqui, continua recebendo atualizacoes ao vivo). Entra na call se ainda nao tiver
 *  entrado (getSession), mesmo sem nenhuma musica tocando ainda - a fila pode ser criada "vazia"
 *  e ir recebendo musicas depois. Nome e' opcional (so' cosmetico, aparece no titulo do card). */
app.post("/queue/:channelId/open", async (req, res) => {
  try {
    const session = await getSession(req.params.channelId);
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 60) : "";
    session.queue = [];
    session.queueOpen = true;
    session.queueName = name || null;
    session.queueId = randomUUID();
    broadcastQueue(session);
    res.json({ ok: true, queueId: session.queueId });
  } catch (err) {
    console.error(`Falha ao abrir fila no canal ${req.params.channelId}:`, err);
    res.status(500).json({ error: err.message || "Falha ao abrir a fila" });
  }
});

/** Encerra a fila desse canal - descarta TODAS as musicas que ainda nao tocaram (a que esta
 *  tocando agora continua, so' as proximas somem). NAO apaga o card do chat (ver
 *  MusicQueueCard.jsx: o card so' passa a mostrar "encerrada" sozinho, via essa mesma
 *  atualizacao) nem desconecta o bot da call - so' libera pra abrir uma fila nova (ver /open). */
app.post("/queue/:channelId/delete", (req, res) => {
  const session = sessions.get(req.params.channelId);
  if (!session) return res.status(400).json({ error: "Não tem nenhuma fila nesse canal" });
  session.queue = [];
  session.queueOpen = false;
  session.queueName = null;
  broadcastQueue(session);
  res.json({ ok: true });
});

/** Remove UMA musica da fila pelo indice (0 = proxima a tocar) - NAO mexe na que esta tocando
 *  agora, so' nas que ainda estao esperando (ver MusicQueueCard.jsx). */
app.post("/queue/:channelId/remove", (req, res) => {
  const session = sessions.get(req.params.channelId);
  const { index } = req.body || {};
  if (!session) return res.status(400).json({ error: "Não tem nenhuma fila nesse canal" });
  if (typeof index !== "number" || index < 0 || index >= session.queue.length) {
    return res.status(400).json({ error: "Posição inválida na fila" });
  }
  session.queue.splice(index, 1);
  broadcastQueue(session);
  res.json({ ok: true });
});

app.post("/stop", async (req, res) => {
  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  await disconnectSession(String(channelId));
  res.json({ ok: true });
});

/** Pula a musica ATUAL e toca a proxima da fila (ou fica quieto se a fila estiver vazia,
 *  mesmo comportamento de quando uma musica termina sozinha - ver advanceNext). */
app.post("/skip", (req, res) => {
  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  const session = sessions.get(String(channelId));
  if (!session || !session.nowPlaying) {
    return res.status(400).json({ error: "Não tem nenhuma música tocando pra pular" });
  }
  // stopPlayback mata o ffmpeg/yt-dlp atual - o .finally() do pumpAudio (ver startPlayback) que
  // acompanhava ESSE processo vai reparar que session.ffmpeg ja nao bate mais com o que ele
  // tinha capturado e vai so' retornar sem fazer nada (esse guard existe pra evitar avancar
  // DUAS vezes quando uma musica nova ja assumiu no meio) - por isso quem chama advanceNext
  // aqui e' a gente mesmo, na hora, em vez de esperar aquele callback perceber sozinho.
  stopPlayback(session);
  session.nowPlaying = null;
  advanceNext(session);
  res.json({ ok: true });
});

/** Chamado pelo VoiceModerationController quando um moderador força mute/desmute NO BOT (o
 *  alvo do force-mute e' o userId sintetico do bot, ver VoicePresenceService.joinBot) - so'
 *  silencia os PROXIMOS frames (ver pumpAudio), nao mexe no processo/sessao em si. */
app.post("/mute", (req, res) => {
  const { channelId, muted } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  const session = sessions.get(String(channelId));
  if (session) session.forceMuted = Boolean(muted);
  res.json({ ok: true });
});

/** /pause e /continue (ver ChatWindow.jsx/MusicController.java) - CONGELA a musica no ponto
 *  exato em que estava (ver pumpAudio), diferente do /mute que so' silencia e deixa avancar. */
app.post("/pause", (req, res) => {
  const { channelId, paused } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  const session = sessions.get(String(channelId));
  if (!session) return res.status(400).json({ error: "Não tem nenhuma música tocando nesse canal" });
  session.paused = Boolean(paused);
  if (!session.paused && session.resumePause) {
    session.resumePause();
    session.resumePause = null;
  }
  res.json({ ok: true });
});

/** Chamado pelo VoiceModerationController quando um moderador MOVE o bot de canal de voz -
 *  ver moveSession (a musica continua tocando, so' troca pra onde o audio e' publicado). */
app.post("/move", async (req, res) => {
  const { fromChannelId, toChannelId } = req.body || {};
  if (!fromChannelId || !toChannelId) {
    return res.status(400).json({ error: "fromChannelId e toChannelId são obrigatórios" });
  }
  try {
    await moveSession(String(fromChannelId), String(toChannelId));
    res.json({ ok: true });
  } catch (err) {
    console.error(`Falha ao mover bot de ${fromChannelId} pra ${toChannelId}:`, err);
    res.status(500).json({ error: err.message || "Falha ao mover o bot" });
  }
});

app.listen(PORT, () => console.log(`Music bot ouvindo na porta ${PORT} (LiveKit: ${LIVEKIT_WS_URL})`));

async function shutdown() {
  for (const channelId of [...sessions.keys()]) {
    await disconnectSession(channelId);
  }
  await dispose();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Rede de seguranca: um erro nao tratado em QUALQUER lugar (ex: um "error" de stream que a
// gente esqueceu de tratar em algum processo filho) por padrao derruba o processo Node inteiro
// - isso ja' aconteceu (EPIPE do ffmpeg) e tirava o bot do ar pra TODOS os canais, nao so' o
// que estava tocando algo naquele instante. Loga e continua vivo em vez de morrer.
process.on("uncaughtException", (err) => console.error("Erro não tratado (bot continua no ar):", err));
process.on("unhandledRejection", (err) => console.error("Promise rejeitada sem catch (bot continua no ar):", err));
