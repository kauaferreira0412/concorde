package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

// Mensagem de chat PRIVADO - mesma forma da Message de servidor (ver Message.java), so' que
// "channelId" aponta pra um DirectChannel em vez de um Channel, e sem pollId (enquete e' so'
// nos chats de servidor). Entidade separada de proposito (nao reaproveita a tabela messages) -
// assim um id de DM nunca pode ser confundido com o id de uma mensagem de servidor.
@Entity
@Table(name = "direct_messages", indexes = {
        @Index(name = "idx_direct_messages_channel_id", columnList = "channelId"),
        @Index(name = "idx_direct_messages_author_id", columnList = "authorId"),
        @Index(name = "idx_direct_messages_image_url", columnList = "imageUrl"),
        @Index(name = "idx_direct_messages_created_at", columnList = "createdAt"),
        @Index(name = "idx_direct_messages_edited_at", columnList = "editedAt"),
        @Index(name = "idx_direct_messages_reply_to_id", columnList = "replyToId"),
        @Index(name = "idx_direct_messages_roll_notation", columnList = "rollNotation"),
        @Index(name = "idx_direct_messages_roll_sides", columnList = "rollSides"),
        @Index(name = "idx_direct_messages_roll_results_csv", columnList = "rollResultsCsv"),
        @Index(name = "idx_direct_messages_roll_total", columnList = "rollTotal"),
        @Index(name = "idx_direct_messages_pinned", columnList = "pinned"),
        @Index(name = "idx_direct_messages_pinned_at", columnList = "pinnedAt"),
        @Index(name = "idx_direct_messages_file_url", columnList = "fileUrl"),
        @Index(name = "idx_direct_messages_file_name", columnList = "fileName"),
        @Index(name = "idx_direct_messages_file_type", columnList = "fileType"),
        @Index(name = "idx_direct_messages_file_size", columnList = "fileSize")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DirectMessage {

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

    // Anexo generico (video, documento, audio - inclusive mensagem de voz gravada) - mesmo
    // esquema de Message.java (chat de servidor), ver comentario la' pro motivo de ser separado
    // de imageUrl.
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
}
