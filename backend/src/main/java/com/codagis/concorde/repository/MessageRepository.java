package com.codagis.concorde.repository;

import com.codagis.concorde.domain.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findTop50ByChannelIdOrderByIdDesc(Long channelId);
    List<Message> findByChannelIdAndPinnedTrueOrderByPinnedAtDesc(Long channelId);
    List<Message> findTop50ByChannelIdAndContentContainingIgnoreCaseOrderByIdDesc(Long channelId, String content);
    Optional<Message> findByPollId(Long pollId);
    void deleteByChannelId(Long channelId);
}
