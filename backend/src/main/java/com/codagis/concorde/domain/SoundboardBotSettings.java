package com.codagis.concorde.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// Foto de perfil do Batera (bot do soundboard) - mesmo padrao do MusicBotSettings (Melodion),
// so' que num registro proprio: uma linha so' (id fixo), global pro app inteiro.
@Entity
@Table(name = "soundboard_bot_settings", indexes = {
        @Index(name = "idx_soundboard_bot_settings_avatar_url", columnList = "avatarUrl")
})
@Getter
@Setter
@NoArgsConstructor
public class SoundboardBotSettings {

    @Id
    private Long id = 1L;

    private String avatarUrl;
}
