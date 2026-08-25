package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "message_reactions", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"messageId", "userId", "emoji"})
}, indexes = {
        @Index(name = "idx_message_reactions_message_id", columnList = "messageId"),
        @Index(name = "idx_message_reactions_user_id", columnList = "userId"),
        @Index(name = "idx_message_reactions_emoji", columnList = "emoji"),
        @Index(name = "idx_message_reactions_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MessageReaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long messageId;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 32)
    private String emoji;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
