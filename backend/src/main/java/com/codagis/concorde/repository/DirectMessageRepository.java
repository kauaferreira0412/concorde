package com.codagis.concorde.repository;

import com.codagis.concorde.domain.DirectMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DirectMessageRepository extends JpaRepository<DirectMessage, Long> {
    List<DirectMessage> findTop50ByChannelIdOrderByIdDesc(Long channelId);
    List<DirectMessage> findByChannelIdAndPinnedTrueOrderByPinnedAtDesc(Long channelId);
    List<DirectMessage> findTop50ByChannelIdAndContentContainingIgnoreCaseOrderByIdDesc(Long channelId, String content);
    Optional<DirectMessage> findTop1ByChannelIdOrderByIdDesc(Long channelId);
    void deleteByChannelId(Long channelId);
}
