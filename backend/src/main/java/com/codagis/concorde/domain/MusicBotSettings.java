package com.codagis.concorde.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "music_bot_settings")
@Getter
@Setter
@NoArgsConstructor
public class MusicBotSettings {

    @Id
    private Long id = 1L;

    private String avatarUrl;
}
