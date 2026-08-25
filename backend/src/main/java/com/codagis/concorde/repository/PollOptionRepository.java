package com.codagis.concorde.repository;

import com.codagis.concorde.domain.PollOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PollOptionRepository extends JpaRepository<PollOption, Long> {
    List<PollOption> findByPollIdOrderByPositionAsc(Long pollId);
    void deleteByPollId(Long pollId);
}
