import { MapIcon } from "./icons.jsx";
import BattleMap from "./BattleMap.jsx";

/**
 * Canal do tipo MAPA (kit de RPG) - casca simples (cabecalho com o nome do canal, igual um
 * canal de texto) por cima do BattleMap.jsx de sempre. Antes o mapa vivia DENTRO de um canal
 * de voz; agora e' um canal proprio, que qualquer membro abre clicando na barra lateral, sem
 * precisar entrar numa call (pedido explicito do usuario).
 */
export default function BattleMapChannel({ channel, stompClient, stompConnected }) {
  if (!channel) return <div className="chat-window empty">Selecione um canal</div>;

  return (
    <div className="battle-map-channel">
      <div className="chat-header">
        <span className="chat-header-name">
          <MapIcon size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
          {channel.name}
        </span>
      </div>
      <div className="battle-map-channel-body">
        <BattleMap
          channelId={channel.id}
          serverId={channel.serverId}
          categoryId={channel.categoryId}
          stompClient={stompClient}
          stompConnected={stompConnected}
        />
      </div>
    </div>
  );
}
