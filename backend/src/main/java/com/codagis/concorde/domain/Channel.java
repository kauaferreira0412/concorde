package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
@Table(name = "channels", indexes = {
        @Index(name = "idx_channels_server_id", columnList = "serverId"),
        @Index(name = "idx_channels_name", columnList = "name"),
        @Index(name = "idx_channels_type", columnList = "type"),
        @Index(name = "idx_channels_admin_only", columnList = "adminOnly"),
        @Index(name = "idx_channels_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Channel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ChannelType type;

    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean adminOnly = false;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
