import { spawn } from "node:child_process";
import { AudioFrame } from "@livekit/rtc-node";
import { CHANNELS, MAX_QUEUE, PACE_AHEAD_MS, SAMPLE_RATE } from "./config.js";
import { broadcastQueue } from "./backendClient.js";
import { getSession, scheduleIdleDisconnect, stopPlayback } from "./session.js";
import { fetchMetadata, resolveQuery, spawnAudioStream } from "./ytdlp.js";

export async function enqueue(channelId, queryRaw) {
  const query = queryRaw.trim();
  if (!query) throw new Error("Link ou nome da música vazio");
  const resolvedQuery = resolveQuery(query);

  const session = await getSession(channelId);
  const playNow = !session.ffmpeg && !session.nowPlaying;
  if (playNow) {
    session.nowPlaying = { title: query, durationSec: null, resolvedQuery };
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

function spawnFfmpegDecoder() {
  return spawn("ffmpeg", [
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
}

function wirePipeline(channelId, ytdlp, ffmpeg) {
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdin.on("error", () => {});
  ytdlp.stdout.on("error", () => {});
  ffmpeg.stdout.on("error", () => {});

  let ytdlpErr = "";
  ytdlp.stderr.on("data", (d) => (ytdlpErr += d.toString()));
  ytdlp.on("error", (err) => console.error(`[${channelId}] yt-dlp não iniciou:`, err.message));
  ytdlp.on("close", (code) => {
    if (code !== 0 && ytdlpErr.trim()) console.error(`[${channelId}] yt-dlp (código ${code}):`, ytdlpErr.trim());
  });
  ffmpeg.on("error", (err) => console.error(`[${channelId}] ffmpeg não iniciou:`, err.message));
}

export async function startPlayback(session, item) {
  const channelId = session.channelId;
  stopPlayback(session);
  session.nowPlaying = item;
  broadcastQueue(session);

  const ytdlp = spawnAudioStream(item.resolvedQuery);
  const ffmpeg = spawnFfmpegDecoder();
  wirePipeline(channelId, ytdlp, ffmpeg);

  session.ytdlp = ytdlp;
  session.ffmpeg = ffmpeg;
  session.paused = false;

  pumpAudio(session, ffmpeg).finally(() => {
    if (session.ffmpeg !== ffmpeg) return;
    session.ffmpeg = null;
    session.ytdlp = null;
    session.nowPlaying = null;
    advanceNext(session);
  });
}

export function advanceNext(session) {
  const next = session.queue.shift();
  if (next) {
    startPlayback(session, next).catch((err) => {
      console.error(`[${session.channelId}] falha ao tocar a proxima da fila:`, err.message);
      advanceNext(session);
    });
    return;
  }
  broadcastQueue(session);
  scheduleIdleDisconnect(session);
}

async function waitWhilePaused(session, ffmpeg) {
  if (!session.paused) return true;
  await new Promise((resolve) => {
    session.resumePause = resolve;
  });
  return session.ffmpeg === ffmpeg;
}

function buildFrame(session, data) {
  const sampleCount = data.length / 2;
  const int16 = session.forceMuted ? new Int16Array(sampleCount) : new Int16Array(data.buffer, data.byteOffset, sampleCount);
  return new AudioFrame(int16, SAMPLE_RATE, CHANNELS, int16.length);
}

async function paceIfAhead(session) {
  const queued = session.source.queuedDuration;
  if (queued > PACE_AHEAD_MS) {
    await new Promise((resolve) => setTimeout(resolve, queued - PACE_AHEAD_MS));
  }
}

export async function pumpAudio(session, ffmpeg) {
  let leftover = Buffer.alloc(0);
  try {
    for await (const chunk of ffmpeg.stdout) {
      if (session.ffmpeg !== ffmpeg) return;

      const stillCurrent = await waitWhilePaused(session, ffmpeg);
      if (!stillCurrent) return;

      const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      const usableLength = data.length - (data.length % 2);
      leftover = Buffer.from(data.subarray(usableLength));
      if (usableLength === 0) continue;

      const frame = buildFrame(session, data.subarray(0, usableLength));
      try {
        await session.source.captureFrame(frame);
      } catch {
        return;
      }
      await paceIfAhead(session);
    }
  } catch (err) {
    console.error(`[${session.channelId}] erro lendo áudio do ffmpeg:`, err.message);
  }
}
