import { BACKEND_URL } from "./config.js";

async function postJson(path, body) {
  try {
    await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn(`Falha ao chamar ${path}:`, err.message);
  }
}

export function notifyBackendPresence(channelId, joined) {
  return postJson(`/internal/music-bot/${channelId}/presence`, { joined });
}

export function broadcastQueue(session) {
  return postJson(`/internal/music-bot/${session.channelId}/queue`, {
    queueId: session.queueId,
    active: session.queueOpen,
    name: session.queueName,
    nowPlaying: session.nowPlaying
      ? { title: session.nowPlaying.title, durationSec: session.nowPlaying.durationSec }
      : null,
    queue: session.queue.map((item) => ({ title: item.title, durationSec: item.durationSec })),
  });
}
