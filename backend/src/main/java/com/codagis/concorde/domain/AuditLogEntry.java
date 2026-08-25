package com.codagis.concorde.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "audit_log_entries", indexes = {
        @Index(name = "idx_audit_log_entries_server_id", columnList = "serverId"),
        @Index(name = "idx_audit_log_entries_actor_user_id", columnList = "actorUserId"),
        @Index(name = "idx_audit_log_entries_action", columnList = "action"),
        @Index(name = "idx_audit_log_entries_target_user_id", columnList = "targetUserId"),
        @Index(name = "idx_audit_log_entries_target_type", columnList = "targetType"),
        @Index(name = "idx_audit_log_entries_target_id", columnList = "targetId"),
        @Index(name = "idx_audit_log_entries_detail", columnList = "detail"),
        @Index(name = "idx_audit_log_entries_created_at", columnList = "createdAt")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLogEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long serverId;

    @Column(nullable = false)
    private Long actorUserId;

    @Column(nullable = false, length = 40)
    private String action;

    private Long targetUserId;

    @Column(length = 20)
    private String targetType;

    private Long targetId;

    @Column(length = 300)
    private String detail;

    @Builder.Default
    private Instant createdAt = Instant.now();
}
