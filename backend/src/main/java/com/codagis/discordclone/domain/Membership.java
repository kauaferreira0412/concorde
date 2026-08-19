package com.codagis.discordclone.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

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

    /** Perfis (ServerRole) atribuidos a esse membro NESSE servidor - a uniao das permissoes
     * de todos eles e' o que ele pode fazer (ver PermissionService). */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "membership_roles", joinColumns = @JoinColumn(name = "membership_id"))
    @Column(name = "role_id")
    @Builder.Default
    private Set<Long> roleIds = new HashSet<>();

    @Builder.Default
    private Instant joinedAt = Instant.now();
}
