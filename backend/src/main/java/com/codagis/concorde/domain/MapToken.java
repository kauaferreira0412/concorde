package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "map_tokens", indexes = {
        @Index(name = "idx_map_tokens_channel_id", columnList = "channelId"),
        @Index(name = "idx_map_tokens_map_id", columnList = "mapId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MapToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long channelId;

    private Long mapId;

    @Column(nullable = false, length = 40)
    private String label;

    @Column(nullable = false, length = 10)
    private String color;

    @Column(length = 1000)
    private String imageUrl;

    @Column(nullable = false)
    private double x;

    @Column(nullable = false)
    private double y;

    @Column(nullable = false)
    private Long createdBy;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
