package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
@Table(name = "polls", indexes = {
        @Index(name = "idx_polls_question", columnList = "question"),
        @Index(name = "idx_polls_created_by", columnList = "createdBy"),
        @Index(name = "idx_polls_created_at", columnList = "createdAt"),
        @Index(name = "idx_polls_multiple_choice", columnList = "multipleChoice")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Poll {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String question;

    @Column(nullable = false)
    private Long createdBy;

    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean multipleChoice = false;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
