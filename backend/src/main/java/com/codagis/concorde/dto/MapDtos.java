package com.codagis.concorde.dto;

import java.time.Instant;
import java.util.List;

public class MapDtos {

    public record BattleMapResponse(Long id, Long channelId, String name, String imageUrl, boolean active, Instant createdAt) {}

    public record MapTokenResponse(Long id, Long mapId, String label, String color, double x, double y, String imageUrl) {}

    public record TokenImageUploadResponse(String url) {}

    public record MapSnapshot(List<BattleMapResponse> maps, Long activeMapId, List<MapTokenResponse> tokens, boolean canManageMap) {}

    public record MapDetail(BattleMapResponse map, List<MapTokenResponse> tokens) {}

    public record AddTokenRequest(Long mapId, String label, String color, double x, double y, String imageUrl) {}

    public record MoveTokenRequest(Long tokenId, double x, double y) {}

    public record RenameTokenRequest(Long tokenId, String label, String color, String imageUrl) {}

    public record RemoveTokenRequest(Long tokenId) {}

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
