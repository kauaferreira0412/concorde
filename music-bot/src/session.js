import { AccessToken, TrackSource as GrantTrackSource } from "livekit-server-sdk";
import { AudioSource, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { CHANNELS, IDLE_DISCONNECT_MS, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL, SAMPLE_RATE } from "./config.js";
import { broadcastQueue, notifyBackendPresence } from "./backendClient.js";

export const sessions = new Map();

async function connectToRoom(channelId) {
  const roomName = `channel-${channelId}`;
  const identity = `musicbot-${channelId}`;
  const accessToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: "Melodion" });
  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: false,
    canPublishSources: [GrantTrackSource.MICROPHONE],
  });
  const token = await accessToken.toJwt();

  const room = new Room();
  await room.connect(LIVEKIT_WS_URL, token, { autoSubscribe: false, dynacast: false });

  const source = new AudioSource(SAMPLE_RATE, CHANNELS);
  const track = LocalAudioTrack.createAudioTrack("music", source);
  const publishOptions = new TrackPublishOptions();
  publishOptions.source = TrackSource.SOURCE_MICROPHONE;
  await room.localParticipant.publishTrack(track, publishOptions);

  return { room, source, track };
}

function createSessionState(channelId, connection) {
  return {
    channelId,
    room: connection.room,
    source: connection.source,
    track: connection.track,
    ytdlp: null,
    ffmpeg: null,
    idleTimer: null,
    forceMuted: false,
    paused: false,
    resumePause: null,
    nowPlaying: null,
    queue: [],
    queueOpen: false,
    queueName: null,
    queueId: null,
    soundboardSource: null,
    soundboardTrack: null,
    soundboardQueue: null,
  };
}

function clearIdleTimer(session) {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
}

export function scheduleIdleDisconnect(session) {
  session.idleTimer = setTimeout(() => disconnectSession(session.channelId), IDLE_DISCONNECT_MS);
}

export async function connectSession(channelId) {
  const connection = await connectToRoom(channelId);
  const session = createSessionState(channelId, connection);
  sessions.set(channelId, session);
  console.log(`[${channelId}] bot entrou em channel-${channelId}`);
  notifyBackendPresence(channelId, true);
  return session;
}

export async function getSession(channelId) {
  const existing = sessions.get(channelId);
  if (existing) {
    clearIdleTimer(existing);
    return existing;
  }
  return connectSession(channelId);
}

export function stopPlayback(session) {
  session.ytdlp?.kill("SIGKILL");
  session.ytdlp = null;
  session.ffmpeg?.kill("SIGKILL");
  session.ffmpeg = null;
  session.paused = false;
  if (session.resumePause) {
    session.resumePause();
    session.resumePause = null;
  }
}

export async function disconnectSession(channelId) {
  const session = sessions.get(channelId);
  if (!session) return;

  sessions.delete(channelId);
  clearIdleTimer(session);
  stopPlayback(session);
  session.nowPlaying = null;
  session.queue = [];
  session.queueOpen = false;
  session.queueName = null;
  session.queueId = null;

  try {
    await session.track.close();
    if (session.soundboardTrack) await session.soundboardTrack.close();
    await session.room.disconnect();
  } catch (err) {
    console.warn(`[${channelId}] erro ao desconectar:`, err.message);
  }

  console.log(`[${channelId}] bot saiu da call`);
  notifyBackendPresence(channelId, false);
  broadcastQueue(session);
}

export async function moveSession(fromChannelId, toChannelId) {
  const session = sessions.get(fromChannelId);
  if (!session) throw new Error("O bot não está tocando nesse canal");
  clearIdleTimer(session);

  const newConnection = await connectToRoom(toChannelId);
  const oldRoom = session.room;
  const oldTrack = session.track;
  const oldSoundboardTrack = session.soundboardTrack;

  sessions.delete(fromChannelId);
  session.channelId = toChannelId;
  session.room = newConnection.room;
  session.source = newConnection.source;
  session.track = newConnection.track;
  session.soundboardSource = null;
  session.soundboardTrack = null;
  sessions.set(toChannelId, session);

  try {
    await oldTrack.close();
    if (oldSoundboardTrack) await oldSoundboardTrack.close();
    await oldRoom.disconnect();
  } catch (err) {
    console.warn(`[${fromChannelId}] erro desconectando da sala antiga após mover:`, err.message);
  }

  console.log(`[${fromChannelId}] bot movido pra channel-${toChannelId}`);
  notifyBackendPresence(fromChannelId, false);
  notifyBackendPresence(toChannelId, true);
}
