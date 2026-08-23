import { Client } from "@stomp/stompjs";

// Monta o WS a partir da MESMA pagina que carregou o app (mesma logica do api/client.js) -
// wss:// se a pagina for https (ngrok), ws:// se for http (localhost). O proxy do Vite
// (ver vite.config.js) encaminha "/ws" pro backend de verdade.
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

export function createChatClient(token) {
  const client = new Client({
    brokerURL: WS_URL,
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
  });
  return client;
}

/** onEvent recebe um ChatEvent: { type: "CREATED"|"UPDATED"|"DELETED", message?, messageId? } */
export function subscribeToChannel(client, channelId, onEvent) {
  return client.subscribe(`/topic/channel.${channelId}`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function sendChatMessage(client, channelId, content, imageUrl, replyToId) {
  client.publish({
    destination: `/app/channel.${channelId}.send`,
    body: JSON.stringify({ content: content || "", imageUrl: imageUrl || null, replyToId: replyToId || null }),
  });
}

export function editChatMessage(client, channelId, messageId, content) {
  client.publish({
    destination: `/app/channel.${channelId}.edit`,
    body: JSON.stringify({ messageId, content }),
  });
}

export function deleteChatMessage(client, channelId, messageId) {
  client.publish({
    destination: `/app/channel.${channelId}.delete`,
    body: JSON.stringify({ messageId }),
  });
}

/** Comando /roll (ver DiceService no backend pra notacao aceita, ex: "2d20+5"). */
export function rollDice(client, channelId, notation) {
  client.publish({
    destination: `/app/channel.${channelId}.roll`,
    body: JSON.stringify({ notation }),
  });
}

/**
 * Presenca de canal de voz: "quem esta conectado agora" e' visivel para QUALQUER membro
 * do servidor (nao precisa ter entrado na call). Ja o indicador de "quem esta falando"
 * fica restrito a quem realmente entrou na call, vindo do proprio LiveKit (ver VoiceChannel.jsx).
 */
export function subscribeToVoicePresence(client, channelId, onUpdate) {
  return client.subscribe(`/topic/channel.${channelId}.voice`, (frame) => {
    onUpdate(JSON.parse(frame.body));
  });
}

export function publishVoiceJoin(client, channelId) {
  client.publish({ destination: `/app/channel.${channelId}.voice.join`, body: "{}" });
}

export function publishVoiceLeave(client, channelId) {
  client.publish({ destination: `/app/channel.${channelId}.voice.leave`, body: "{}" });
}

export function publishVoiceMicState(client, channelId, micEnabled) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.mic`,
    body: JSON.stringify({ micEnabled }),
  });
}

export function publishVoiceDeafenState(client, channelId, deafened) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.deafen`,
    body: JSON.stringify({ deafened }),
  });
}

/** Lista INTEIRA e atualizada de quem (userIds) a pessoa esta assistindo agora (pode assistir
 *  mais de uma transmissao ao mesmo tempo) - so' repassado pra todo mundo do canal (ver
 *  VoicePresenceService.setWatching no backend), pra quem esta compartilhando saber quem esta
 *  vendo (ver icone no cantinho do quadrado de transmissao, VoiceChannel.jsx). */
export function publishVoiceWatching(client, channelId, watchingUserIds) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.watching`,
    body: JSON.stringify({ watchingUserIds }),
  });
}

/**
 * Presenca GLOBAL (app aberto, nao so' na call de voz) - um usuario por vez, transmitido
 * pra todo mundo que tem esse topico assinado (ver OnlinePresenceService no backend).
 * onEvent recebe { userId, online }.
 */
export function subscribeToPresence(client, onEvent) {
  return client.subscribe("/topic/presence", (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

/**
 * Moderacao de voz (mover/expulsar/mutar/ensurdecer OUTRO membro a força - ver
 * VoiceModerationController no backend, exige permissao). Todo mundo olhando o canal recebe
 * o evento (mesmo padrao da presenca), mas so' o cliente cujo userId bate com targetUserId
 * age de verdade (ver VoiceCallContext.jsx) - os outros ignoram silenciosamente.
 */
export function subscribeToVoiceControl(client, channelId, onEvent) {
  return client.subscribe(`/topic/channel.${channelId}.voice.control`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function publishVoiceMove(client, channelId, targetUserId, toChannelId) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.move`,
    body: JSON.stringify({ targetUserId, toChannelId }),
  });
}

export function publishVoiceKick(client, channelId, targetUserId) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.kick`,
    body: JSON.stringify({ targetUserId }),
  });
}

export function publishVoiceForceMute(client, channelId, targetUserId, muted) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.force-mute`,
    body: JSON.stringify({ targetUserId, muted }),
  });
}

export function publishVoiceForceDeafen(client, channelId, targetUserId, deafened) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.force-deafen`,
    body: JSON.stringify({ targetUserId, deafened }),
  });
}

/**
 * Fila de musica (ver MusicQueueCard.jsx/MusicBotInternalController.java) - o proprio bot
 * (music-bot/index.js) manda um snapshot completo { nowPlaying, queue } toda vez que ela muda
 * (musica trocou, alguem adicionou/removeu), o backend so' retransmite. channelId aqui e' o
 * canal de VOZ onde o bot esta tocando (pode ser diferente do canal de texto onde o /fila foi
 * digitado - ver ChatWindow.jsx).
 */
export function subscribeToMusicQueue(client, channelId, onUpdate) {
  return client.subscribe(`/topic/channel.${channelId}.music.queue`, (frame) => {
    onUpdate(JSON.parse(frame.body));
  });
}
