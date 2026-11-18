package com.codagis.concorde.repository;

import com.codagis.concorde.domain.DirectMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;

import java.util.List;
import java.util.Optional;

public interface DirectMessageRepository extends JpaRepository<DirectMessage, Long> {
    List<DirectMessage> findTop50ByChannelIdOrderByIdDesc(Long channelId);
    List<DirectMessage> findByChannelIdAndPinnedTrueOrderByPinnedAtDesc(Long channelId);
    List<DirectMessage> findTop50ByChannelIdAndContentContainingIgnoreCaseOrderByIdDesc(Long channelId, String content);
    Optional<DirectMessage> findTop1ByChannelIdOrderByIdDesc(Long channelId);
    void deleteByChannelId(Long channelId);

    /**
     * Busca com filtros. Usa sentinelas em vez de null (texto vazio, autor -1, datas extremas)
     * pra o Postgres não reclamar de tipo de parâmetro nulo.
     */
    @Query("""
            select m from DirectMessage m
            where m.channelId = :channelId
              and (:text = '' or lower(m.content) like lower(concat('%', :text, '%')))
              and (:authorId = -1 or m.authorId = :authorId)
              and (:hasImage = false or m.imageUrl is not null)
              and (:hasFile = false or m.fileUrl is not null)
              and (:hasLink = false or lower(m.content) like '%http%')
              and (:hasGif = false or lower(m.imageUrl) like '%.gif%' or lower(m.imageUrl) like '%giphy%')
              and m.createdAt >= :after
              and m.createdAt < :before
            order by m.id desc
            """)
    List<DirectMessage> searchFiltered(@Param("channelId") Long channelId,
                                @Param("text") String text,
                                @Param("authorId") Long authorId,
                                @Param("hasImage") boolean hasImage,
                                @Param("hasFile") boolean hasFile,
                                @Param("hasLink") boolean hasLink,
                                @Param("hasGif") boolean hasGif,
                                @Param("after") Instant after,
                                @Param("before") Instant before,
                                Pageable page);
}
