package com.codagis.concorde.dto;

import java.time.Instant;

public class CharacterSheetDtos {

    // canEdit = ESSE usuario pode editar essa ficha (mestre ou o jogador vinculado - ver
    // CharacterSheetService.canEdit) - o frontend usa so' pra mostrar/esconder os controles de
    // edicao, o backend confere de novo (de verdade) em update/delete/linkPlayer.
    public record CharacterSheetResponse(Long id, Long categoryId, String characterName, String imageUrl,
                                          String fileUrl, String fileName, Long fileSize,
                                          Long linkedUserId, String linkedUsername, String linkedAvatarUrl,
                                          Instant createdAt, boolean canEdit) {}

    public record LinkPlayerRequest(Long userId) {}
}
