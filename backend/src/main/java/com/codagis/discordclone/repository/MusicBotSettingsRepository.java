package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.MusicBotSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MusicBotSettingsRepository extends JpaRepository<MusicBotSettings, Long> {
}
