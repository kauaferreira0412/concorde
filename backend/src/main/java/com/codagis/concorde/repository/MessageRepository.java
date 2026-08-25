package com.codagis.concorde.repository;

import com.codagis.concorde.domain.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findTop50ByChannelIdOrderByIdDesc(Long channelId);
    void deleteByChannelId(Long channelId);
}
