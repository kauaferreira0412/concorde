package com.codagis.concorde.dto;

import java.time.Instant;

public class CharacterSheetDtos {

    public record CharacterSheetResponse(Long id, Long categoryId, Long ownerUserId, String ownerUsername,
                                          String ownerAvatarUrl, String characterName, String fileUrl, String fileName,
                                          Long fileSize, Instant uploadedAt) {}
}
