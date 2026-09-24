package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "character_sheets", indexes = {
        @Index(name = "idx_character_sheets_category_id", columnList = "categoryId"),
        @Index(name = "idx_character_sheets_server_id", columnList = "serverId"),
        @Index(name = "idx_character_sheets_owner_user_id", columnList = "ownerUserId"),
        @Index(name = "idx_character_sheets_linked_user_id", columnList = "linkedUserId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CharacterSheet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column
    private Long categoryId;

    private Long serverId;

    @Column(nullable = false)
    private Long ownerUserId;

    private Long linkedUserId;

    @Column(nullable = false, length = 60)
    private String characterName;

    @Column(length = 1000)
    private String imageUrl;

    @Column(length = 1000)
    private String fileUrl;

    @Column(length = 255)
    private String fileName;

    private Long fileSize;

    @Builder.Default
    private Instant uploadedAt = Instant.now();
}
