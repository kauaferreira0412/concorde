package com.codagis.concorde.dto;

import java.time.Instant;
import java.util.Map;

public class SharedThemeDtos {

    public record SharedThemeResponse(Long id, String name, String description, String base, Map<String, String> colors,
                                      boolean waves, String coverUrl, String wallpaperUrl, String wallpaperMode,
                                      Integer wallpaperDim, Integer wallpaperBlur, Boolean glassPanels, long uses,
                                      Instant createdAt, Long authorId, String authorUsername, String authorAvatarUrl,
                                      boolean canDelete) {}

    /** Vem como JSON no campo "data" do multipart. */
    public record SharedThemeRequest(String name, String description, String base, Map<String, String> colors,
                                     Boolean waves, String wallpaperMode, Integer wallpaperDim, Integer wallpaperBlur,
                                     Boolean glassPanels) {}
}
