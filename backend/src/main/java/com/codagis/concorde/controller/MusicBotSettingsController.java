package com.codagis.concorde.controller;

import com.codagis.concorde.domain.MusicBotSettings;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.MusicBotSettingsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/music-bot")
public class MusicBotSettingsController {

    private final MusicBotSettingsService service;
    private final CurrentUser currentUser;

    public MusicBotSettingsController(MusicBotSettingsService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    public record SettingsResponse(String name, String avatarUrl) {}

    @GetMapping("/settings")
    public SettingsResponse settings() {
        MusicBotSettings settings = service.get();
        return new SettingsResponse("Melodion", settings.getAvatarUrl());
    }

    @PostMapping(value = "/avatar", consumes = "multipart/form-data")
    public SettingsResponse uploadAvatar(@RequestParam("file") MultipartFile file) {
        MusicBotSettings settings = service.uploadAvatar(currentUser.id(), file);
        return new SettingsResponse("Melodion", settings.getAvatarUrl());
    }
}
