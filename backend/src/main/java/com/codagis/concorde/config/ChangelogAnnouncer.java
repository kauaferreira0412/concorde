package com.codagis.concorde.config;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Message;
import com.codagis.concorde.enums.Role;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MessageRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.service.ChangelogService;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Quando sobe uma versão com changelog novo, posta no canal "Atualizações" de cada servidor uma
 * mensagem com o resumo e o marcador [[changelog:VERSAO]] - o app mostra esse marcador como um
 * botão "Ver novidades", que abre o mesmo modal das novidades.
 *
 * Roda depois que tudo subiu (inclusive o AnnouncementsChannelBootstrap, que cria os canais) e
 * não posta de novo se a mensagem daquela versão já existir no canal.
 */
@Component
public class ChangelogAnnouncer {

    private static final String CHANNEL_NAME = "Atualizações";

    private final ChangelogService changelogService;
    private final ChannelRepository channelRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;

    public ChangelogAnnouncer(ChangelogService changelogService, ChannelRepository channelRepository,
                              MessageRepository messageRepository, UserRepository userRepository) {
        this.changelogService = changelogService;
        this.channelRepository = channelRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void announceLatest() {
        ChangelogService.Entry entry = changelogService.latest().orElse(null);
        if (entry == null) return;
        Long authorId = userRepository.findFirstByRoleAndAdminPanelTrueOrderByIdAsc(Role.ADMIN)
                .or(() -> userRepository.findFirstByRoleOrderByIdAsc(Role.ADMIN))
                .map(u -> u.getId())
                .orElse(null);
        if (authorId == null) return;

        String marker = "[[changelog:" + entry.version() + "]]";
        String content = "## " + entry.title()
                + (entry.summary().isBlank() ? "" : "\n" + entry.summary())
                + "\n" + marker;

        int posted = 0;
        for (Channel channel : channelRepository.findByName(CHANNEL_NAME)) {
            if (messageRepository.existsByChannelIdAndContentContaining(channel.getId(), marker)) continue;
            messageRepository.save(Message.builder()
                    .channelId(channel.getId())
                    .authorId(authorId)
                    .content(content.length() > 4000 ? content.substring(0, 3990 - marker.length()) + "...\n" + marker : content)
                    .build());
            posted++;
        }
        if (posted > 0) {
            System.out.println("Novidades da versao " + entry.version() + " postadas em " + posted + " canal(is) '" + CHANNEL_NAME + "'");
        }
    }
}
