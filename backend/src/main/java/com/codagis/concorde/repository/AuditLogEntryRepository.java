package com.codagis.concorde.repository;

import com.codagis.concorde.domain.AuditLogEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AuditLogEntryRepository extends JpaRepository<AuditLogEntry, Long> {
    List<AuditLogEntry> findTop100ByServerIdOrderByCreatedAtDesc(Long serverId);
    void deleteByServerId(Long serverId);
}
