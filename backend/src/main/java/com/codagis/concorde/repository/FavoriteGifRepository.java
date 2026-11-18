package com.codagis.concorde.repository;

import com.codagis.concorde.domain.FavoriteGif;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FavoriteGifRepository extends JpaRepository<FavoriteGif, Long> {
    List<FavoriteGif> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<FavoriteGif> findByUserIdAndUrl(Long userId, String url);
    long countByUserId(Long userId);
}
