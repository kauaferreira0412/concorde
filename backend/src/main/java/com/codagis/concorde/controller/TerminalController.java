package com.codagis.concorde.controller;

import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.TerminalService;
import org.springframework.web.bind.annotation.*;

/** Configuração do terminal da VPS. O terminal em si roda pelo WebSocket /ws/terminal. */
@RestController
@RequestMapping("/api/admin/terminal")
public class TerminalController {

    private final TerminalService terminalService;
    private final CurrentUser currentUser;

    public TerminalController(TerminalService terminalService, CurrentUser currentUser) {
        this.terminalService = terminalService;
        this.currentUser = currentUser;
    }

    public record SetupRequest(String sshUser, String password) {}

    @GetMapping("/status")
    public TerminalService.Status status() {
        return terminalService.status(currentUser.id());
    }

    @PostMapping("/setup")
    public TerminalService.Status setup(@RequestBody SetupRequest req) {
        return terminalService.setup(currentUser.id(), req.sshUser(), req.password());
    }
}
