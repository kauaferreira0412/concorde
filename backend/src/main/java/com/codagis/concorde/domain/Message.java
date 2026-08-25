package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "messages")
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
