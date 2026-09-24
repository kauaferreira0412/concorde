package com.codagis.concorde.controller;

import com.codagis.concorde.dto.MapDtos.BattleMapResponse;
import com.codagis.concorde.dto.MapDtos.MapDetail;
import com.codagis.concorde.dto.MapDtos.MapEvent;
import com.codagis.concorde.dto.MapDtos.MapSnapshot;
import com.codagis.concorde.dto.MapDtos.TokenImageUploadResponse;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.StorageService;
import com.codagis.concorde.service.MapService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/channels")
public class MapController {

    private final MapService mapService;
    private final StorageService storageService;
    private final CurrentUser currentUser;
    private final SimpMessagingTemplate messagingTemplate;

    public MapController(MapService mapService, StorageService storageService, CurrentUser currentUser,
                          SimpMessagingTemplate messagingTemplate) {
        this.mapService = mapService;
        this.storageService = storageService;
        this.currentUser = currentUser;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/{channelId}/map")
    public MapSnapshot getMap(@PathVariable Long channelId) {
        return mapService.getSnapshot(channelId, currentUser.id());
    }

    @GetMapping("/{channelId}/map/{mapId}")
    public MapDetail getMapDetail(@PathVariable Long channelId, @PathVariable Long mapId) {
        return mapService.getMapDetail(channelId, currentUser.id(), mapId);
    }

    @PostMapping(value = "/{channelId}/map/image", consumes = "multipart/form-data")
    public BattleMapResponse uploadMapImage(@PathVariable Long channelId, @RequestParam("file") MultipartFile file,
                                             @RequestParam(value = "name", required = false) String name) {
        String url = storageService.upload(file, "maps/" + channelId);
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

    @PostMapping(value = "/{channelId}/map/token-image", consumes = "multipart/form-data")
    public TokenImageUploadResponse uploadTokenImage(@PathVariable Long channelId, @RequestParam("file") MultipartFile file) {
        mapService.assertCanUploadTokenImage(channelId, currentUser.id());
        String url = storageService.upload(file, "maps/" + channelId + "/tokens");
        return new TokenImageUploadResponse(url);
    }
}
