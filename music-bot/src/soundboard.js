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

async function pumpClip(channelId, session, url) {
  const ffmpeg = spawnFfmpegDecoder(url);
  let stderr = "";
  ffmpeg.stderr.on("data", (d) => (stderr += d.toString()));
  ffmpeg.stdout.on("error", () => {});
  ffmpeg.on("error", (err) => console.error(`[soundboard ${channelId}] ffmpeg não iniciou:`, err.message));

  let leftover = Buffer.alloc(0);
  try {
    for await (const chunk of ffmpeg.stdout) {
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

// Fila serializada POR CANAL - se duas pessoas tocarem um som quase ao mesmo tempo, o segundo
// espera o primeiro acabar em vez de misturar os dois frames na mesma AudioSource (o que
// corromperia o audio dos dois).
export async function playSoundboardClip(channelId, url) {
  const session = await getSoundboardSession(channelId);

  const previous = session.clipQueue || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => pumpClip(channelId, session, url))
    .finally(() => {
      if (session.clipQueue === run) {
        session.clipQueue = null;
        scheduleSoundboardIdleDisconnect(session);
      }
    });
  session.clipQueue = run;
  return run;
}
