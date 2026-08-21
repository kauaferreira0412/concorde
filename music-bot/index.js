// Bot de musica - servico Node.js SEPARADO do backend (Spring Boot) de proposito: publicar
// audio como um participante de verdade na sala do LiveKit exige o SDK nativo
// "@livekit/rtc-node" (a mesma engine usada nos outros SDKs "de verdade" do LiveKit), que so'
// existe pra Node/Python/Go - nao ha equivalente maduro pra Java. Em vez de forcar isso dentro
// do Spring Boot, esse processo pequeno cuida so' disso: entra na call como "🎵 Music Bot" e
// toca o que o /play (ver ChatWindow.jsx/MusicController.java) mandar.
//
// Pipeline por musica: yt-dlp (extrai o audio do link/busca) -> ffmpeg (decodifica pra PCM cru)
// -> AudioSource do LiveKit (empacota em frames e publica). Tudo em streaming - nada e' salvo
// em disco, o audio so' passa pela memoria a caminho da call.
import express from "express";
import { spawn } from "node:child_process";
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

/** Entra na call como participante "🎵 Music Bot" e publica um track de audio vazio, pronto
 *  pra receber frames - so' chamado na primeira vez que alguem pede musica naquele canal. */
async function connectSession(channelId) {
  const roomName = `channel-${channelId}`;
  const identity = `musicbot-${channelId}`;
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: "🎵 Music Bot" });
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

  const session = { room, source, track, ytdlp: null, ffmpeg: null, idleTimer: null };
  sessions.set(channelId, session);
  console.log(`[${channelId}] bot entrou em ${roomName}`);
  return session;
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
}

async function disconnectSession(channelId) {
  const session = sessions.get(channelId);
  if (!session) return;
  sessions.delete(channelId);
  if (session.idleTimer) clearTimeout(session.idleTimer);
  stopPlayback(session);
  try {
    await session.track.close();
    await session.room.disconnect();
  } catch (err) {
    console.warn(`[${channelId}] erro ao desconectar:`, err.message);
  }
  console.log(`[${channelId}] bot saiu da call`);
}

/** So' o titulo, sem baixar audio nenhum - pra devolver algo bonito pro usuario ver no chat. */
function fetchTitle(channelId, query) {
  return new Promise((resolve) => {
    const p = spawn("yt-dlp", ["--no-playlist", "--print", "%(title)s", "--skip-download", query]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => {
      console.error(`[${channelId}] yt-dlp não iniciou (título):`, e.message);
      resolve(query);
    });
    p.on("close", (code) => {
      if (code !== 0 && err.trim()) console.error(`[${channelId}] yt-dlp (título, código ${code}):`, err.trim());
      resolve(out.trim() || query);
    });
  });
}

/**
 * Toca UMA musica na sessao desse canal - se ja tiver algo tocando, troca na hora (sem fila
 * por enquanto, e' "pedir uma musica nova" = "trocar a que esta rolando", igual apertar
 * next). Link direto (YouTube, SoundCloud, etc - o que o yt-dlp suportar) ou busca livre
 * (vira "ytsearch1:<busca>" pro proprio yt-dlp resolver o primeiro resultado).
 */
async function play(channelId, queryRaw) {
  const query = queryRaw.trim();
  if (!query) throw new Error("Link ou nome da música vazio");
  const resolvedQuery = /^https?:\/\//i.test(query) ? query : `ytsearch1:${query}`;

  const session = await getSession(channelId);
  stopPlayback(session);

  const title = await fetchTitle(channelId, resolvedQuery);

  const ytdlp = spawn("yt-dlp", ["--no-playlist", "-f", "bestaudio", "-o", "-", "--quiet", resolvedQuery]);
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
  pumpAudio(channelId, session, ffmpeg).finally(() => {
    if (session.ffmpeg !== ffmpeg) return; // uma musica nova ja comecou - isso e' resto da antiga
    session.ffmpeg = null;
    session.ytdlp = null;
    session.idleTimer = setTimeout(() => disconnectSession(channelId), IDLE_DISCONNECT_MS);
  });

  return title;
}

/**
 * Le o PCM que o ffmpeg vai cuspindo e publica na call, um frame de cada vez - PACEADO em
 * tempo real (ver AHEAD_MS abaixo). Sem isso, o ffmpeg entrega o audio MUITO mais rapido do
 * que a duracao real da musica (nao tem nenhum "player" do lado dele te esperando), entao a
 * musica inteira seria empurrada pro AudioSource do LiveKit em poucos segundos - o buffer
 * interno dele so' segura ~1s por padrao, entao quase tudo seria descartado e a call ficaria
 * quase muda (foi exatamente o bug: o bot entrava, mas nao saia som nenhum).
 */
async function pumpAudio(channelId, session, ffmpeg) {
  const AHEAD_MS = 300; // quanto de audio deixa "adiantado" na fila antes de pausar a leitura
  let leftover = Buffer.alloc(0);
  try {
    for await (const chunk of ffmpeg.stdout) {
      if (session.ffmpeg !== ffmpeg) return; // trocou de musica no meio - para de bombear a antiga
      const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      const usableLength = data.length - (data.length % 2);
      leftover = Buffer.from(data.subarray(usableLength));
      if (usableLength === 0) continue;
      const int16 = new Int16Array(data.buffer, data.byteOffset, usableLength / 2);
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
    console.error(`[${channelId}] erro lendo áudio do ffmpeg:`, err.message);
  }
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));

app.post("/play", async (req, res) => {
  const { channelId, query } = req.body || {};
  if (!channelId || !query) return res.status(400).json({ error: "channelId e query são obrigatórios" });
  try {
    const title = await play(String(channelId), String(query));
    res.json({ title });
  } catch (err) {
    console.error(`Falha ao tocar no canal ${channelId}:`, err);
    res.status(500).json({ error: err.message || "Falha ao tocar a música" });
  }
});

app.post("/stop", async (req, res) => {
  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  await disconnectSession(String(channelId));
  res.json({ ok: true });
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
