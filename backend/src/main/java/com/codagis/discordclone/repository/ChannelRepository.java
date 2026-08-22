package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.Channel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChannelRepository extends JpaRepository<Channel, Long> {
    List<Channel> findByServerIdOrderByIdAsc(Long serverId);
    boolean existsByServerIdAndName(Long serverId, String name);

    /** Usado ao apagar um servidor inteiro (ver ServerService.deleteServer) - as mensagens de
     *  cada canal ja' precisam ter sido apagadas antes (ver MessageRepository.deleteByChannelId). */
    void deleteByServerId(Long serverId);
}
