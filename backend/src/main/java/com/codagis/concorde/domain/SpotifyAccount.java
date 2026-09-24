package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "spotify_accounts", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"userId"})
}, indexes = {
        @Index(name = "idx_spotify_accounts_user_id", columnList = "userId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SpotifyAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 512)
    private String accessToken;

    @Column(nullable = false, length = 512)
    private String refreshToken;

    @Column(nullable = false)
    private Instant expiresAt;

    @Builder.Default
    private Instant connectedAt = Instant.now();
}
