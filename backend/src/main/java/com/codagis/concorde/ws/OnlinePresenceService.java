package com.codagis.concorde.ws;

import com.codagis.concorde.enums.PresenceStatus;
import com.codagis.concorde.enums.UserStatus;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OnlinePresenceService {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository userRepository;

    private final Map<Long, Set<String>> sessionsByUser = new ConcurrentHashMap<>();
    private final Map<String, Long> userBySession = new ConcurrentHashMap<>();

    public OnlinePresenceService(SimpMessagingTemplate messagingTemplate, UserRepository userRepository) {
        this.messagingTemplate = messagingTemplate;
        this.userRepository = userRepository;
    }

    public void connect(String sessionId, Long userId) {
        sessionsByUser.computeIfAbsent(userId, k -> ConcurrentHashMap.newKeySet()).add(sessionId);
        userBySession.put(sessionId, userId);
        broadcast(userId);
    }

    public void disconnect(String sessionId) {
        Long userId = userBySession.remove(sessionId);
        if (userId == null) {
            return;
        }
        Set<String> sessions = sessionsByUser.get(userId);
        if (sessions != null) {
            sessions.remove(sessionId);
            if (sessions.isEmpty()) {
                sessionsByUser.remove(userId);
            }
        }
        broadcast(userId);
    }

    public void onStatusChanged(Long userId) {
        broadcast(userId);
    }

    private boolean hasActiveSession(Long userId) {
        Set<String> sessions = sessionsByUser.get(userId);
        return sessions != null && !sessions.isEmpty();
    }

    public PresenceStatus effectiveStatus(Long userId) {
        if (!hasActiveSession(userId)) {
            return PresenceStatus.OFFLINE;
        }
        UserStatus preference = userRepository.findById(userId).map(u -> u.getStatus()).orElse(UserStatus.ONLINE);
        return switch (preference) {
            case ONLINE -> PresenceStatus.ONLINE;
            case AWAY -> PresenceStatus.AWAY;
            case DND -> PresenceStatus.DND;
            case INVISIBLE -> PresenceStatus.OFFLINE;
        };
    }

    public Map<Long, PresenceStatus> effectiveStatusOf(Collection<Long> userIds) {
        Map<Long, PresenceStatus> result = new HashMap<>();
        for (Long userId : userIds) {
            result.put(userId, effectiveStatus(userId));
        }
        return result;
    }

    private void broadcast(Long userId) {
        messagingTemplate.convertAndSend("/topic/presence", new PresenceEvent(userId, effectiveStatus(userId)));
    }

    public record PresenceEvent(Long userId, PresenceStatus status) {}
}
