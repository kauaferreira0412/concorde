package com.codagis.discordclone.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
@Table(name = "channels")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Channel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ChannelType type;

    // So' o admin GLOBAL (Role.ADMIN, ver AdminGuard) pode mandar mensagem aqui - todo mundo
    // continua podendo LER normalmente (ver MessageService.save). Usado pelo canal "Atualizações"
    // seedado automaticamente (ver AnnouncementsChannelBootstrap) - nao e' exposto na criacao
    // manual de canal (CreateChannelRequest nao tem esse campo), so' true nesse canal especifico.
    @Column(nullable = false)
    @ColumnDefault("false")
    @Builder.Default
    private boolean adminOnly = false;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
