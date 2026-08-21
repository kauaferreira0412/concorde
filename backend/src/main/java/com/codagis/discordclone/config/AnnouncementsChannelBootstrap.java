package com.codagis.discordclone.config;

import com.codagis.discordclone.domain.Channel;
import com.codagis.discordclone.domain.ChannelType;
import com.codagis.discordclone.domain.Server;
import com.codagis.discordclone.repository.ChannelRepository;
import com.codagis.discordclone.repository.ServerRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Garante que TODO servidor tem um canal "Atualizações" (texto, so' o admin GLOBAL posta - ver
 * Channel.adminOnly/MessageService.save) - servidores NOVOS ja' ganham o deles direto em
 * ServerService.createServer, esse bootstrap aqui e' so' pros servidores que ja' existiam antes
 * dessa feature (roda em toda subida, mas so' cria o que ainda nao existe - idempotente, igual
 * o AdminBootstrap).
 */
@Component
public class AnnouncementsChannelBootstrap implements CommandLineRunner {

    private static final String CHANNEL_NAME = "Atualizações";

    private final ServerRepository serverRepository;
    private final ChannelRepository channelRepository;

    public AnnouncementsChannelBootstrap(ServerRepository serverRepository, ChannelRepository channelRepository) {
        this.serverRepository = serverRepository;
        this.channelRepository = channelRepository;
    }

    @Override
    public void run(String... args) {
        for (Server server : serverRepository.findAll()) {
            if (channelRepository.existsByServerIdAndName(server.getId(), CHANNEL_NAME)) {
                continue;
            }
            channelRepository.save(Channel.builder()
                    .serverId(server.getId())
                    .name(CHANNEL_NAME)
                    .type(ChannelType.TEXT)
                    .adminOnly(true)
                    .build());
            System.out.println("Canal '" + CHANNEL_NAME + "' criado no servidor #" + server.getId() + " (" + server.getName() + ")");
        }
    }
}
