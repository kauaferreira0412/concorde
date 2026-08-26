package com.codagis.concorde.repository;

import com.codagis.concorde.domain.DirectMessageReaction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DirectMessageReactionRepository extends JpaRepository<DirectMessageReaction, Long> {
    List<DirectMessageReaction> findByMessageId(Long messageId);
    List<DirectMessageReaction> findByMessageIdIn(Collection<Long> messageIds);
    Optional<DirectMessageReaction> findByMessageIdAndUserIdAndEmoji(Long messageId, Long userId, String emoji);
    void deleteByMessageId(Long messageId);
}
