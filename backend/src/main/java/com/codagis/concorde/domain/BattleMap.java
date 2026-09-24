package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

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
