package com.codagis.discordclone.repository;

import com.codagis.discordclone.domain.Message;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findTop50ByChannelIdOrderByIdDesc(Long channelId);

    /** Usado ao apagar um canal (ver ServerService.deleteChannel) - limpa o historico junto,
     *  senao ficaria mensagem orfa apontando pra um channelId que nao existe mais. */
    void deleteByChannelId(Long channelId);
}
