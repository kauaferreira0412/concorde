package com.codagis.concorde.controller;

import com.codagis.concorde.dto.GifDtos.FavoriteGifRequest;
import com.codagis.concorde.dto.GifDtos.FavoriteGifResponse;
import com.codagis.concorde.dto.GifDtos.GifPage;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.GifService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/gifs")
public class GifController {

    private final GifService gifService;
    private final CurrentUser currentUser;

    public GifController(GifService gifService, CurrentUser currentUser) {
        this.gifService = gifService;
        this.currentUser = currentUser;
    }

    @GetMapping("/status")
    public Map<String, Boolean> status() {
        return Map.of("searchEnabled", gifService.searchEnabled());
    }

    @GetMapping("/search")
    public GifPage search(@RequestParam(defaultValue = "") String q,
                          @RequestParam(defaultValue = "0") int offset,
                          @RequestParam(defaultValue = "30") int limit) {
        return gifService.search(q, offset, limit);
    }

    @GetMapping("/trending")
    public GifPage trending(@RequestParam(defaultValue = "0") int offset,
                            @RequestParam(defaultValue = "30") int limit) {
        return gifService.trending(offset, limit);
    }

    @GetMapping("/favorites")
    public List<FavoriteGifResponse> favorites() {
        return gifService.favorites(currentUser.id());
    }

    @PostMapping("/favorites")
    public FavoriteGifResponse addFavorite(@Valid @RequestBody FavoriteGifRequest req) {
        return gifService.addFavorite(currentUser.id(), req);
    }

    @DeleteMapping("/favorites/{id}")
    public void removeFavorite(@PathVariable Long id) {
        gifService.removeFavorite(currentUser.id(), id);
    }
}
