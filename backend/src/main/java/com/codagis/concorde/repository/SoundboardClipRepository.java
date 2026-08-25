package com.codagis.concorde.repository;

import com.codagis.concorde.domain.SoundboardClip;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SoundboardClipRepository extends JpaRepository<SoundboardClip, Long> {
    List<SoundboardClip> findByUserIdOrderByCreatedAtDesc(Long userId);
}
