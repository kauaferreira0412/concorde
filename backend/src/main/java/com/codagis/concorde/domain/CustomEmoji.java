package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "custom_emojis", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"serverId", "name"})
}, indexes = {
        @Index(name = "idx_custom_emojis_server_id", columnList = "serverId"),
        @Index(name = "idx_custom_emojis_name", columnList = "name"),
        @Index(name = "idx_custom_emojis_image_url", columnList = "imageUrl"),
        @Index(name = "idx_custom_emojis_created_by", columnList = "createdBy"),
        @Index(name = "idx_custom_emojis_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomEmoji {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false, length = 30)
    private String name;

    @Column(nullable = false, length = 500)
    private String imageUrl;

    @Column(nullable = false)
    private Long createdBy;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
