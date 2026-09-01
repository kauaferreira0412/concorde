package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Um mapa de batalha de um canal de VOZ (kit de RPG, ver MapService/BattleMap.jsx). Um canal
// pode ter VARIOS mapas agora (mapa 1, mapa 2...) - pedido explicito do usuario: "o mestre deve
// ter a opcao de adicionar varios mapas". "active" marca qual desses mapas esta' sendo mostrado
// pra todo mundo agora (so' um por canal deveria estar true por vez - garantido no MapService,
// nao no banco). Boolean (nao "boolean" primitivo) e sem "nullable = false" de proposito -
// coluna nova, evita o problema de sempre com ddl-auto:update e NOT NULL em tabela que ja' tem
// dados (ver MapToken.imageUrl). Sem FK (mesmo padrao do resto do projeto).
@Entity
@Table(name = "battle_maps", indexes = {
        @Index(name = "idx_battle_maps_channel_id", columnList = "channelId"),
        @Index(name = "idx_battle_maps_active", columnList = "active")
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

    @Column(length = 60)
    private String name;

    @Column(nullable = false, length = 1000)
    private String imageUrl;

    private Boolean active;

    private Long createdBy;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
