package com.codagis.concorde.controller;

import com.codagis.concorde.dto.VoiceDtos.ActiveCall;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.ServerService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Quem está em call agora nos seus servidores (usado pelo widget da tela inicial). */
@RestController
public class ActiveCallsController {

    private final ServerService serverService;
    private final CurrentUser currentUser;

    public ActiveCallsController(ServerService serverService, CurrentUser currentUser) {
        this.serverService = serverService;
        this.currentUser = currentUser;
    }

    @GetMapping("/api/voice/active-calls")
    public List<ActiveCall> activeCalls() {
        return serverService.activeCalls(currentUser.id());
    }
}
