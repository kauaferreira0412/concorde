package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

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
        @Index(name = "idx_messages_roll_total", columnList = "rollTotal"),
        @Index(name = "idx_messages_pinned", columnList = "pinned"),
        @Index(name = "idx_messages_pinned_at", columnList = "pinnedAt"),
        @Index(name = "idx_messages_poll_id", columnList = "pollId"),
        @Index(name = "idx_messages_file_url", columnList = "fileUrl"),
        @Index(name = "idx_messages_file_name", columnList = "fileName"),
        @Index(name = "idx_messages_file_type", columnList = "fileType"),
        @Index(name = "idx_messages_file_size", columnList = "fileSize")
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

    // Anexo generico (video, documento, audio - inclusive mensagem de voz gravada) - separado de
    // imageUrl de proposito, pra nao mexer no fluxo de imagem que ja' funciona (preview/lightbox).
    // fileName e' o nome ORIGINAL do arquivo (ver GcsService.uploadAttachment), fileType e' o
    // mime type (decide se renderiza <video>/<audio>/card de download, ver DmChatWindow.jsx).
    @Column(length = 1000)
    private String fileUrl;

    @Column(length = 255)
    private String fileName;

    @Column(length = 100)
    private String fileType;

    private Long fileSize;

    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant editedAt;

    private Long replyToId;

    private String rollNotation;
    private Integer rollSides;
    private String rollResultsCsv;
    private Integer rollTotal;

    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean pinned = false;

    private Instant pinnedAt;

    private Long pollId;
}
