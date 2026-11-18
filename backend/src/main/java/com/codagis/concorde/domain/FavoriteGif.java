package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** GIF que o usuário salvou nos favoritos (aparece na aba "Favoritos" do seletor de GIF). */
@Entity
@Table(name = "favorite_gifs", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"userId", "url"})
}, indexes = {
        @Index(name = "idx_favorite_gifs_user_id", columnList = "userId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FavoriteGif {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 1000)
    private String url;

    @Column(length = 1000)
    private String previewUrl;

    private Integer width;

    private Integer height;

    @Column(nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
