package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Configuração do terminal da VPS (uma linha só).
 *
 * A senha nunca é guardada: ela só serve pra derivar (PBKDF2) a chave AES que criptografa a chave
 * SSH privada do Concorde. Sem a senha, o que está no banco não abre nada.
 */
@Entity
@Table(name = "terminal_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TerminalConfig {

    @Id
    private Long id;

    @Column(nullable = false, length = 255)
    private String sshHost;

    @Column(nullable = false)
    private int sshPort;

    @Column(nullable = false, length = 64)
    private String sshUser;

    /** Chave pública instalada no authorized_keys da VPS (formato OpenSSH). */
    @Column(nullable = false, columnDefinition = "text")
    private String publicKey;

    /** Chave privada criptografada com AES-GCM (base64). */
    @Column(nullable = false, columnDefinition = "text")
    private String encryptedPrivateKey;

    @Column(nullable = false, length = 64)
    private String salt;

    @Column(nullable = false, length = 64)
    private String iv;

    /** Chave do servidor SSH vista na configuração (protege contra alguém se passar pela VPS). */
    @Column(nullable = false, length = 32)
    private String hostKeyType;

    @Column(nullable = false, columnDefinition = "text")
    private String hostKey;

    @Column(nullable = false, length = 128)
    private String hostKeyFingerprint;

    private Instant configuredAt;

    private Long configuredByUserId;
}
