package com.codagis.concorde.domain;

import com.codagis.concorde.enums.ServerPermission;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "server_roles", indexes = {
        @Index(name = "idx_server_roles_server_id", columnList = "serverId"),
        @Index(name = "idx_server_roles_name", columnList = "name"),
        @Index(name = "idx_server_roles_color", columnList = "color"),
        @Index(name = "idx_server_roles_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ServerRole {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false, length = 32)
    private String name;

    @Column(length = 7)
    private String color;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "server_role_permissions", joinColumns = @JoinColumn(name = "role_id"), indexes = {
            @Index(name = "idx_server_role_permissions_role_id", columnList = "role_id"),
            @Index(name = "idx_server_role_permissions_permission", columnList = "permission")
    })
    @Enumerated(EnumType.STRING)
    @Column(name = "permission", length = 20)
    @Builder.Default
    private Set<ServerPermission> permissions = new HashSet<>();

    @Builder.Default
    private Instant createdAt = Instant.now();
}
