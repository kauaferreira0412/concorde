import { spawn } from "node:child_process";
import { CHANNELS, PACE_AHEAD_MS, SAMPLE_RATE, SOUNDBOARD_MAX_DURATION_SEC } from "./config.js";
import { getSession, scheduleIdleDisconnect } from "./session.js";

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

async function paceIfAhead(session) {
  const queued = session.mixer.soundboardBufferedMs();
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
      session.mixer.pushSoundboard(data.subarray(0, usableLength));
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
// espera o primeiro acabar em vez de misturar os dois clipes um em cima do outro no MESMO
// canal do soundboard (o mixer ja' soma soundboard + musica normalmente - isso aqui e' so'
// pra nao embolar dois cliques de soundboard ao mesmo tempo).
export async function playSoundboardClip(channelId, url) {
  const session = await getSession(channelId);

  const previous = session.soundboardQueue || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => pumpClip(channelId, session, url))
    .finally(() => {
      if (session.soundboardQueue === run) {
        session.soundboardQueue = null;
        if (!session.nowPlaying && session.queue.length === 0) {
          scheduleIdleDisconnect(session);
        }
      }
    });
  session.soundboardQueue = run;
  return run;
}
