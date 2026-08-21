package com.codagis.discordclone.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long channelId;

    @Column(nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 4000)
    private String content;

    /** URL publica no Google Cloud Storage, se a mensagem tiver uma imagem anexada. */
    @Column(length = 1000)
    private String imageUrl;

    @Builder.Default
    private Instant createdAt = Instant.now();

    /** Preenchido quando o autor (ou o admin) edita a mensagem - null = nunca editada. */
    private Instant editedAt;

    /** Preenchido quando essa mensagem e' uma resposta a outra - null = mensagem normal.
     * Sem FK de proposito (mesmo padrao do resto do app, ver Membership/Server) - se a
     * mensagem original for apagada depois, so' deixa de aparecer o preview dela na resposta. */
    private Long replyToId;

    // Rolagem de dado (ver DiceService/DiceController) - null nos 3 campos = mensagem normal.
    // "content" continua preenchido com um resumo em texto puro (fallback pra quem por algum
    // motivo nao renderizar o cartao especial, ex: historico bruto) - o frontend troca pelo
    // cartao com os iconzinhos de dado quando rollNotation != null (ver ChatWindow.jsx).
    /** Ex: "2d20+5" */
    private String rollNotation;
    /** Numero de lados do dado rolado (4/6/8/10/12/20/100) - todos os dados de UMA rolagem sao do mesmo tipo. */
    private Integer rollSides;
    /** Resultado de cada dado, separado por virgula (ex: "14,7") - sem tabela nova pra isso. */
    private String rollResultsCsv;
    /** Soma de todos os dados + modificador. */
    private Integer rollTotal;
}
