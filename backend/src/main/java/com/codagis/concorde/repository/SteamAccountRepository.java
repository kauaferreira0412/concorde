package com.codagis.concorde.repository;

import com.codagis.concorde.domain.SteamAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SteamAccountRepository extends JpaRepository<SteamAccount, Long> {
    Optional<SteamAccount> findByUserId(Long userId);
    Optional<SteamAccount> findBySteamId(String steamId);
    List<SteamAccount> findByUserIdIn(Collection<Long> userIds);
    void deleteByUserId(Long userId);
}
