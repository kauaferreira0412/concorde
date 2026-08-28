package com.codagis.concorde.repository;

import com.codagis.concorde.domain.SpotifyAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SpotifyAccountRepository extends JpaRepository<SpotifyAccount, Long> {
    Optional<SpotifyAccount> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
