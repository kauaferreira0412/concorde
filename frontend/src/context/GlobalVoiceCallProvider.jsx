import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { createChatClient } from "../ws/chatSocket";
import { VoiceCallProvider } from "./VoiceCallContext.jsx";

export function GlobalVoiceCallProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const client = createChatClient(token);
    client.onConnect = () => setStompConnected(true);
    client.onDisconnect = () => setStompConnected(false);
    client.activate();
    setStompClient(client);
    return () => {
      client.deactivate();
      setStompConnected(false);
    };
  }, [isAuthenticated, token]);

  return (
    <VoiceCallProvider stompClient={stompClient} stompConnected={stompConnected}>
      {children}
    </VoiceCallProvider>
  );
}
