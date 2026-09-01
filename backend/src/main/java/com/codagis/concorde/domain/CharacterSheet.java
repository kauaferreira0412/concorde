package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

// Ficha de personagem em PDF (kit de RPG, ver CharacterSheetService/CharacterSheetsModal.jsx) -
// vive numa CATEGORIA (a "mesa"/campanha inteira, nao um canal especifico - assim fica visivel
// junto com o mapa/sessoes/chats da mesma campanha). Qualquer membro com acesso aquela categoria
// pode subir a PROPRIA ficha; so' apaga a sua (ou o mestre, dono da categoria - ver
// CharacterSheetService.delete). Sem FK (mesmo padrao do resto do projeto).
@Entity
@Table(name = "character_sheets", indexes = {
        @Index(name = "idx_character_sheets_category_id", columnList = "categoryId"),
        @Index(name = "idx_character_sheets_owner_user_id", columnList = "ownerUserId")
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

    @Column(nullable = false)
    private Long ownerUserId;

    @Column(nullable = false, length = 60)
    private String characterName;

    @Column(nullable = false, length = 1000)
    private String fileUrl;

    @Column(nullable = false, length = 255)
    private String fileName;

    private Long fileSize;

    @Builder.Default
    private Instant uploadedAt = Instant.now();
}
