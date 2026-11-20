import api, { getToken, loadSession } from "../api";

/** Calls com alguém dentro agora, nos servidores da pessoa (mesma lista que o widget mostra). */
export async function fetchActiveCalls() {
  if (!getToken()) await loadSession(); // no widget do Android o app pode estar fechado
  if (!getToken()) return { loggedIn: false, calls: [] };
  const { data } = await api.get("/api/voice/active-calls");
  return { loggedIn: true, calls: Array.isArray(data) ? data : [] };
}

/** Link que abre o app direto na call. */
export function callLink(call) {
  const q = `name=${encodeURIComponent(call.channelName || "")}&serverId=${call.serverId}&serverName=${encodeURIComponent(call.serverName || "")}`;
  return `concorde://call/${call.channelId}?${q}`;
}

/** Lê um link concorde://call/<id>?... (ou null se não for de call). */
export function parseCallLink(url) {
  const m = /^concorde:\/\/call\/(\d+)(?:\?(.*))?$/i.exec(url || "");
  if (!m) return null;
  const params = {};
  for (const part of (m[2] || "").split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    params[k] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return {
    id: Number(m[1]),
    name: params.name || "Call",
    serverId: params.serverId ? Number(params.serverId) : undefined,
    serverName: params.serverName || undefined,
    type: "VOICE",
  };
}
