package com.codagis.concorde.controller;

import com.codagis.concorde.domain.SoundboardBotSettings;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.SoundboardBotSettingsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/soundboard-bot")
public class SoundboardBotSettingsController {

    private final SoundboardBotSettingsService service;
    private final CurrentUser currentUser;

    public SoundboardBotSettingsController(SoundboardBotSettingsService service, CurrentUser currentUser) {
        this.service = service;
        this.currentUser = currentUser;
    }

    public record SettingsResponse(String name, String avatarUrl) {}

    @GetMapping("/settings")
    public SettingsResponse settings() {
        SoundboardBotSettings settings = service.get();
        return new SettingsResponse("Batera", settings.getAvatarUrl());
    }

    @PostMapping(value = "/avatar", consumes = "multipart/form-data")
    public SettingsResponse uploadAvatar(@RequestParam("file") MultipartFile file) {
        SoundboardBotSettings settings = service.uploadAvatar(currentUser.id(), file);
        return new SettingsResponse("Batera", settings.getAvatarUrl());
    }
}
