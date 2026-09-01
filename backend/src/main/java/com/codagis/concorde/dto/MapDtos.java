package com.codagis.concorde.dto;

import java.time.Instant;
import java.util.List;

public class MapDtos {

    public record BattleMapResponse(Long id, Long channelId, String name, String imageUrl, boolean active, Instant createdAt) {}

    public record MapTokenResponse(Long id, Long mapId, String label, String color, double x, double y, String imageUrl) {}

    public record TokenImageUploadResponse(String url) {}

    // maps = TODOS os mapas desse canal (o mestre pode ter varios - "mapa 1", "mapa 2"...).
    // activeMapId = qual deles esta' sendo mostrado pra TODO MUNDO agora (null = nenhum mapa
    // ainda). tokens = so' os do mapa ATIVO (o que esta' na tela). canManageMap = se ESSE
    // usuario e' o mestre (pode criar/ativar/apagar mapa e adicionar token - ver
    // MapService.canManageMap). O frontend usa isso so' pra mostrar ou nao os botoes - o
    // backend confere de novo, de verdade, em cada acao (nunca confia so' no frontend).
    public record MapSnapshot(List<BattleMapResponse> maps, Long activeMapId, List<MapTokenResponse> tokens, boolean canManageMap) {}

    // mapId: em qual mapa (dos varios que o canal pode ter) esse token nasce - pedido explicito
    // do usuario: token vive DENTRO de um mapa especifico, nao do canal como um todo. imageUrl
    // opcional - usado quando o token nasce ja' com a FOTO de um personagem da mesa ("Usar
    // personagem", ver BattleMap.jsx/CharacterSheetService).
    public record AddTokenRequest(Long mapId, String label, String color, double x, double y, String imageUrl) {}

    // tokenId vai no CORPO (nao na URL/destino STOMP) - mesmo padrao ja' usado em
    // ToggleReactionRequest/PinMessageRequest/DeleteChatMessage (MessageDtos.java), em vez de
    // varias {variaveis} num so' destino STOMP (sem precedente no resto do projeto).
    public record MoveTokenRequest(Long tokenId, double x, double y) {}

    // imageUrl: null = nao mexe na imagem atual; "" (string vazia) = REMOVE a imagem (volta pro
    // circulo colorido de sempre); URL = troca pra essa imagem nova (ver MapService.renameToken).
    public record RenameTokenRequest(Long tokenId, String label, String color, String imageUrl) {}

    public record RemoveTokenRequest(Long tokenId) {}

    // Evento ao vivo, transmitido em /topic/channel.{channelId}.map (ver MapWsController/
    // MapController) - "type" decide o que o frontend faz com o payload (ver BattleMap.jsx).
    // MAPS_CHANGED cobre criar/ativar/apagar um mapa (mudanca ESTRUTURAL, rara) - o frontend so'
    // recarrega o snapshot inteiro de novo (GET .../map) em vez de tentar remontar o estado a
    // partir do evento, bem mais simples que ter um payload diferente pra cada uma dessas 3
    // acoes. Os eventos de TOKEN continuam leves/incrementais (isso sim acontece o tempo todo,
    // arrastando ao vivo). Mesmo formato "um record so', campos nulos conforme o tipo" que
    // ChatEvent ja' usa (MessageDtos.java).
    public record MapEvent(String type, MapTokenResponse token, Long tokenId, Double x, Double y) {
        public static MapEvent mapsChanged() {
            return new MapEvent("MAPS_CHANGED", null, null, null, null);
        }
        public static MapEvent tokenAdded(MapTokenResponse token) {
            return new MapEvent("TOKEN_ADDED", token, null, null, null);
        }
        public static MapEvent tokenMoved(Long tokenId, double x, double y) {
            return new MapEvent("TOKEN_MOVED", null, tokenId, x, y);
        }
        public static MapEvent tokenRenamed(MapTokenResponse token) {
            return new MapEvent("TOKEN_RENAMED", token, null, null, null);
        }
        public static MapEvent tokenRemoved(Long tokenId) {
            return new MapEvent("TOKEN_REMOVED", null, tokenId, null, null);
        }
    }
}
