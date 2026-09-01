package com.codagis.concorde.repository;

import com.codagis.concorde.domain.CharacterSheet;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CharacterSheetRepository extends JpaRepository<CharacterSheet, Long> {
    List<CharacterSheet> findByCategoryIdOrderByUploadedAtDesc(Long categoryId);
    void deleteByCategoryId(Long categoryId);
}
