package com.codagis.concorde.service;

import com.codagis.concorde.domain.AuditLogEntry;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.AuditLogDtos.AuditLogEntryResponse;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.repository.AuditLogEntryRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class AuditLogService {

    private final AuditLogEntryRepository auditLogEntryRepository;
    private final UserRepository userRepository;
    private final PermissionService permissionService;

    public AuditLogService(AuditLogEntryRepository auditLogEntryRepository, UserRepository userRepository,
                            PermissionService permissionService) {
        this.auditLogEntryRepository = auditLogEntryRepository;
        this.userRepository = userRepository;
        this.permissionService = permissionService;
    }

    @Transactional
    public void deleteAllForServer(Long serverId) {
        auditLogEntryRepository.deleteByServerId(serverId);
    }

    @Transactional
    public void log(Long serverId, Long actorUserId, String action, Long targetUserId, String targetType, Long targetId, String detail) {
        auditLogEntryRepository.save(AuditLogEntry.builder()
                .serverId(serverId)
                .actorUserId(actorUserId)
                .action(action)
                .targetUserId(targetUserId)
                .targetType(targetType)
                .targetId(targetId)
                .detail(detail)
                .build());
    }

    public List<AuditLogEntryResponse> list(Long serverId, Long requesterId) {
        permissionService.assertHas(serverId, requesterId, ServerPermission.VIEW_AUDIT_LOG);
        List<AuditLogEntry> entries = auditLogEntryRepository.findTop100ByServerIdOrderByCreatedAtDesc(serverId);

        Set<Long> userIds = new HashSet<>();
        for (AuditLogEntry e : entries) {
            userIds.add(e.getActorUserId());
            if (e.getTargetUserId() != null) {
                userIds.add(e.getTargetUserId());
            }
        }
        Map<Long, String> usernames = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getUsername));

        return entries.stream()
                .map(e -> new AuditLogEntryResponse(
                        e.getId(),
                        e.getActorUserId(),
                        usernames.getOrDefault(e.getActorUserId(), "desconhecido"),
                        e.getAction(),
                        e.getTargetUserId(),
                        e.getTargetUserId() != null ? usernames.getOrDefault(e.getTargetUserId(), "desconhecido") : null,
                        e.getTargetType(),
                        e.getTargetId(),
                        e.getDetail(),
                        e.getCreatedAt()))
                .toList();
    }
}
