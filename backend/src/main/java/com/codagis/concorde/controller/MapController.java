package com.codagis.concorde.controller;

import com.codagis.concorde.dto.MapDtos.BattleMapResponse;
import com.codagis.concorde.dto.MapDtos.MapEvent;
import com.codagis.concorde.dto.MapDtos.MapSnapshot;
import com.codagis.concorde.dto.MapDtos.TokenImageUploadResponse;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.GcsService;
import com.codagis.concorde.service.MapService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * Mapas de batalha de um canal de voz (kit de RPG - ver MapService/BattleMap.jsx). Criar um
 * mapa/ativar um mapa/apagar um mapa e' REST (upload da imagem precisa passar pelo GcsService) -
 * depois de qualquer uma dessas 3 acoes (mudanca ESTRUTURAL, rara), avisa quem estiver com o
 * mapa aberto via WebSocket com um evento generico "MAPS_CHANGED" (mesmo topico que os tokens
 * usam, ver MapWsController) - o frontend so' recarrega o snapshot inteiro de novo, mais simples
 * que ter um payload diferente pra cada acao.
 */
@RestController
@RequestMapping("/api/channels")
public class MapController {

    private final MapService mapService;
    private final GcsService gcsService;
    private final CurrentUser currentUser;
    private final SimpMessagingTemplate messagingTemplate;

    public MapController(MapService mapService, GcsService gcsService, CurrentUser currentUser,
                          SimpMessagingTemplate messagingTemplate) {
        this.mapService = mapService;
        this.gcsService = gcsService;
        this.currentUser = currentUser;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/{channelId}/map")
    public MapSnapshot getMap(@PathVariable Long channelId) {
        return mapService.getSnapshot(channelId, currentUser.id());
    }

    // "name" opcional (multipart form field) - "Mapa 1", "Mapa 2"... se nao vier, o frontend
    // mostra um nome generico.
    @PostMapping(value = "/{channelId}/map/image", consumes = "multipart/form-data")
    public BattleMapResponse uploadMapImage(@PathVariable Long channelId, @RequestParam("file") MultipartFile file,
                                             @RequestParam(value = "name", required = false) String name) {
        String url = gcsService.upload(file, "maps/" + channelId);
        BattleMapResponse map = mapService.createMap(channelId, currentUser.id(), name, url);
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".map", MapEvent.mapsChanged());
        return map;
    }

    @PutMapping("/{channelId}/map/{mapId}/activate")
    public BattleMapResponse activateMap(@PathVariable Long channelId, @PathVariable Long mapId) {
        BattleMapResponse map = mapService.activateMap(channelId, currentUser.id(), mapId);
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".map", MapEvent.mapsChanged());
        return map;
    }

    @DeleteMapping("/{channelId}/map/{mapId}")
    public void deleteMap(@PathVariable Long channelId, @PathVariable Long mapId) {
        mapService.deleteMap(channelId, currentUser.id(), mapId);
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".map", MapEvent.mapsChanged());
    }

    // Imagem CUSTOMIZADA de um token (retrato do personagem, etc - pedido explicito do
    // usuario) - qualquer jogador com acesso ao mapa pode subir uma pro PROPRIO token (nao
    // precisa ser o mestre, diferente de criar/apagar um mapa). So' devolve a URL - quem chama
    // ainda precisa mandar o evento "renomear token" (ver BattleMap.jsx/MapWsController) com
    // essa URL pra aplicar de fato, mesmo fluxo que trocar o nome/cor.
    @PostMapping(value = "/{channelId}/map/token-image", consumes = "multipart/form-data")
    public TokenImageUploadResponse uploadTokenImage(@PathVariable Long channelId, @RequestParam("file") MultipartFile file) {
        mapService.assertCanUploadTokenImage(channelId, currentUser.id());
        String url = gcsService.upload(file, "maps/" + channelId + "/tokens");
        return new TokenImageUploadResponse(url);
    }
}
