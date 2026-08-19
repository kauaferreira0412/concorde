package com.codagis.discordclone.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

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

    /** Mutado/ensurdecido a força NESSE servidor por um moderador (ver ServerPermission.
     * MUTE_MEMBERS/DEAFEN_MEMBERS) - diferente do mic/deafen "normais" (esses sao efemeros,
     * por sessao de call, ver VoicePresenceService). Isso aqui e' GRAVADO: continua valendo
     * mesmo se a pessoa sair da call e entrar de novo, ate' alguem com permissao tirar -
     * pedido explicito do usuario ("ele deve sair e entrar e o efeito deve ficar do mesmo
     * jeito"). Ensurdecer a força tambem seta forceMuted=true junto (ver
     * VoiceModerationController) - a pessoa nao fala nem ouve enquanto isso estiver ligado.
     * @ColumnDefault e' essencial aqui pelo mesmo motivo de User.status: a tabela ja tem
     * linhas em producao, Postgres nao aceita ALTER TABLE ADD COLUMN NOT NULL sem um DEFAULT. */
    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean forceMuted = false;

    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean forceDeafened = false;

    @Builder.Default
    private Instant joinedAt = Instant.now();
}
