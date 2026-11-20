import { spawn } from "node:child_process";
import { AudioFrame } from "@livekit/rtc-node";
import { CHANNELS, PACE_AHEAD_MS, SAMPLE_RATE, SOUNDBOARD_MAX_DURATION_SEC } from "./config.js";
import { getSoundboardSession, scheduleSoundboardIdleDisconnect } from "./soundboardSession.js";

function spawnFfmpegDecoder(url) {
  return spawn("ffmpeg", [
    "-loglevel",
    "error",
    "-i",
    url,
    "-vn",
    "-t",
    String(SOUNDBOARD_MAX_DURATION_SEC),
    "-ac",
    String(CHANNELS),
    "-ar",
    String(SAMPLE_RATE),
    "-f",
    "s16le",
    "pipe:1",
  ]);
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

async function pumpClip(channelId, session, url, entry) {
  if (entry.cancelled) return;
  const ffmpeg = spawnFfmpegDecoder(url);
  entry.ffmpeg = ffmpeg;
  let stderr = "";
  ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));
  ffmpeg.stdout.on("error", () => {});
  ffmpeg.on("error", (err) => console.error(`[soundboard ${channelId}] ffmpeg não iniciou:`, err.message));

  let leftover = Buffer.alloc(0);
  try {
    for await (const chunk of ffmpeg.stdout) {
      if (entry.cancelled) break;
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
    console.error(`[soundboard ${channelId}] erro lendo áudio do ffmpeg:`, err.message);
  }
  if (stderr.trim()) {
    console.error(`[soundboard ${channelId}] ffmpeg (som inválido/inacessível):`, stderr.trim());
  }
}

export async function playSoundboardClip(channelId, url, userId = null) {
  const session = await getSoundboardSession(channelId);
  if (!session.plays) session.plays = new Set();
  // cada som tocado guarda quem tocou, pra essa pessoa poder parar só os dela
  const entry = { userId: userId == null ? null : String(userId), cancelled: false, ffmpeg: null };
  session.plays.add(entry);

  const previous = session.clipQueue || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => pumpClip(channelId, session, url, entry))
    .finally(() => {
      session.plays?.delete(entry);
      if (session.clipQueue === run) {
        session.clipQueue = null;
        scheduleSoundboardIdleDisconnect(session);
      }
    });
  session.clipQueue = run;
  return run;
}

/** Para os sons que estão tocando (e os da fila) - só os dessa pessoa, ou todos sem userId. */
export function stopSoundboardClips(session, userId = null) {
  if (!session?.plays) return 0;
  let stopped = 0;
  for (const entry of session.plays) {
    if (userId != null && entry.userId !== String(userId)) continue;
    entry.cancelled = true;
    try {
      entry.ffmpeg?.kill("SIGKILL");
    } catch {
      // já tinha terminado
    }
    stopped++;
  }
  return stopped;
}
