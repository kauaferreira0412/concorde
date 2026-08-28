package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Conta do Spotify que um usuario CONECTOU ao Concorde (opcional, ver SpotifyService/
// SettingsModal.jsx "Conectar Spotify") - sem FK (mesmo padrao do resto do projeto), so' o
// userId. accessToken/refreshToken vem do fluxo OAuth "Authorization Code" do Spotify (ver
// SpotifyService.handleCallback); accessToken expira sozinho (expiresAt, normalmente 1h) e e'
// renovado na hora usando refreshToken (esse nao expira, so' se o usuario revogar o acesso pelo
// proprio Spotify). Uma linha por usuario (userId unico) - conectar de novo so' SOBRESCREVE a
// linha existente.
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
