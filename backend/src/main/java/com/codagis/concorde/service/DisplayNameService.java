package com.codagis.concorde.service;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Membership;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;

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
