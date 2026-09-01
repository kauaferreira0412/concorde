package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// O mapa de batalha ATUAL de um canal de VOZ (kit de RPG, ver MapService/BattleMap.jsx) - uma
// linha por canal (channelId unico), subir um mapa novo so' SOBRESCREVE o imageUrl (os tokens
// continuam ali, o mestre pode reposicionar por cima do mapa novo). Sem FK (mesmo padrao do
// resto do projeto).
@Entity
@Table(name = "battle_maps", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"channelId"})
}, indexes = {
        @Index(name = "idx_battle_maps_channel_id", columnList = "channelId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BattleMap {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long channelId;

    @Column(nullable = false, length = 1000)
    private String imageUrl;

    @Builder.Default
    private Instant updatedAt = Instant.now();
}
