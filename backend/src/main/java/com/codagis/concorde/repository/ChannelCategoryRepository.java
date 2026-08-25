package com.codagis.concorde.repository;

import com.codagis.concorde.domain.ChannelCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChannelCategoryRepository extends JpaRepository<ChannelCategory, Long> {
    List<ChannelCategory> findByServerIdOrderByPositionAsc(Long serverId);
    void deleteByServerId(Long serverId);
}
