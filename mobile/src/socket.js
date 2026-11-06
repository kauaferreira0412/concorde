import { Client } from "@stomp/stompjs";
import { WS_URL } from "./config";

export function createChatClient(token) {
  return new Client({
    brokerURL: WS_URL,
    connectHeaders: { Authorization: `Bearer ${token}` },
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    forceBinaryWSFrames: true,
    appendMissingNULLonIncoming: true,
  });
}
