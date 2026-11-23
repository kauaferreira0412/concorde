package com.codagis.concorde.controller;

import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.ChangelogService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/changelog")
public class ChangelogController {

    private final ChangelogService changelogService;
    private final CurrentUser currentUser;

    public ChangelogController(ChangelogService changelogService, CurrentUser currentUser) {
        this.changelogService = changelogService;
        this.currentUser = currentUser;
    }

    public record PreferenceRequest(boolean showOnOpen) {}
    public record PreferenceResponse(boolean showOnOpen) {}

    /** Versão nova pra abrir sozinha ao entrar (204 = nada novo, ou a pessoa desligou o modal). */
    @GetMapping("/pending")
    public ResponseEntity<ChangelogService.Entry> pending() {
        return changelogService.pendingFor(currentUser.id())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping
    public List<ChangelogService.Summary> list() {
        return changelogService.list();
    }

    @GetMapping("/{version}")
    public ResponseEntity<ChangelogService.Entry> get(@PathVariable String version) {
        return changelogService.get(version)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{version}/seen")
    public void markSeen(@PathVariable String version) {
        if (changelogService.get(version).isPresent()) {
            changelogService.markSeen(currentUser.id(), version);
        }
    }

    @GetMapping("/preference")
    public PreferenceResponse preference() {
        return new PreferenceResponse(changelogService.showOnOpen(currentUser.id()));
    }

    @PutMapping("/preference")
    public PreferenceResponse setPreference(@RequestBody PreferenceRequest req) {
        changelogService.setShowOnOpen(currentUser.id(), req.showOnOpen());
        return new PreferenceResponse(req.showOnOpen());
    }
}
