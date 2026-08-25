package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "servers", indexes = {
        @Index(name = "idx_servers_name", columnList = "name"),
        @Index(name = "idx_servers_owner_id", columnList = "ownerId"),
        @Index(name = "idx_servers_icon_url", columnList = "iconUrl"),
        @Index(name = "idx_servers_description", columnList = "description"),
        @Index(name = "idx_servers_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Server {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private Long ownerId;

    private String iconUrl;

    @Column(length = 300)
    private String description;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
