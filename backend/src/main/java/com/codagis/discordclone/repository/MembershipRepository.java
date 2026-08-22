package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.Membership;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {
    List<Membership> findByUserId(Long userId);
    List<Membership> findByServerId(Long serverId);
    Optional<Membership> findByServerIdAndUserId(Long serverId, Long userId);
    boolean existsByServerIdAndUserId(Long serverId, Long userId);

    /** Usado ao apagar um servidor inteiro (ver ServerService.deleteServer). */
    void deleteByServerId(Long serverId);
}
