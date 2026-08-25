package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "memberships", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"serverId", "userId"})
}, indexes = {
        @Index(name = "idx_memberships_server_id", columnList = "serverId"),
        @Index(name = "idx_memberships_user_id", columnList = "userId"),
        @Index(name = "idx_memberships_nickname", columnList = "nickname"),
        @Index(name = "idx_memberships_force_muted", columnList = "forceMuted"),
        @Index(name = "idx_memberships_force_deafened", columnList = "forceDeafened"),
        @Index(name = "idx_memberships_joined_at", columnList = "joinedAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Membership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false)
    private Long userId;

    @Column(length = 32)
    private String nickname;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "membership_roles", joinColumns = @JoinColumn(name = "membership_id"), indexes = {
            @Index(name = "idx_membership_roles_membership_id", columnList = "membership_id"),
            @Index(name = "idx_membership_roles_role_id", columnList = "role_id")
    })
    @Column(name = "role_id")
    @Builder.Default
    private Set<Long> roleIds = new HashSet<>();

    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean forceMuted = false;

    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean forceDeafened = false;

    @Builder.Default
    private Instant joinedAt = Instant.now();
}
