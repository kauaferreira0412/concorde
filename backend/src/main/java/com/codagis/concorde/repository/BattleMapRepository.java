package com.codagis.concorde.repository;

import com.codagis.concorde.domain.BattleMap;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BattleMapRepository extends JpaRepository<BattleMap, Long> {
    Optional<BattleMap> findByChannelId(Long channelId);
    void deleteByChannelId(Long channelId);
}
