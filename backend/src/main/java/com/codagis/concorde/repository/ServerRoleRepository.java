package com.codagis.concorde.repository;

import com.codagis.concorde.domain.ServerRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ServerRoleRepository extends JpaRepository<ServerRole, Long> {
    List<ServerRole> findByServerId(Long serverId);
    void deleteByServerId(Long serverId);
}
