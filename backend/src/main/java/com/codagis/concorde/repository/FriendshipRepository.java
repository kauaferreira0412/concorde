package com.codagis.concorde.repository;

import com.codagis.concorde.domain.Friendship;
import com.codagis.concorde.enums.FriendshipStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FriendshipRepository extends JpaRepository<Friendship, Long> {
    Optional<Friendship> findByUserAIdAndUserBId(Long userAId, Long userBId);

    @Query("select f from Friendship f where (f.userAId = :userId or f.userBId = :userId) and f.status = :status")
    List<Friendship> findAllForUserWithStatus(@Param("userId") Long userId, @Param("status") FriendshipStatus status);

    @Query("select f from Friendship f where f.userAId = :userId or f.userBId = :userId")
    List<Friendship> findAllForUser(@Param("userId") Long userId);
}
