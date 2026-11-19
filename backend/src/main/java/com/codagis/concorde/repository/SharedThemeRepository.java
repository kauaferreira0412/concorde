package com.codagis.concorde.repository;

import com.codagis.concorde.domain.SharedTheme;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SharedThemeRepository extends JpaRepository<SharedTheme, Long> {
    List<SharedTheme> findTop200ByOrderByCreatedAtDesc();
    List<SharedTheme> findTop200ByOrderByUsesDescCreatedAtDesc();
    long countByAuthorId(Long authorId);

    @Modifying
    @Query("update SharedTheme t set t.uses = t.uses + 1 where t.id = :id")
    int incrementUses(@Param("id") Long id);
}
