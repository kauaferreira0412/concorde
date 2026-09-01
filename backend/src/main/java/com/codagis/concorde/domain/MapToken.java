package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Um "pin"/token num mapa de batalha (ver BattleMap/MapService/BattleMap.jsx). x/y sao FRACOES
// da imagem (0.0 a 1.0, nao pixel) - assim a posicao bate certinho pra todo mundo independente
// do zoom/tamanho de tela de cada um. Sem FK (mesmo padrao do resto do projeto).
@Entity
@Table(name = "map_tokens", indexes = {
        @Index(name = "idx_map_tokens_channel_id", columnList = "channelId"),
        @Index(name = "idx_map_tokens_map_id", columnList = "mapId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MapToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long channelId;

    // Qual MAPA (dos varios que um canal pode ter agora) esse token pertence - pedido
    // explicito do usuario: "os [tokens] vao ficar salvos em cada um dos mapas". SEM
    // "nullable = false" de proposito (coluna nova numa tabela que ja' tem tokens de antes do
    // canal ter mais de um mapa - mesmo motivo do "imageUrl" abaixo). Todo token NOVO sempre
    // nasce com isso preenchido (ver MapService.addToken); um token antigo sem mapId simplesmente
    // nao aparece mais em nenhum mapa (orfao inofensivo).
    private Long mapId;

    @Column(nullable = false, length = 40)
    private String label;

    @Column(nullable = false, length = 10)
    private String color;

    // Imagem customizada do token (retrato do personagem, icone, etc - pedido explicito do
    // usuario) - null = mostra so' o circulo colorido de sempre (ver "color" acima). SEM
    // "nullable = false" de proposito - coluna nova numa tabela que ja tem tokens existentes
    // (ver historico de bugs de ddl-auto:update com NOT NULL em tabela com dados).
    @Column(length = 1000)
    private String imageUrl;

    @Column(nullable = false)
    private double x;

    @Column(nullable = false)
    private double y;

    @Column(nullable = false)
    private Long createdBy;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
