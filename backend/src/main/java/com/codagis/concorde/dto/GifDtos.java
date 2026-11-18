package com.codagis.concorde.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public class GifDtos {

    public record GifItem(String id, String title, String url, String previewUrl, Integer width, Integer height) {}

    public record GifPage(List<GifItem> results, int nextOffset, boolean hasMore) {}

    public record FavoriteGifRequest(
            @NotBlank @Size(max = 1000) String url,
            @Size(max = 1000) String previewUrl,
            Integer width,
            Integer height
    ) {}

    public record FavoriteGifResponse(Long id, String url, String previewUrl, Integer width, Integer height, Instant createdAt) {}
}
