package com.codagis.concorde.repository;

import com.codagis.concorde.domain.CustomEmoji;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CustomEmojiRepository extends JpaRepository<CustomEmoji, Long> {
    List<CustomEmoji> findByServerIdOrderByNameAsc(Long serverId);
    Optional<CustomEmoji> findByServerIdAndName(Long serverId, String name);
    boolean existsByServerIdAndName(Long serverId, String name);
    void deleteByServerId(Long serverId);
}
