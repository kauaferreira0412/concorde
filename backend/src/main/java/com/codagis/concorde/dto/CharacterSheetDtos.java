package com.codagis.concorde.dto;

import java.time.Instant;

public class CharacterSheetDtos {

    public record CharacterSheetResponse(Long id, Long serverId, String characterName, String imageUrl,
                                          String fileUrl, String fileName, Long fileSize,
                                          Long linkedUserId, String linkedUsername, String linkedAvatarUrl,
                                          Instant createdAt, boolean canEdit) {}

    public record LinkPlayerRequest(Long userId) {}
}
