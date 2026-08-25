package com.codagis.concorde.ws;

import com.codagis.concorde.dto.VoiceDtos.VoiceParticipantInfo;
import com.codagis.concorde.service.LiveKitService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class VoicePresenceService {

    private final SimpMessagingTemplate messagingTemplate;
    private final LiveKitService liveKitService;

    private final Map<Long, Map<Long, VoiceParticipantInfo>> byChannel = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionChannel = new ConcurrentHashMap<>();
    private final Map<String, Long> sessionUser = new ConcurrentHashMap<>();
    private final Map<Long, Map<Long, String>> currentSession = new ConcurrentHashMap<>();

    public VoicePresenceService(SimpMessagingTemplate messagingTemplate, LiveKitService liveKitService) {
        this.messagingTemplate = messagingTemplate;
        this.liveKitService = liveKitService;
    }

    public void join(Long channelId, String sessionId, Long userId, String username, String avatarUrl,
                      boolean forceMuted, boolean forceDeafened) {
        boolean effectiveForceMuted = forceMuted || forceDeafened;
        byChannel.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>())
                .put(userId, new VoiceParticipantInfo(userId, username, avatarUrl, !effectiveForceMuted, forceDeafened,
                        effectiveForceMuted, forceDeafened, List.of()));
        sessionChannel.put(sessionId, channelId);
        sessionUser.put(sessionId, userId);
        currentSession.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>()).put(userId, sessionId);
        broadcast(channelId);
    }

    public void leaveBySession(String sessionId) {
        Long channelId = sessionChannel.remove(sessionId);
        Long userId = sessionUser.remove(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        Map<Long, String> perUserSession = currentSession.get(channelId);
        String latestSessionForUser = perUserSession != null ? perUserSession.get(userId) : null;
        if (!sessionId.equals(latestSessionForUser)) {
            return;
        }
        if (perUserSession != null) {
            perUserSession.remove(userId);
        }
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        if (participants != null) {
            participants.remove(userId);
            if (participants.isEmpty()) {
                byChannel.remove(channelId);
            }
        }
        broadcast(channelId);
        liveKitService.disconnectParticipant("channel-" + channelId, "user-" + userId);
    }

    public void setMicEnabled(String sessionId, boolean micEnabled) {
        Long channelId = sessionChannel.get(sessionId);
        Long userId = sessionUser.get(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        update(channelId, userId, current -> new VoiceParticipantInfo(userId, current.username(), current.avatarUrl(),
                micEnabled, current.deafened(), current.forceMuted(), current.forceDeafened(), current.watchingUserIds()));
    }

    public void setDeafened(String sessionId, boolean deafened) {
        Long channelId = sessionChannel.get(sessionId);
        Long userId = sessionUser.get(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        update(channelId, userId, current -> new VoiceParticipantInfo(userId, current.username(), current.avatarUrl(),
                current.micEnabled(), deafened, current.forceMuted(), current.forceDeafened(), current.watchingUserIds()));
    }

    public void setWatching(String sessionId, List<Long> watchingUserIds) {
        Long channelId = sessionChannel.get(sessionId);
        Long userId = sessionUser.get(sessionId);
        if (channelId == null || userId == null) {
            return;
        }
        List<Long> safeIds = watchingUserIds == null ? List.of() : watchingUserIds;
        update(channelId, userId, current -> new VoiceParticipantInfo(userId, current.username(), current.avatarUrl(),
                current.micEnabled(), current.deafened(), current.forceMuted(), current.forceDeafened(), safeIds));
    }

    public void setForceMuted(Long channelId, Long targetUserId, boolean forceMuted) {
        update(channelId, targetUserId, current -> new VoiceParticipantInfo(targetUserId, current.username(),
                current.avatarUrl(), !forceMuted, current.deafened(), forceMuted, current.forceDeafened(), current.watchingUserIds()));
    }

    public void setForceDeafened(Long channelId, Long targetUserId, boolean forceDeafened) {
        update(channelId, targetUserId, current -> new VoiceParticipantInfo(targetUserId, current.username(),
                current.avatarUrl(), !forceDeafened, forceDeafened, forceDeafened, forceDeafened, current.watchingUserIds()));
    }

    public boolean isForceMuted(Long channelId, Long userId) {
        VoiceParticipantInfo info = get(channelId, userId);
        return info != null && info.forceMuted();
    }

    public boolean isForceDeafened(Long channelId, Long userId) {
        VoiceParticipantInfo info = get(channelId, userId);
        return info != null && info.forceDeafened();
    }

    public boolean isPresent(Long channelId, Long userId) {
        return get(channelId, userId) != null;
    }

    private Long botUserId(Long channelId) {
        return -channelId;
    }

    // Batera (bot do soundboard) e' um participante SEPARADO do Melodion (musica) - precisa de
    // um userId "falso" proprio, senao os dois disputariam a mesma entrada no mapa de presenca
    // (ver joinBot/leaveBot logo acima) e so' um deles apareceria pra quem esta' na call.
    // Deslocado bem longe da faixa de channelId de verdade pra nunca colidir com botUserId().
    private static final long SOUNDBOARD_BOT_OFFSET = 1_000_000_000L;

    private Long soundboardBotUserId(Long channelId) {
        return -channelId - SOUNDBOARD_BOT_OFFSET;
    }

    public void joinBot(Long channelId, String name, String avatarUrl) {
        byChannel.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>())
                .put(botUserId(channelId), new VoiceParticipantInfo(botUserId(channelId), name, avatarUrl,
                        true, false, false, false, List.of()));
        broadcast(channelId);
    }

    public void leaveBot(Long channelId) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        if (participants == null) {
            return;
        }
        participants.remove(botUserId(channelId));
        if (participants.isEmpty()) {
            byChannel.remove(channelId);
        }
        broadcast(channelId);
    }

    public void joinSoundboardBot(Long channelId, String name, String avatarUrl) {
        Long id = soundboardBotUserId(channelId);
        byChannel.computeIfAbsent(channelId, k -> new ConcurrentHashMap<>())
                .put(id, new VoiceParticipantInfo(id, name, avatarUrl, true, false, false, false, List.of()));
        broadcast(channelId);
    }

    public void leaveSoundboardBot(Long channelId) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        if (participants == null) {
            return;
        }
        participants.remove(soundboardBotUserId(channelId));
        if (participants.isEmpty()) {
            byChannel.remove(channelId);
        }
        broadcast(channelId);
    }

    private VoiceParticipantInfo get(Long channelId, Long userId) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        return participants == null ? null : participants.get(userId);
    }

    private void update(Long channelId, Long userId, java.util.function.Function<VoiceParticipantInfo, VoiceParticipantInfo> updater) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        if (participants == null) {
            return;
        }
        VoiceParticipantInfo current = participants.get(userId);
        if (current == null) {
            return;
        }
        participants.put(userId, updater.apply(current));
        broadcast(channelId);
    }

    public List<VoiceParticipantInfo> snapshot(Long channelId) {
        Map<Long, VoiceParticipantInfo> participants = byChannel.get(channelId);
        return participants == null ? List.of() : new ArrayList<>(participants.values());
    }

    private void broadcast(Long channelId) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".voice", snapshot(channelId));
    }
}
