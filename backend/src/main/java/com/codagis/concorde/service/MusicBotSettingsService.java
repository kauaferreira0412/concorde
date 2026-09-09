package com.codagis.concorde.service;

import com.codagis.concorde.domain.MusicBotSettings;
import com.codagis.concorde.repository.MusicBotSettingsRepository;
import com.codagis.concorde.security.AdminGuard;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MusicBotSettingsService {

    private final MusicBotSettingsRepository repository;
    private final StorageService storageService;
    private final AdminGuard adminGuard;

    public MusicBotSettingsService(MusicBotSettingsRepository repository, StorageService storageService, AdminGuard adminGuard) {
        this.repository = repository;
        this.storageService = storageService;
        this.adminGuard = adminGuard;
    }

    public MusicBotSettings get() {
        return repository.findById(1L).orElseGet(MusicBotSettings::new);
    }

    @Transactional
    public MusicBotSettings uploadAvatar(Long requesterId, MultipartFile file) {
        adminGuard.assertAdmin(requesterId);
        String url = storageService.upload(file, "music-bot");
        MusicBotSettings settings = repository.findById(1L).orElseGet(MusicBotSettings::new);
        settings.setAvatarUrl(url);
        return repository.save(settings);
    }
}
