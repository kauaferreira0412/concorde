package com.codagis.concorde.dto;

import java.time.Instant;
import java.util.List;

public class MapDtos {

    public record BattleMapResponse(Long channelId, String imageUrl, Instant updatedAt) {}

    public record MapTokenResponse(Long id, Long channelId, String label, String color, double x, double y) {}

    // map = null quando o canal ainda nao tem nenhum mapa subido. canManageMap = se ESSE
    // usuario pode subir/trocar o mapa (ver MapService.canManageMap) - so' quem criou a
    // categoria do canal (o "mestre", pedido explicito do usuario), com fallback pra quem tem
    // MANAGE_CHANNELS (categoria sem categoria/antiga sem essa info, ou canal sem categoria
    // nenhuma). O frontend usa isso so' pra mostrar ou nao o botao (ver BattleMap.jsx) - o
    // backend confere de novo, de verdade, no upload (nunca confia so' no frontend).
    public record MapSnapshot(BattleMapResponse map, List<MapTokenResponse> tokens, boolean canManageMap) {}

    public record AddTokenRequest(String label, String color, double x, double y) {}

    // tokenId vai no CORPO (nao na URL/destino STOMP) - mesmo padrao ja' usado em
    // ToggleReactionRequest/PinMessageRequest/DeleteChatMessage (MessageDtos.java), em vez de
    // varias {variaveis} num so' destino STOMP (sem precedente no resto do projeto).
    public record MoveTokenRequest(Long tokenId, double x, double y) {}

    public record RenameTokenRequest(Long tokenId, String label, String color) {}

    public record RemoveTokenRequest(Long tokenId) {}

    // Evento ao vivo, transmitido em /topic/channel.{channelId}.map (ver MapWsController/
    // MapController) - "type" decide o que o frontend faz com o payload (ver BattleMap.jsx).
    // Mesmo formato "um record so', campos nulos conforme o tipo" que ChatEvent ja' usa
    // (MessageDtos.java) - mais simples de serializar/desserializar que uma hierarquia de tipos.
    public record MapEvent(String type, BattleMapResponse map, MapTokenResponse token, Long tokenId, Double x, Double y) {
        public static MapEvent uploaded(BattleMapResponse map) {
            return new MapEvent("MAP_UPLOADED", map, null, null, null, null);
        }
        public static MapEvent tokenAdded(MapTokenResponse token) {
            return new MapEvent("TOKEN_ADDED", null, token, null, null, null);
        }
        public static MapEvent tokenMoved(Long tokenId, double x, double y) {
            return new MapEvent("TOKEN_MOVED", null, null, tokenId, x, y);
        }
        public static MapEvent tokenRenamed(MapTokenResponse token) {
            return new MapEvent("TOKEN_RENAMED", null, token, null, null, null);
        }
        public static MapEvent tokenRemoved(Long tokenId) {
            return new MapEvent("TOKEN_REMOVED", null, null, tokenId, null, null);
        }
    }
}
