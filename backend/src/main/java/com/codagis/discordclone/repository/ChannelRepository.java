package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.Channel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByServerIdOrderByIdAsc(Long serverId);
    boolean existsByServerIdAndName(Long serverId, String name);
}
