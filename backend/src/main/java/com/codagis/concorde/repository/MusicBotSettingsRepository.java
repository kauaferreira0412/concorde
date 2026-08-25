package com.codagis.concorde.repository;

import com.codagis.concorde.domain.MusicBotSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MusicBotSettingsRepository extends JpaRepository<MusicBotSettings, Long> {
}
