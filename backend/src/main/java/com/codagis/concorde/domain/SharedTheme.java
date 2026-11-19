package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** Tema publicado na galeria: cores + (opcional) capa e imagem de fundo. */
@Entity
@Table(name = "shared_themes", indexes = {
        @Index(name = "idx_shared_themes_author_id", columnList = "authorId"),
        @Index(name = "idx_shared_themes_created_at", columnList = "createdAt"),
        @Index(name = "idx_shared_themes_uses", columnList = "uses")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SharedTheme {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 40)
    private String name;

    @Column(length = 140)
    private String description;

    /** "light" ou "dark". */
    @Column(nullable = false, length = 5)
    private String base;

    /** Cores sobrescritas do tema base, em JSON ({"accent":"#FF00AA",...}). */
    @Column(nullable = false, length = 2000)
    private String colorsJson;

    @Column(nullable = false)
    private boolean waves;

    @Column(length = 500)
    private String coverUrl;

    @Column(length = 500)
    private String wallpaperUrl;

    /** "chat" ou "app". */
    @Column(length = 4)
    private String wallpaperMode;

    private Integer wallpaperDim;

    private Integer wallpaperBlur;

    private Boolean glassPanels;

    @Column(nullable = false)
    @Builder.Default
    private long uses = 0;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
