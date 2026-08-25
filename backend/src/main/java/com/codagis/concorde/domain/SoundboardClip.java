package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "soundboard_clips", indexes = {
        @Index(name = "idx_soundboard_clips_user_id", columnList = "userId"),
        @Index(name = "idx_soundboard_clips_name", columnList = "name"),
        @Index(name = "idx_soundboard_clips_file_url", columnList = "fileUrl"),
        @Index(name = "idx_soundboard_clips_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SoundboardClip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(nullable = false, length = 500)
    private String fileUrl;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
