package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// A "conversa" entre dois amigos (equivalente a um Channel de servidor, so' que privado e sem
// servidor nenhum por tras) - criada automaticamente quando os dois viram amigos (ver
// FriendshipService.getOrCreateChannel). Sempre userAId < userBId, mesmo padrao de Friendship.
@Entity
@Table(name = "direct_channels", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"userAId", "userBId"})
}, indexes = {
        @Index(name = "idx_direct_channels_user_a_id", columnList = "userAId"),
        @Index(name = "idx_direct_channels_user_b_id", columnList = "userBId"),
        @Index(name = "idx_direct_channels_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DirectChannel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userAId;

    @Column(nullable = false)
    private Long userBId;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
