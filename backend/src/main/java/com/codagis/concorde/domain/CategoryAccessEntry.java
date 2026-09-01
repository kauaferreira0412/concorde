package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

// Uma linha = "esse usuario PODE ver essa categoria" (ver ServerService.setCategoryAccess/
// canAccessCategory). Sem FK (mesmo padrao do resto do projeto). Regra: categoria SEM NENHUMA
// linha aqui = aberta pra todo mundo do servidor (comportamento de sempre, nao muda nada em
// servidor que nunca configurou isso); categoria COM pelo menos uma linha = so' quem tem uma
// linha consegue ver ela e os canais dentro (ver ServerService.listCategories/listChannels).
// Pensado pra separar jogadores de campanhas diferentes de RPG no mesmo servidor, mas vale pra
// qualquer categoria de qualquer servidor (pedido explicito do usuario).
@Entity
@Table(name = "category_access_entries", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"categoryId", "userId"})
}, indexes = {
        @Index(name = "idx_category_access_entries_category_id", columnList = "categoryId"),
        @Index(name = "idx_category_access_entries_user_id", columnList = "userId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategoryAccessEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long categoryId;

    @Column(nullable = false)
    private Long userId;
}
