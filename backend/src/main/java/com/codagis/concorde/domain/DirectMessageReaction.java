package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Reacao numa DirectMessage - mesma forma da MessageReaction de servidor (ver
// MessageReaction.java), entidade separada pelo mesmo motivo de DirectMessage: um messageId de
// DM nunca deve poder ser confundido com um messageId de servidor na hora de agrupar reacoes.
@Entity
@Table(name = "direct_message_reactions", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"messageId", "userId", "emoji"})
}, indexes = {
        @Index(name = "idx_direct_message_reactions_message_id", columnList = "messageId"),
        @Index(name = "idx_direct_message_reactions_user_id", columnList = "userId"),
        @Index(name = "idx_direct_message_reactions_emoji", columnList = "emoji"),
        @Index(name = "idx_direct_message_reactions_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DirectMessageReaction {

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
