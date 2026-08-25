import { randomUUID } from "node:crypto";
import { Router } from "express";
import { broadcastQueue } from "./backendClient.js";
import { advanceNext, enqueue } from "./playback.js";
import { disconnectSession, getSession, moveSession, sessions, stopPlayback } from "./session.js";
import { playSoundboardClip } from "./soundboard.js";

function serializeQueue(session) {
  return {
    queueId: session?.queueId ?? null,
    active: session?.queueOpen ?? false,
    name: session?.queueName ?? null,
    nowPlaying: session?.nowPlaying
      ? { title: session.nowPlaying.title, durationSec: session.nowPlaying.durationSec }
      : null,
    queue: (session?.queue ?? []).map((item) => ({ title: item.title, durationSec: item.durationSec })),
  };
}

export const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, sessions: sessions.size }));

router.post("/play", async (req, res) => {
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

router.get("/queue/:channelId", (req, res) => {
  res.json(serializeQueue(sessions.get(req.params.channelId)));
});

router.post("/queue/:channelId/open", async (req, res) => {
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

router.post("/queue/:channelId/delete", (req, res) => {
  const session = sessions.get(req.params.channelId);
  if (!session) return res.status(400).json({ error: "Não tem nenhuma fila nesse canal" });
  session.queue = [];
  session.queueOpen = false;
  session.queueName = null;
  broadcastQueue(session);
  res.json({ ok: true });
});

router.post("/queue/:channelId/remove", (req, res) => {
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

router.post("/stop", async (req, res) => {
  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  await disconnectSession(String(channelId));
  res.json({ ok: true });
});

router.post("/skip", (req, res) => {
  const { channelId } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  const session = sessions.get(String(channelId));
  if (!session || !session.nowPlaying) {
    return res.status(400).json({ error: "Não tem nenhuma música tocando pra pular" });
  }
  stopPlayback(session);
  session.nowPlaying = null;
  advanceNext(session);
  res.json({ ok: true });
});

router.post("/mute", (req, res) => {
  const { channelId, muted } = req.body || {};
  if (!channelId) return res.status(400).json({ error: "channelId é obrigatório" });
  const session = sessions.get(String(channelId));
  if (session) session.forceMuted = Boolean(muted);
  res.json({ ok: true });
});

router.post("/pause", (req, res) => {
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

router.post("/soundboard/play", async (req, res) => {
  const { channelId, url } = req.body || {};
  if (!channelId || !url) return res.status(400).json({ error: "channelId e url são obrigatórios" });
  try {
    playSoundboardClip(String(channelId), String(url)).catch((err) => {
      console.error(`[soundboard ${channelId}] falha ao tocar:`, err.message);
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(`Falha ao iniciar som no canal ${channelId}:`, err);
    res.status(500).json({ error: err.message || "Falha ao tocar o som" });
  }
});

router.post("/move", async (req, res) => {
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
