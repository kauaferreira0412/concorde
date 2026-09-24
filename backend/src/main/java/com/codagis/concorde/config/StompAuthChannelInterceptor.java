package com.codagis.concorde.config;

import com.codagis.concorde.domain.DirectChannel;
import com.codagis.concorde.repository.DirectChannelRepository;
import com.codagis.concorde.security.JwtService;
import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.security.Principal;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;
    private final DirectChannelRepository directChannelRepository;

    private static final Pattern DM_TOPIC = Pattern.compile("^/topic/dm\\.(\\d+)(?:\\..*)?$");

    public StompAuthChannelInterceptor(JwtService jwtService, DirectChannelRepository directChannelRepository) {
        this.jwtService = jwtService;
        this.directChannelRepository = directChannelRepository;
    }

    @Override
    public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            List<String> authHeaders = accessor.getNativeHeader("Authorization");
            if (authHeaders != null && !authHeaders.isEmpty() && authHeaders.get(0).startsWith("Bearer ")) {
                String token = authHeaders.get(0).substring(7);
                Long userId = jwtService.extractUserId(token);
                accessor.setUser(new UsernamePasswordAuthenticationToken(userId, null, List.of()));
            } else {
                throw new IllegalArgumentException("Token ausente na conexao WebSocket");
            }
        } else if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            if (destination != null) {
                Matcher m = DM_TOPIC.matcher(destination);
                if (m.matches()) {
                    Long channelId = Long.valueOf(m.group(1));
                    Long userId = resolveUserId(accessor);
                    DirectChannel dm = directChannelRepository.findById(channelId).orElse(null);
                    boolean allowed = userId != null && dm != null
                            && (dm.getUserAId().equals(userId) || dm.getUserBId().equals(userId));
                    if (!allowed) {
                        throw new IllegalArgumentException("Voce nao participa dessa conversa privada");
                    }
                }
            }
        }
        return message;
    }

    private Long resolveUserId(StompHeaderAccessor accessor) {
        Principal user = accessor.getUser();
        if (user instanceof Authentication auth && auth.getPrincipal() instanceof Long id) {
            return id;
        }
        return null;
    }
}
