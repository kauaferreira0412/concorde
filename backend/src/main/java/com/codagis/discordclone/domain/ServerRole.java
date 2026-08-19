package com.codagis.discordclone.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

/**
 * Um "Perfil" (nome que o usuario ve na UI) - um pacote nomeado de permissoes (ver
 * ServerPermission), especifico de UM servidor, atribuivel a qualquer membro desse servidor
 * (ver Membership.roleIds). Quem tem a permissao MANAGE_ROLES nesse servidor pode criar/
 * editar/apagar perfis e decidir quem tem qual - nao precisa ser o dono/ADMIN.
 */
@Entity
@Table(name = "server_roles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ServerRole {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false, length = 32)
    private String name;

    /** Cor em hex (#rrggbb) so' pra diferenciar visualmente na UI - opcional. */
    @Column(length = 7)
    private String color;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "server_role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "permission", length = 20)
    @Builder.Default
    private Set<ServerPermission> permissions = new HashSet<>();

    @Builder.Default
    private Instant createdAt = Instant.now();
}
