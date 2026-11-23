package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** Conta Steam vinculada a um usuário (SteamID64 comprovado pelo login oficial da Steam). */
@Entity
@Table(name = "steam_accounts", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"userId"}),
        @UniqueConstraint(columnNames = {"steamId"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SteamAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 20)
    private String steamId;

    @Builder.Default
    private Instant connectedAt = Instant.now();
}
