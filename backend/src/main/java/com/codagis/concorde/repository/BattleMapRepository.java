package com.codagis.concorde.repository;

import com.codagis.concorde.domain.BattleMap;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BattleMapRepository extends JpaRepository<BattleMap, Long> {
    List<BattleMap> findByChannelIdOrderByIdAsc(Long channelId);
    void deleteByChannelId(Long channelId);
}
