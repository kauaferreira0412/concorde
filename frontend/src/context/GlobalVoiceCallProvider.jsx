import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { createChatClient } from "../ws/chatSocket";
import { VoiceCallProvider } from "./VoiceCallContext.jsx";

/**
 * Mesma ideia do DmNotificationsProvider (ver DmNotificationsContext.jsx) - montado uma unica
 * vez em App.jsx, por FORA de /servers e /channels/@me, com sua PROPRIA conexao STOMP (nao a
 * de nenhuma pagina especifica).
 *
 * Antes o VoiceCallProvider vivia DENTRO de cada pagina (uma instancia em pages/servers/index.jsx,
 * outra em pages/home/index.jsx) - navegar de um servidor pra Home (ou vice-versa) trocava de
 * componente de rota e desmontava o provider de vez, o que disparava o cleanup de
 * VoiceCallContext.jsx (roomRef.current?.disconnect(), sem passar por disconnectInternal - ou
 * seja, sem marcar intentionalDisconnectRef primeiro). O LiveKit entao emitia um
 * RoomEvent.Disconnected "nao intencional" de verdade, e o app mostrava "Voce perdeu a conexao
 * com a call de voz (internet instavel?)" pro usuario mesmo ele so' tendo ido checar uma
 * mensagem privada - reportado, com print do alerta. Com o provider vivendo aqui em cima, fora
 * do roteamento, a call de voz continua conectada normalmente ao navegar entre servidor e DMs,
 * exatamente como ja acontecia ao trocar de CANAL dentro do mesmo servidor.
 */
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
