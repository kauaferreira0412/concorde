package com.codagis.concorde.dto;

import java.time.Instant;

public class AuditLogDtos {

    public record AuditLogEntryResponse(Long id, Long actorUserId, String actorUsername, String action,
                                         Long targetUserId, String targetUsername, String targetType, Long targetId,
                                         String detail, Instant createdAt) {}
}
