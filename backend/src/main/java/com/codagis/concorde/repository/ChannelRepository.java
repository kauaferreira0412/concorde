package com.codagis.concorde.repository;

import com.codagis.concorde.domain.Channel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByServerIdOrderByIdAsc(Long serverId);
    boolean existsByServerIdAndName(Long serverId, String name);
    void deleteByServerId(Long serverId);
}
