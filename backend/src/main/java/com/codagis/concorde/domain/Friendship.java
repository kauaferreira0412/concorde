package com.codagis.concorde.domain;

import com.codagis.concorde.enums.FriendshipStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "friendships", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"userAId", "userBId"})
}, indexes = {
        @Index(name = "idx_friendships_user_a_id", columnList = "userAId"),
        @Index(name = "idx_friendships_user_b_id", columnList = "userBId"),
        @Index(name = "idx_friendships_status", columnList = "status"),
        @Index(name = "idx_friendships_requested_by", columnList = "requestedBy"),
        @Index(name = "idx_friendships_blocked_by", columnList = "blockedBy"),
        @Index(name = "idx_friendships_previous_status", columnList = "previousStatus"),
        @Index(name = "idx_friendships_created_at", columnList = "createdAt"),
        @Index(name = "idx_friendships_responded_at", columnList = "respondedAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userAId;

    @Column(nullable = false)
    private Long userBId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private FriendshipStatus status;

    @Column(nullable = false)
    private Long requestedBy;

    private Long blockedBy;

    @Enumerated(EnumType.STRING)
    @Column(length = 10)
    private FriendshipStatus previousStatus;

    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant respondedAt;
}
