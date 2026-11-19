package com.codagis.concorde.controller;

import com.codagis.concorde.domain.SharedTheme;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.SharedThemeDtos.SharedThemeRequest;
import com.codagis.concorde.dto.SharedThemeDtos.SharedThemeResponse;
import com.codagis.concorde.enums.Role;
import com.codagis.concorde.repository.SharedThemeRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.StorageService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Galeria de temas: qualquer usuário publica o seu e qualquer um aplica. */
@RestController
@RequestMapping("/api/themes")
public class SharedThemeController {

    private static final int MAX_PER_USER = 20;
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern KEY = Pattern.compile("^[a-zA-Z0-9]{1,24}$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final SharedThemeRepository themeRepository;
    private final UserRepository userRepository;
    private final StorageService storageService;
    private final CurrentUser currentUser;

    public SharedThemeController(SharedThemeRepository themeRepository, UserRepository userRepository,
                                 StorageService storageService, CurrentUser currentUser) {
        this.themeRepository = themeRepository;
        this.userRepository = userRepository;
        this.storageService = storageService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<SharedThemeResponse> list(@RequestParam(defaultValue = "popular") String sort,
                                          @RequestParam(required = false) String q) {
        List<SharedTheme> themes = "recent".equals(sort)
                ? themeRepository.findTop200ByOrderByCreatedAtDesc()
                : themeRepository.findTop200ByOrderByUsesDescCreatedAtDesc();
        Map<Long, User> authors = userRepository.findAllById(
                        themes.stream().map(SharedTheme::getAuthorId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        User me = userRepository.findById(currentUser.id()).orElse(null);
        return themes.stream()
                .filter(t -> needle.isEmpty() || matches(t, authors.get(t.getAuthorId()), needle))
                .map(t -> toResponse(t, authors.get(t.getAuthorId()), me))
                .toList();
    }

    @PostMapping(consumes = "multipart/form-data")
    @Transactional
    public SharedThemeResponse publish(@RequestParam("data") String data,
                                       @RequestParam(value = "cover", required = false) MultipartFile cover) {
        Long userId = currentUser.id();
        User me = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        if (themeRepository.countByAuthorId(userId) >= MAX_PER_USER) {
            throw new IllegalArgumentException("Você já publicou " + MAX_PER_USER + " temas - apague algum pra publicar outro");
        }
        SharedThemeRequest req;
        try {
            req = JSON.readValue(data, SharedThemeRequest.class);
        } catch (Exception e) {
            throw new IllegalArgumentException("Dados do tema inválidos");
        }
        String name = trim(req.name());
        if (name == null) throw new IllegalArgumentException("Dê um nome pro tema");
        if (name.length() > 40) throw new IllegalArgumentException("Nome muito longo (máx. 40)");
        String description = trim(req.description());
        if (description != null && description.length() > 140) throw new IllegalArgumentException("Descrição muito longa (máx. 140)");
        String base = "light".equals(req.base()) ? "light" : "dark";

        SharedTheme theme = SharedTheme.builder()
                .authorId(userId)
                .name(name)
                .description(description)
                .base(base)
                .colorsJson(colorsJson(req.colors()))
                .waves(Boolean.TRUE.equals(req.waves()))
                .wallpaperMode("app".equals(req.wallpaperMode()) ? "app" : "chat")
                .wallpaperDim(clamp(req.wallpaperDim(), 0, 90, 55))
                .wallpaperBlur(clamp(req.wallpaperBlur(), 0, 20, 0))
                .glassPanels(Boolean.TRUE.equals(req.glassPanels()))
                .build();
        if (cover != null && !cover.isEmpty()) {
            theme.setCoverUrl(storageService.upload(cover, "theme-covers/" + userId));
        }
        themeRepository.save(theme);
        return toResponse(theme, me, me);
    }

    /** A imagem de fundo sobe separada (cada envio tem limite de tamanho). */
    @PostMapping(value = "/{id}/wallpaper", consumes = "multipart/form-data")
    @Transactional
    public SharedThemeResponse uploadWallpaper(@PathVariable Long id, @RequestParam("file") MultipartFile file) {
        Long userId = currentUser.id();
        SharedTheme theme = themeRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Tema não encontrado"));
        if (!theme.getAuthorId().equals(userId)) throw new IllegalArgumentException("Esse tema não é seu");
        theme.setWallpaperUrl(storageService.upload(file, "theme-wallpapers/" + userId));
        themeRepository.save(theme);
        User me = userRepository.findById(userId).orElse(null);
        return toResponse(theme, me, me);
    }

    @PostMapping("/{id}/use")
    @Transactional
    public void markUsed(@PathVariable Long id) {
        themeRepository.incrementUses(id);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id) {
        User me = userRepository.findById(currentUser.id()).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        SharedTheme theme = themeRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Tema não encontrado"));
        if (!canDelete(theme, me)) throw new IllegalArgumentException("Só quem publicou (ou um admin) pode apagar esse tema");
        themeRepository.delete(theme);
    }

    private boolean matches(SharedTheme t, User author, String needle) {
        return t.getName().toLowerCase(Locale.ROOT).contains(needle)
                || (t.getDescription() != null && t.getDescription().toLowerCase(Locale.ROOT).contains(needle))
                || (author != null && author.getUsername().toLowerCase(Locale.ROOT).contains(needle));
    }

    private boolean canDelete(SharedTheme t, User me) {
        return me != null && (t.getAuthorId().equals(me.getId()) || me.getRole() == Role.ADMIN);
    }

    private SharedThemeResponse toResponse(SharedTheme t, User author, User me) {
        Map<String, String> colors;
        try {
            colors = JSON.readValue(t.getColorsJson(), new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            colors = Map.of();
        }
        return new SharedThemeResponse(t.getId(), t.getName(), t.getDescription(), t.getBase(), colors, t.isWaves(),
                t.getCoverUrl(), t.getWallpaperUrl(), t.getWallpaperMode(), t.getWallpaperDim(), t.getWallpaperBlur(),
                t.getGlassPanels(), t.getUses(), t.getCreatedAt(), t.getAuthorId(),
                author != null ? (author.getNickname() != null ? author.getNickname() : author.getUsername()) : "alguém",
                author != null ? author.getAvatarUrl() : null, canDelete(t, me));
    }

    private static String colorsJson(Map<String, String> colors) {
        Map<String, String> clean = new LinkedHashMap<>();
        if (colors != null) {
            if (colors.size() > 40) throw new IllegalArgumentException("Cores demais no tema");
            colors.forEach((k, v) -> {
                if (k != null && v != null && KEY.matcher(k).matches() && HEX.matcher(v).matches()) {
                    clean.put(k, v.toUpperCase(Locale.ROOT));
                }
            });
        }
        try {
            return JSON.writeValueAsString(clean);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static int clamp(Integer v, int min, int max, int fallback) {
        return v == null ? fallback : Math.max(min, Math.min(max, v));
    }

    private static String trim(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
