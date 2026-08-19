package com.codagis.discordclone.service;

import com.codagis.discordclone.domain.Channel;
import com.codagis.discordclone.domain.Membership;
import com.codagis.discordclone.repository.ChannelRepository;
import com.codagis.discordclone.repository.MembershipRepository;
import com.codagis.discordclone.repository.UserRepository;
import org.springframework.stereotype.Service;

/**
 * Resolve o nome que deve aparecer pra um usuario num contexto de VOZ especifico - apelido
 * DESSE servidor (Membership.nickname) primeiro, senao o apelido GLOBAL (User.nickname),
 * senao o username puro. Usado tanto no token do LiveKit (nome do participante dentro da
 * call - ver VoiceController) quanto na presenca de "quem esta conectado" (ver
 * VoicePresenceController) - antes os dois ignoravam qualquer apelido e usavam so' o
 * username, mesmo depois de configurar um apelido em Configuracoes.
 */
@Service
public class DisplayNameService {

    private final UserRepository userRepository;
    private final MembershipRepository membershipRepository;
    private final ChannelRepository channelRepository;

    public DisplayNameService(UserRepository userRepository, MembershipRepository membershipRepository,
                               ChannelRepository channelRepository) {
        this.userRepository = userRepository;
        this.membershipRepository = membershipRepository;
        this.channelRepository = channelRepository;
    }

    public String resolveForChannel(Long channelId, Long userId) {
        Channel channel = channelRepository.findById(channelId).orElse(null);
        if (channel == null) {
            return fallback(userId);
        }
        return resolveForServer(channel.getServerId(), userId);
    }

    public String resolveForServer(Long serverId, Long userId) {
        String serverNickname = membershipRepository.findByServerIdAndUserId(serverId, userId)
                .map(Membership::getNickname)
                .orElse(null);
        if (serverNickname != null && !serverNickname.isBlank()) {
            return serverNickname;
        }
        return fallback(userId);
    }

    private String fallback(Long userId) {
        return userRepository.findById(userId)
                .map(u -> (u.getNickname() != null && !u.getNickname().isBlank()) ? u.getNickname() : u.getUsername())
                .orElse("user-" + userId);
    }
}
