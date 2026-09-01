package com.codagis.concorde.controller;

import com.codagis.concorde.dto.MapDtos.BattleMapResponse;
import com.codagis.concorde.dto.MapDtos.MapEvent;
import com.codagis.concorde.dto.MapDtos.MapSnapshot;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.GcsService;
import com.codagis.concorde.service.MapService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * Mapa de batalha de um canal de voz (kit de RPG - ver MapService/BattleMap.jsx). Upload da
 * imagem e' REST (multipart, precisa passar pelo GcsService) - depois de salvar, avisa quem
 * estiver com o mapa aberto via WebSocket (mesmo topico que os tokens usam, ver
 * MapWsController), sem precisar dar F5/reabrir pra ver o mapa novo.
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

    @PostMapping(value = "/{channelId}/map/image", consumes = "multipart/form-data")
    public BattleMapResponse uploadMapImage(@PathVariable Long channelId, @RequestParam("file") MultipartFile file) {
        String url = gcsService.upload(file, "maps/" + channelId);
        BattleMapResponse map = mapService.uploadMap(channelId, currentUser.id(), url);
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".map", MapEvent.uploaded(map));
        return map;
    }
}
