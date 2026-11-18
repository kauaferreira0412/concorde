package com.codagis.concorde.service;

import com.codagis.concorde.domain.FavoriteGif;
import com.codagis.concorde.dto.GifDtos.FavoriteGifRequest;
import com.codagis.concorde.dto.GifDtos.FavoriteGifResponse;
import com.codagis.concorde.dto.GifDtos.GifItem;
import com.codagis.concorde.dto.GifDtos.GifPage;
import com.codagis.concorde.repository.FavoriteGifRepository;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@Service
public class GifService {

    private static final int MAX_LIMIT = 50;
    private static final int MAX_FAVORITES = 500;

    private final FavoriteGifRepository favoriteRepository;
    private final RestTemplate restTemplate = new RestTemplate();
    private final String giphyApiKey;

    public GifService(FavoriteGifRepository favoriteRepository,
                      @Value("${app.gifs.giphy-api-key:}") String giphyApiKey) {
        this.favoriteRepository = favoriteRepository;
        this.giphyApiKey = giphyApiKey == null ? "" : giphyApiKey.trim();
    }

    public boolean searchEnabled() {
        return !giphyApiKey.isBlank();
    }

    public GifPage search(String query, int offset, int limit) {
        if (query == null || query.isBlank()) return trending(offset, limit);
        return fetch("search", query.trim(), offset, limit);
    }

    public GifPage trending(int offset, int limit) {
        return fetch("trending", null, offset, limit);
    }

    private GifPage fetch(String endpoint, String query, int offset, int limit) {
        if (!searchEnabled()) {
            throw new IllegalArgumentException("Busca de GIFs não configurada no servidor (falta GIPHY_API_KEY)");
        }
        int safeLimit = Math.max(1, Math.min(MAX_LIMIT, limit));
        int safeOffset = Math.max(0, Math.min(4999, offset));
        UriComponentsBuilder uri = UriComponentsBuilder.fromHttpUrl("https://api.giphy.com/v1/gifs/" + endpoint)
                .queryParam("api_key", giphyApiKey)
                .queryParam("limit", safeLimit)
                .queryParam("offset", safeOffset)
                .queryParam("rating", "pg-13")
                .queryParam("bundle", "messaging_non_clips");
        if (query != null) uri.queryParam("q", query).queryParam("lang", "pt");

        JsonNode body;
        try {
            URI target = uri.encode().build().toUri();
            body = restTemplate.getForObject(target, JsonNode.class);
        } catch (RestClientException ex) {
            throw new IllegalArgumentException("Não deu pra buscar GIFs agora - tenta de novo daqui a pouco");
        }
        List<GifItem> results = new ArrayList<>();
        if (body != null && body.path("data").isArray()) {
            for (JsonNode gif : body.path("data")) {
                JsonNode images = gif.path("images");
                JsonNode original = images.path("original");
                JsonNode preview = images.path("fixed_width");
                String url = original.path("url").asText("");
                if (url.isBlank()) continue;
                String previewUrl = preview.path("webp").asText(preview.path("url").asText(url));
                results.add(new GifItem(
                        gif.path("id").asText(),
                        gif.path("title").asText(""),
                        url,
                        previewUrl,
                        intOrNull(preview.path("width")),
                        intOrNull(preview.path("height"))
                ));
            }
        }
        JsonNode pagination = body == null ? null : body.path("pagination");
        int total = pagination == null ? 0 : pagination.path("total_count").asInt(0);
        int count = pagination == null ? results.size() : pagination.path("count").asInt(results.size());
        int next = safeOffset + count;
        return new GifPage(results, next, count > 0 && next < total);
    }

    private static Integer intOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.asText().isBlank()) return null;
        try {
            return Integer.parseInt(node.asText());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    public List<FavoriteGifResponse> favorites(Long userId) {
        return favoriteRepository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(GifService::toResponse).toList();
    }

    @Transactional
    public FavoriteGifResponse addFavorite(Long userId, FavoriteGifRequest req) {
        String url = req.url().trim();
        if (!url.startsWith("https://")) {
            throw new IllegalArgumentException("Só dá pra favoritar GIFs com link https");
        }
        var existing = favoriteRepository.findByUserIdAndUrl(userId, url);
        if (existing.isPresent()) return toResponse(existing.get());
        if (favoriteRepository.countByUserId(userId) >= MAX_FAVORITES) {
            throw new IllegalArgumentException("Você chegou no limite de " + MAX_FAVORITES + " GIFs favoritos - tira algum antes");
        }
        String preview = req.previewUrl() == null || !req.previewUrl().trim().startsWith("https://")
                ? url
                : req.previewUrl().trim();
        FavoriteGif saved = favoriteRepository.save(FavoriteGif.builder()
                .userId(userId)
                .url(url)
                .previewUrl(preview)
                .width(req.width())
                .height(req.height())
                .build());
        return toResponse(saved);
    }

    @Transactional
    public void removeFavorite(Long userId, Long favoriteId) {
        favoriteRepository.findById(favoriteId)
                .filter(f -> f.getUserId().equals(userId))
                .ifPresent(favoriteRepository::delete);
    }

    private static FavoriteGifResponse toResponse(FavoriteGif f) {
        return new FavoriteGifResponse(f.getId(), f.getUrl(), f.getPreviewUrl(), f.getWidth(), f.getHeight(), f.getCreatedAt());
    }
}
