package com.codagis.concorde.config;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.ChannelType;
import com.codagis.concorde.domain.Server;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.ServerRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

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
