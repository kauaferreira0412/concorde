package com.codagis.discordclone.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "memberships", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"serverId", "userId"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Membership {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false)
    private Long userId;

    /** Apelido SO' desse servidor - se preenchido, sobrepoe o apelido/username global pra
     * quem estiver vendo esse usuario dentro desse servidor especifico (lista de membros -
     * ver MemberResponse). Independente do "Apelido" global do usuario (User.nickname). */
    @Column(length = 32)
    private String nickname;

    @Builder.Default
    private Instant joinedAt = Instant.now();
}
