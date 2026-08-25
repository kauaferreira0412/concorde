package com.codagis.concorde.ws;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class VoiceDisconnectListener {

    private final VoicePresenceService presenceService;

    public VoiceDisconnectListener(VoicePresenceService presenceService) {
        this.presenceService = presenceService;
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        presenceService.leaveBySession(accessor.getSessionId());
    }
}
