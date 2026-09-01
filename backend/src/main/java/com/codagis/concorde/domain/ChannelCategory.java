package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "channel_categories", indexes = {
        @Index(name = "idx_channel_categories_server_id", columnList = "serverId"),
        @Index(name = "idx_channel_categories_name", columnList = "name"),
        @Index(name = "idx_channel_categories_position", columnList = "position"),
        @Index(name = "idx_channel_categories_created_at", columnList = "createdAt"),
        @Index(name = "idx_channel_categories_created_by", columnList = "createdBy")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChannelCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private int position = 0;

    // Quem CRIOU a categoria - o "mestre" dela, pedido explicito do usuario: so' quem criou a
    // categoria de um RPG pode subir o mapa de batalha dos canais de voz dentro dela (ver
    // MapService.assertCanManageMap). Sem "nullable = false" de proposito - categoria criada
    // ANTES dessa coluna existir fica com isso null (nao da' pra saber quem criou uma coisa que
    // ja' existia), e nesse caso o upload de mapa cai pro fallback (MANAGE_CHANNELS).
    private Long createdBy;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
