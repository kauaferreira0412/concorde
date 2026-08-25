import { spawn } from "node:child_process";
import { AudioFrame, AudioSource, LocalAudioTrack, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { CHANNELS, PACE_AHEAD_MS, SAMPLE_RATE, SOUNDBOARD_MAX_DURATION_SEC } from "./config.js";
import { getSession, scheduleIdleDisconnect } from "./session.js";

async function ensureSoundboardTrack(session) {
  if (session.soundboardSource) return session.soundboardSource;

  const source = new AudioSource(SAMPLE_RATE, CHANNELS);
  const track = LocalAudioTrack.createAudioTrack("soundboard", source);
  const publishOptions = new TrackPublishOptions();
  publishOptions.source = TrackSource.SOURCE_MICROPHONE;
  await session.room.localParticipant.publishTrack(track, publishOptions);

  session.soundboardSource = source;
  session.soundboardTrack = track;
  return source;
}

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

function buildFrame(data) {
  const sampleCount = data.length / 2;
  const int16 = new Int16Array(data.buffer, data.byteOffset, sampleCount);
  return new AudioFrame(int16, SAMPLE_RATE, CHANNELS, int16.length);
}

async function paceIfAhead(source) {
  const queued = source.queuedDuration;
  if (queued > PACE_AHEAD_MS) {
    await new Promise((resolve) => setTimeout(resolve, queued - PACE_AHEAD_MS));
  }
}

async function pumpClip(channelId, source, url) {
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
      await source.captureFrame(buildFrame(data.subarray(0, usableLength)));
      await paceIfAhead(source);
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
  const session = await getSession(channelId);
  const source = await ensureSoundboardTrack(session);

  const previous = session.soundboardQueue || Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => pumpClip(channelId, source, url))
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
