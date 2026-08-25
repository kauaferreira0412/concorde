package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "channel_categories", indexes = {
        @Index(name = "idx_channel_categories_server_id", columnList = "serverId"),
        @Index(name = "idx_channel_categories_name", columnList = "name"),
        @Index(name = "idx_channel_categories_position", columnList = "position"),
        @Index(name = "idx_channel_categories_created_at", columnList = "createdAt")
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

    @Builder.Default
    private Instant createdAt = Instant.now();
}
