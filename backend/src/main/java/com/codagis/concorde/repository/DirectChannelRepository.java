package com.codagis.concorde.repository;

import com.codagis.concorde.domain.DirectChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DirectChannelRepository extends JpaRepository<DirectChannel, Long> {
    Optional<DirectChannel> findByUserAIdAndUserBId(Long userAId, Long userBId);

    @Query("select c from DirectChannel c where c.userAId = :userId or c.userBId = :userId")
    List<DirectChannel> findAllForUser(@Param("userId") Long userId);
}
