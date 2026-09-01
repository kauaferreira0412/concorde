package com.codagis.concorde.repository;

import com.codagis.concorde.domain.MapToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MapTokenRepository extends JpaRepository<MapToken, Long> {
    List<MapToken> findByChannelIdOrderByIdAsc(Long channelId);
    List<MapToken> findByMapIdOrderByIdAsc(Long mapId);
    void deleteByChannelId(Long channelId);
    void deleteByMapId(Long mapId);
}
