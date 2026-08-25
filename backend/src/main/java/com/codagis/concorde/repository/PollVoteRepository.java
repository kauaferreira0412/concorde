package com.codagis.concorde.repository;

import com.codagis.concorde.domain.PollVote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PollVoteRepository extends JpaRepository<PollVote, Long> {
    List<PollVote> findByPollId(Long pollId);
    Optional<PollVote> findByOptionIdAndUserId(Long optionId, Long userId);
    void deleteByPollIdAndUserId(Long pollId, Long userId);
    void deleteByPollId(Long pollId);
}
