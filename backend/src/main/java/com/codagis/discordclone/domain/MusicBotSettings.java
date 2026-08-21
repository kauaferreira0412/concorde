package com.codagis.discordclone.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Configuracao do bot de musica ("Melodion", ver MusicController/music-bot/index.js) - so'
 * existe UMA linha (id fixo = 1), nao e' por servidor nem por canal, e' a aparencia dele em
 * QUALQUER call. Hoje so' guarda a foto de perfil (ver MusicBotSettingsController), mas ja fica
 * numa entidade separada em vez de gambiarra em outro lugar, pra dar pra crescer depois.
 */
@Entity
@Table(name = "music_bot_settings")
public class MusicBotSettings {

    @Id
    private Long id = 1L;

    private String avatarUrl;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }
}
