package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.ServerRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ServerRoleRepository extends JpaRepository<ServerRole, Long> {
    List<ServerRole> findByServerId(Long serverId);
}
