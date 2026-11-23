package com.codagis.concorde.controller;

import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.SteamService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.HtmlUtils;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/steam")
public class SteamController {

    private static final int MAX_BATCH = 300;

    private final SteamService steamService;
    private final CurrentUser currentUser;

    public SteamController(SteamService steamService, CurrentUser currentUser) {
        this.steamService = steamService;
        this.currentUser = currentUser;
    }

    public record LoginUrlResponse(String url) {}
    public record PlayingBatchRequest(List<Long> userIds) {}

    @GetMapping("/status")
    public SteamService.Status status() {
        return steamService.status(currentUser.id());
    }

    @GetMapping("/login-url")
    public LoginUrlResponse loginUrl() {
        return new LoginUrlResponse(steamService.loginUrl(currentUser.id()));
    }

    @DeleteMapping("/connection")
    public void disconnect() {
        steamService.disconnect(currentUser.id());
    }

    @PostMapping("/playing/batch")
    public Map<Long, SteamService.Game> playingBatch(@RequestBody PlayingBatchRequest req) {
        Set<Long> ids = req.userIds() == null ? Set.of()
                : req.userIds().stream().limit(MAX_BATCH).collect(Collectors.toSet());
        return steamService.playingBatch(ids);
    }

    @GetMapping("/profile/{userId}")
    public SteamService.Profile profile(@PathVariable Long userId) {
        return steamService.profile(userId);
    }

    /** Volta do login da Steam (aberto numa aba/navegador externo, sem o token do Concorde). */
    @GetMapping(value = "/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> callback(@RequestParam Map<String, String> params) {
        try {
            steamService.handleCallback(params);
            return ResponseEntity.ok(page("Steam conectada! 🎮",
                    "Sua conta foi vinculada com sucesso. Pode fechar essa aba e voltar pro Concorde."));
        } catch (Exception e) {
            String message = e instanceof IllegalStateException && e.getMessage() != null
                    ? e.getMessage()
                    : "Não foi possível conectar sua conta da Steam. Feche essa aba e tente de novo.";
            return ResponseEntity.ok(page("Não deu certo", message));
        }
    }

    private String page(String title, String message) {
        return "<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<title>" + HtmlUtils.htmlEscape(title) + "</title>"
                + "<style>"
                + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0c0c14;color:#e6e6f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}"
                + ".card{max-width:380px}"
                + "h1{font-size:22px;margin:0 0 12px}"
                + "p{font-size:14px;line-height:1.5;color:#a9a9bd;margin:0}"
                + "</style></head><body><div class=\"card\">"
                + "<h1>" + HtmlUtils.htmlEscape(title) + "</h1><p>" + HtmlUtils.htmlEscape(message) + "</p>"
                + "</div><script>setTimeout(function(){window.close();}, 2500);</script>"
                + "</body></html>";
    }
}
