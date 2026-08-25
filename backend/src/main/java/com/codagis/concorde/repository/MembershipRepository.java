package com.codagis.concorde.repository;

import com.codagis.concorde.domain.Membership;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MembershipRepository extends JpaRepository<Membership, Long> {
    List<Membership> findByUserId(Long userId);
    List<Membership> findByServerId(Long serverId);
    Optional<Membership> findByServerIdAndUserId(Long serverId, Long userId);
    boolean existsByServerIdAndUserId(Long serverId, Long userId);
    void deleteByServerId(Long serverId);
}
