package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(columnNames = "username"),
        @UniqueConstraint(columnNames = "email")
}, indexes = {
        @Index(name = "idx_users_password_hash", columnList = "passwordHash"),
        @Index(name = "idx_users_avatar_url", columnList = "avatarUrl"),
        @Index(name = "idx_users_nickname", columnList = "nickname"),
        @Index(name = "idx_users_bio", columnList = "bio"),
        @Index(name = "idx_users_role", columnList = "role"),
        @Index(name = "idx_users_status", columnList = "status"),
        @Index(name = "idx_users_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String username;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    private String avatarUrl;

    @Column(length = 32)
    private String nickname;

    @Column(length = 190)
    private String bio;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private Role role = Role.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @ColumnDefault("'ONLINE'")
    @Builder.Default
    private UserStatus status = UserStatus.ONLINE;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
