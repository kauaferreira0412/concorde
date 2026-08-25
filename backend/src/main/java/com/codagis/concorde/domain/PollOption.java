package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "poll_options", indexes = {
        @Index(name = "idx_poll_options_poll_id", columnList = "pollId"),
        @Index(name = "idx_poll_options_text", columnList = "text"),
        @Index(name = "idx_poll_options_position", columnList = "position")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PollOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long pollId;

    @Column(nullable = false, length = 100)
    private String text;

    @Column(nullable = false)
    private int position;
}
