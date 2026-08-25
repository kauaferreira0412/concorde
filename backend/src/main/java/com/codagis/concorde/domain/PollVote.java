package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "poll_votes", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"optionId", "userId"})
}, indexes = {
        @Index(name = "idx_poll_votes_poll_id", columnList = "pollId"),
        @Index(name = "idx_poll_votes_option_id", columnList = "optionId"),
        @Index(name = "idx_poll_votes_user_id", columnList = "userId"),
        @Index(name = "idx_poll_votes_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PollVote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long pollId;

    @Column(nullable = false)
    private Long optionId;

    @Column(nullable = false)
    private Long userId;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
