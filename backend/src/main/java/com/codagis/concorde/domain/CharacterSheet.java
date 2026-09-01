package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Personagem de uma mesa de RPG (villao, NPC, personagem de jogador - kit de RPG, ver
// CharacterSheetService/CharacterSheetsModal.jsx). Vive numa CATEGORIA inteira (a mesa/
// campanha), nao num canal especifico. SO' O MESTRE (quem criou a categoria, ver
// ChannelCategory.createdBy) cria personagens e decide "linkedUserId" - qual JOGADOR (se
// algum) tem acesso aquela ficha (pedido explicito do usuario: "os jogadores nao criam
// personagem... so' o mestre que cria... e' o mestre que vai dizer qual ficha cada jogador tem
// acesso"). O jogador vinculado enxerga e EDITA essa ficha (nome/foto/PDF); quem nao esta'
// vinculado (e nao e' o mestre) nem sabe que ela existe (ver CharacterSheetService.list).
// Personagem sem "linkedUserId" (null) = so' o mestre ve (villao/NPC). Sem FK (mesmo padrao do
// resto do projeto).
@Entity
@Table(name = "character_sheets", indexes = {
        @Index(name = "idx_character_sheets_category_id", columnList = "categoryId"),
        @Index(name = "idx_character_sheets_owner_user_id", columnList = "ownerUserId"),
        @Index(name = "idx_character_sheets_linked_user_id", columnList = "linkedUserId")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CharacterSheet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long categoryId;

    // Quem CRIOU esse personagem - sempre o mestre da categoria (ver
    // CharacterSheetService.create, que so' deixa o mestre chamar isso). Nome do campo ficou
    // de uma versao anterior (jogadores subiam a propria ficha) - mantido pra nao precisar
    // renomear a coluna no banco, mas o SIGNIFICADO agora e' sempre "criado pelo mestre".
    @Column(nullable = false)
    private Long ownerUserId;

    // O JOGADOR que tem acesso a essa ficha (ve + edita) - so' o mestre define isso (ver
    // CharacterSheetService.linkPlayer). null = ninguem vinculado ainda (villao/NPC, ou
    // personagem de jogador que o mestre ainda nao atribuiu).
    private Long linkedUserId;

    @Column(nullable = false, length = 60)
    private String characterName;

    // Foto do personagem (pedido explicito do usuario: "cada personagem pode ter uma foto, e
    // essa foto pode ser transformada em um token pra usar no mapa") - opcional.
    @Column(length = 1000)
    private String imageUrl;

    // PDF da ficha em si - opcional agora (o mestre pode criar o personagem so' com nome/foto
    // e subir o PDF depois, ou nunca).
    @Column(length = 1000)
    private String fileUrl;

    @Column(length = 255)
    private String fileName;

    private Long fileSize;

    @Builder.Default
    private Instant uploadedAt = Instant.now();
}
