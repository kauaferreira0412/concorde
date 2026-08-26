package com.codagis.concorde.domain;

import com.codagis.concorde.enums.FriendshipStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Amizade entre dois usuarios - sem FK (mesmo padrao do resto do projeto), so' os ids. Sempre
// gravado com userAId < userBId (normalizado no FriendshipService), pra nunca existir duas
// linhas pro mesmo par (A,B) e (B,A) ao mesmo tempo. PENDING = pedido enviado, ainda nao
// respondido; ACCEPTED = amigos de verdade (e' o que libera o chat privado, ver DirectChannel).
// Recusar/desfazer amizade so' APAGA a linha - nao existe um status "DECLINED" separado.
@Entity
@Table(name = "friendships", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"userAId", "userBId"})
}, indexes = {
        @Index(name = "idx_friendships_user_a_id", columnList = "userAId"),
        @Index(name = "idx_friendships_user_b_id", columnList = "userBId"),
        @Index(name = "idx_friendships_status", columnList = "status"),
        @Index(name = "idx_friendships_requested_by", columnList = "requestedBy"),
        @Index(name = "idx_friendships_created_at", columnList = "createdAt"),
        @Index(name = "idx_friendships_responded_at", columnList = "respondedAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userAId;

    @Column(nullable = false)
    private Long userBId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private FriendshipStatus status;

    @Column(nullable = false)
    private Long requestedBy;

    @Builder.Default
    private Instant createdAt = Instant.now();

    private Instant respondedAt;
}
