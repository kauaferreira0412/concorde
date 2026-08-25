package com.codagis.concorde.service;

import com.codagis.concorde.domain.SoundboardBotSettings;
import com.codagis.concorde.repository.SoundboardBotSettingsRepository;
import com.codagis.concorde.security.AdminGuard;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class SoundboardBotSettingsService {

    private final SoundboardBotSettingsRepository repository;
    private final GcsService gcsService;
    private final AdminGuard adminGuard;

    public SoundboardBotSettingsService(SoundboardBotSettingsRepository repository, GcsService gcsService, AdminGuard adminGuard) {
        this.repository = repository;
        this.gcsService = gcsService;
        this.adminGuard = adminGuard;
    }

    public SoundboardBotSettings get() {
        return repository.findById(1L).orElseGet(SoundboardBotSettings::new);
    }

    @Transactional
    public SoundboardBotSettings uploadAvatar(Long requesterId, MultipartFile file) {
        adminGuard.assertAdmin(requesterId);
        String url = gcsService.upload(file, "soundboard-bot");
        SoundboardBotSettings settings = repository.findById(1L).orElseGet(SoundboardBotSettings::new);
        settings.setAvatarUrl(url);
        return repository.save(settings);
    }
}
