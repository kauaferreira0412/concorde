package com.codagis.concorde.domain;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.UserStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.ColumnDefault;

import java.time.Instant;

@Entity
@Table(name = "users", uniqueConstraints = {
        @UniqueConstraint(columnNames = "username"),
        @UniqueConstraint(columnNames = "email")
}, indexes = {
        @Index(name = "idx_users_password_hash", columnList = "passwordHash"),
        @Index(name = "idx_users_avatar_url", columnList = "avatarUrl"),
        @Index(name = "idx_users_nickname", columnList = "nickname"),
        @Index(name = "idx_users_bio", columnList = "bio"),
        @Index(name = "idx_users_role", columnList = "role"),
        @Index(name = "idx_users_status", columnList = "status"),
        @Index(name = "idx_users_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 32)
    private String username;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String passwordHash;

    private String avatarUrl;

    /** Imagem de capa do perfil (opcional). */
    private String bannerUrl;

    /** Status personalizado curto ("jogando TCG", "mestrando às 21h"). */
    @Column(length = 80)
    private String customStatus;

    /** Cor de destaque do perfil (#RRGGBB): tinge o card e o nome no chat. */
    @Column(length = 7)
    private String accentColor;

    /** Segunda cor do perfil (#RRGGBB): com ela, o card e o nome viram um gradiente. */
    @Column(length = 7)
    private String accentColor2;

    /** Cores próprias do card de perfil em JSON (fundo, caixas, textos, destaque...). */
    @Column(length = 500)
    private String cardColors;

    /** Blocos do "Sobre mim" (links, jogos, música do momento) em JSON. */
    @Column(length = 6000)
    private String aboutBlocks;

    /** Ordem pessoal dos servidores na barra lateral (ids separados por vírgula). */
    @Column(length = 2000)
    private String serverOrder;

    /** Na call, a foto (GIF) só se mexe enquanto a pessoa fala. */
    private Boolean avatarAnimateOnSpeak;

    public boolean isAvatarAnimateOnSpeakEnabled() {
        return Boolean.TRUE.equals(avatarAnimateOnSpeak);
    }

    @Column(length = 32)
    private String nickname;

    @Column(length = 190)
    private String bio;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private Role role = Role.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @ColumnDefault("'ONLINE'")
    @Builder.Default
    private UserStatus status = UserStatus.ONLINE;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
