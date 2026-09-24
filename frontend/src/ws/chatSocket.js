import { Client } from "@stomp/stompjs";

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

export function subscribeToChannel(client, channelId, onEvent) {
  return client.subscribe(`/topic/channel.${channelId}`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function sendChatMessage(client, channelId, content, imageUrl, replyToId, file) {
  client.publish({
    destination: `/app/channel.${channelId}.send`,
    body: JSON.stringify({
      content: content || "",
      imageUrl: imageUrl || null,
      replyToId: replyToId || null,
      fileUrl: file?.url || null,
      fileName: file?.name || null,
      fileType: file?.type || null,
      fileSize: file?.size || null,
    }),
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

export function rollDice(client, channelId, notation) {
  client.publish({
    destination: `/app/channel.${channelId}.roll`,
    body: JSON.stringify({ notation }),
  });
}

export function toggleReaction(client, channelId, messageId, emoji) {
  client.publish({
    destination: `/app/channel.${channelId}.react`,
    body: JSON.stringify({ messageId, emoji }),
  });
}

export function pinMessage(client, channelId, messageId, pinned) {
  client.publish({
    destination: `/app/channel.${channelId}.pin`,
    body: JSON.stringify({ messageId, pinned }),
  });
}

export function publishTyping(client, channelId, typing) {
  client.publish({
    destination: `/app/channel.${channelId}.typing`,
    body: JSON.stringify({ typing }),
  });
}

export function subscribeToTyping(client, channelId, onEvent) {
  return client.subscribe(`/topic/channel.${channelId}.typing`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function subscribeToMap(client, channelId, onEvent) {
  return client.subscribe(`/topic/channel.${channelId}.map`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}
export function addMapToken(client, channelId, { mapId, label, color, x, y, imageUrl }) {
  client.publish({
    destination: `/app/channel.${channelId}.map.token.add`,
    body: JSON.stringify({ mapId, label, color, x, y, imageUrl }),
  });
}
export function moveMapToken(client, channelId, tokenId, x, y) {
  client.publish({
    destination: `/app/channel.${channelId}.map.token.move`,
    body: JSON.stringify({ tokenId, x, y }),
  });
}
export function renameMapToken(client, channelId, tokenId, label, color, imageUrl) {
  client.publish({
    destination: `/app/channel.${channelId}.map.token.rename`,
    body: JSON.stringify({ tokenId, label, color, imageUrl }),
  });
}
export function removeMapToken(client, channelId, tokenId) {
  client.publish({
    destination: `/app/channel.${channelId}.map.token.remove`,
    body: JSON.stringify({ tokenId }),
  });
}

export function createPoll(client, channelId, question, options, multipleChoice) {
  client.publish({
    destination: `/app/channel.${channelId}.poll.create`,
    body: JSON.stringify({ question, options, multipleChoice }),
  });
}

export function votePoll(client, channelId, pollId, optionId) {
  client.publish({
    destination: `/app/channel.${channelId}.poll.vote`,
    body: JSON.stringify({ pollId, optionId }),
  });
}

export function addPollOption(client, channelId, pollId, text) {
  client.publish({
    destination: `/app/channel.${channelId}.poll.addOption`,
    body: JSON.stringify({ pollId, text }),
  });
}

export function subscribeToSoundboard(client, onUpdate) {
  return client.subscribe("/user/queue/soundboard", (frame) => {
    onUpdate(JSON.parse(frame.body));
  });
}

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

export function publishVoiceWatching(client, channelId, watchingUserIds) {
  client.publish({
    destination: `/app/channel.${channelId}.voice.watching`,
    body: JSON.stringify({ watchingUserIds }),
  });
}

export function subscribeToPresence(client, onEvent) {
  return client.subscribe("/topic/presence", (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

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

export function subscribeToDm(client, channelId, onEvent) {
  return client.subscribe(`/topic/dm.${channelId}`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function sendDmMessage(client, channelId, content, imageUrl, replyToId, file) {
  client.publish({
    destination: `/app/dm.${channelId}.send`,
    body: JSON.stringify({
      content: content || "",
      imageUrl: imageUrl || null,
      replyToId: replyToId || null,
      fileUrl: file?.url || null,
      fileName: file?.name || null,
      fileType: file?.type || null,
      fileSize: file?.size || null,
    }),
  });
}

export function editDmMessage(client, channelId, messageId, content) {
  client.publish({
    destination: `/app/dm.${channelId}.edit`,
    body: JSON.stringify({ messageId, content }),
  });
}

export function deleteDmMessage(client, channelId, messageId) {
  client.publish({
    destination: `/app/dm.${channelId}.delete`,
    body: JSON.stringify({ messageId }),
  });
}

export function rollDiceDm(client, channelId, notation) {
  client.publish({
    destination: `/app/dm.${channelId}.roll`,
    body: JSON.stringify({ notation }),
  });
}

export function toggleDmReaction(client, channelId, messageId, emoji) {
  client.publish({
    destination: `/app/dm.${channelId}.react`,
    body: JSON.stringify({ messageId, emoji }),
  });
}

export function pinDmMessage(client, channelId, messageId, pinned) {
  client.publish({
    destination: `/app/dm.${channelId}.pin`,
    body: JSON.stringify({ messageId, pinned }),
  });
}

export function publishDmTyping(client, channelId, typing) {
  client.publish({
    destination: `/app/dm.${channelId}.typing`,
    body: JSON.stringify({ typing }),
  });
}

export function subscribeToDmTyping(client, channelId, onEvent) {
  return client.subscribe(`/topic/dm.${channelId}.typing`, (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function subscribeToFriends(client, onEvent) {
  return client.subscribe("/user/queue/friends", (frame) => {
    onEvent(JSON.parse(frame.body));
  });
}

export function subscribeToMusicQueue(client, channelId, onUpdate) {
  return client.subscribe(`/topic/channel.${channelId}.music.queue`, (frame) => {
    onUpdate(JSON.parse(frame.body));
  });
}
