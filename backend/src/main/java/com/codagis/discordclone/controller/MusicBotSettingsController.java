package com.codagis.discordclone.controller;

import com.codagis.discordclone.domain.MusicBotSettings;
import com.codagis.discordclone.security.CurrentUser;
import com.codagis.discordclone.service.MusicBotSettingsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/**
 * Aparencia do bot de musica ("Melodion", ver MusicController/music-bot/index.js). GET e'
 * publico (qualquer membro logado - e' so' pra mostrar o avatar dele igual qualquer
 * participante da call); o upload da foto e' so' do ADMIN (ver MusicBotSettingsService), ja
 * que muda a aparencia dele em QUALQUER servidor/call, nao e' uma coisa "por servidor".
 */
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
