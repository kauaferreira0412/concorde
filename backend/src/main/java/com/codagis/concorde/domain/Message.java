package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "messages", indexes = {
        @Index(name = "idx_messages_channel_id", columnList = "channelId"),
        @Index(name = "idx_messages_author_id", columnList = "authorId"),
        @Index(name = "idx_messages_image_url", columnList = "imageUrl"),
        @Index(name = "idx_messages_created_at", columnList = "createdAt"),
        @Index(name = "idx_messages_edited_at", columnList = "editedAt"),
        @Index(name = "idx_messages_reply_to_id", columnList = "replyToId"),
        @Index(name = "idx_messages_roll_notation", columnList = "rollNotation"),
        @Index(name = "idx_messages_roll_sides", columnList = "rollSides"),
        @Index(name = "idx_messages_roll_results_csv", columnList = "rollResultsCsv"),
        @Index(name = "idx_messages_roll_total", columnList = "rollTotal")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long channelId;

    @Column(nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 4000)
    private String content;

    @Column(length = 1000)
    private String imageUrl;

    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant editedAt;

    private Long replyToId;

    private String rollNotation;
    private Integer rollSides;
    private String rollResultsCsv;
    private Integer rollTotal;
}
