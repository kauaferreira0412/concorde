package com.codagis.concorde.repository;

import com.codagis.concorde.domain.CategoryAccessEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Set;

public interface CategoryAccessRepository extends JpaRepository<CategoryAccessEntry, Long> {
    List<CategoryAccessEntry> findByCategoryId(Long categoryId);

    List<CategoryAccessEntry> findByCategoryIdIn(List<Long> categoryIds);

    boolean existsByCategoryIdAndUserId(Long categoryId, Long userId);

    void deleteByCategoryId(Long categoryId);

    // Usado pra saber, de uma tacada so', quais dessas categorias tem QUALQUER restricao
    // configurada (ver ServerService.listCategories/listChannels) - sem isso seria uma query
    // por categoria.
    @org.springframework.data.jpa.repository.Query("select distinct e.categoryId from CategoryAccessEntry e where e.categoryId in :categoryIds")
    Set<Long> findRestrictedCategoryIds(java.util.Collection<Long> categoryIds);
}
