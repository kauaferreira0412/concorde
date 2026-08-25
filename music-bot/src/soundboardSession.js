import { AccessToken, TrackSource as GrantTrackSource } from "livekit-server-sdk";
import { AudioSource, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { CHANNELS, IDLE_DISCONNECT_MS, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_WS_URL, SAMPLE_RATE } from "./config.js";
import { notifySoundboardBackendPresence } from "./backendClient.js";

/**
 * Sessao do Batera - bot SEPARADO do Melodion, so' pra tocar os cliques do soundboard. Antes o
 * soundboard tocava numa segunda faixa publicada pelo PROPRIO Melodion (mesmo participante,
 * Track.Source.Microphone duas vezes) - o frontend so' sabe controlar UMA faixa de microfone
 * por participante (mutar/ensurdecer/volume, ver VoiceCallContext.jsx), entao a faixa "extra"
 * ficava tocando sem ninguem conseguir calar ela (bug reportado: "uso o soundboard, dps quero
 * tocar musica, nao consigo controlar o Melodion"). Com um participante de verdade separado no
 * LiveKit, os dois bots ficam cada um com o seu proprio controle de volume/mudo/ensurdecer, sem
 * disputar a mesma faixa - e dá pra mutar um sem afetar o outro.
 */
export const soundboardSessions = new Map();

async function connectToRoom(channelId) {
  const roomName = `channel-${channelId}`;
  const identity = `soundboardbot-${channelId}`;
  const accessToken = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name: "Batera" });
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
  const track = LocalAudioTrack.createAudioTrack("soundboard", source);
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
    idleTimer: null,
    forceMuted: false,
    clipQueue: null, // serializa os cliques desse canal (ver soundboard.js) - um de cada vez
  };
}

function clearIdleTimer(session) {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
}

export function scheduleSoundboardIdleDisconnect(session) {
  session.idleTimer = setTimeout(() => disconnectSoundboardSession(session.channelId), IDLE_DISCONNECT_MS);
}

export async function connectSoundboardSession(channelId) {
  const connection = await connectToRoom(channelId);
  const session = createSessionState(channelId, connection);
  soundboardSessions.set(channelId, session);
  console.log(`[${channelId}] Batera entrou em channel-${channelId}`);
  notifySoundboardBackendPresence(channelId, true);
  return session;
}

export async function getSoundboardSession(channelId) {
  const existing = soundboardSessions.get(channelId);
  if (existing) {
    clearIdleTimer(existing);
    return existing;
  }
  return connectSoundboardSession(channelId);
}

export async function disconnectSoundboardSession(channelId) {
  const session = soundboardSessions.get(channelId);
  if (!session) return;

  soundboardSessions.delete(channelId);
  clearIdleTimer(session);

  try {
    await session.track.close();
    await session.room.disconnect();
  } catch (err) {
    console.warn(`[${channelId}] erro ao desconectar o Batera:`, err.message);
  }

  console.log(`[${channelId}] Batera saiu da call`);
  notifySoundboardBackendPresence(channelId, false);
}

export async function moveSoundboardSession(fromChannelId, toChannelId) {
  const session = soundboardSessions.get(fromChannelId);
  if (!session) throw new Error("O Batera não está nesse canal");
  clearIdleTimer(session);

  const newConnection = await connectToRoom(toChannelId);
  const oldRoom = session.room;
  const oldTrack = session.track;

  soundboardSessions.delete(fromChannelId);
  session.channelId = toChannelId;
  session.room = newConnection.room;
  session.source = newConnection.source;
  session.track = newConnection.track;
  soundboardSessions.set(toChannelId, session);

  try {
    await oldTrack.close();
    await oldRoom.disconnect();
  } catch (err) {
    console.warn(`[${fromChannelId}] erro desconectando o Batera da sala antiga após mover:`, err.message);
  }

  console.log(`[${fromChannelId}] Batera movido pra channel-${toChannelId}`);
  notifySoundboardBackendPresence(fromChannelId, false);
  notifySoundboardBackendPresence(toChannelId, true);
}
