package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findTop50ByChannelIdOrderByIdDesc(Long channelId);

    /** Usado pra limpar cards de fila de musica antigos (ver MessageService.deleteAllByContent/
     *  MusicController) - o conteudo e' o marcador magico "[[MUSIC_QUEUE:channelId]]", nao
     *  precisa de indice nenhum extra porque isso so' roda em abrir/apagar fila (raro). */
    List<Message> findByContent(String content);
}
