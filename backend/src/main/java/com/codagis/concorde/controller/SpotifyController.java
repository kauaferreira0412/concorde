package com.codagis.concorde.controller;

import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.SpotifyService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Integracao com o Spotify - conectar/desconectar (opt-in, ver SettingsModal.jsx) e consultar
 * "o que essa pessoa esta' ouvindo agora" (lista de membros/perfil/comando "/spotify", ver
 * SpotifyService pro fluxo OAuth completo).
 */
@RestController
@RequestMapping("/api/spotify")
public class SpotifyController {

    private final SpotifyService spotifyService;
    private final CurrentUser currentUser;

    public SpotifyController(SpotifyService spotifyService, CurrentUser currentUser) {
        this.spotifyService = spotifyService;
        this.currentUser = currentUser;
    }

    public record StatusResponse(boolean configured, boolean connected) {}
    public record AuthorizeResponse(String url) {}
    public record NowPlayingBatchRequest(List<Long> userIds) {}

    @GetMapping("/status")
    public StatusResponse status() {
        return new StatusResponse(spotifyService.isConfigured(), spotifyService.isConnected(currentUser.id()));
    }

    @GetMapping("/authorize")
    public AuthorizeResponse authorize() {
        return new AuthorizeResponse(spotifyService.authorizeUrl(currentUser.id()));
    }

    @DeleteMapping("/connection")
    public void disconnect() {
        spotifyService.disconnect(currentUser.id());
    }

    @GetMapping("/now-playing/{userId}")
    public SpotifyService.NowPlaying nowPlaying(@PathVariable Long userId) {
        return spotifyService.nowPlaying(userId);
    }

    @PostMapping("/now-playing/batch")
    public Map<Long, SpotifyService.NowPlaying> nowPlayingBatch(@RequestBody NowPlayingBatchRequest req) {
        Set<Long> ids = req.userIds() == null ? Set.of() : req.userIds().stream().collect(Collectors.toSet());
        return spotifyService.nowPlayingBatch(ids);
    }

    /** PUBLICO (ver SecurityConfig) - e' o proprio Spotify que redireciona o NAVEGADOR pra ca'
     *  depois do usuario autorizar (ou cancelar), sem nenhum jeito de mandar o token JWT do
     *  Concorde junto. Devolve uma paginazinha HTML auto-suficiente (mesma tela seja aberta
     *  numa aba do navegador ou pelo navegador padrao do sistema, ver window.concordeDesktop.
     *  openExternal no app desktop) so' avisando que ja' pode fechar - quem identifica o
     *  usuario Concorde certo e' o "state" (ver SpotifyService.handleCallback). */
    @GetMapping(value = "/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> callback(@RequestParam(required = false) String code,
                                            @RequestParam(required = false) String state,
                                            @RequestParam(required = false) String error) {
        if (error != null) {
            return ResponseEntity.ok(page("Conexão cancelada", "Você cancelou a conexão com o Spotify. Pode fechar essa aba e tentar de novo quando quiser."));
        }
        try {
            spotifyService.handleCallback(code, state);
            return ResponseEntity.ok(page("Spotify conectado! 🎵", "Sua conta foi conectada com sucesso. Pode fechar essa aba e voltar pro Concorde."));
        } catch (Exception e) {
            return ResponseEntity.ok(page("Não deu certo", e.getMessage() != null ? e.getMessage() : "Não foi possível conectar sua conta do Spotify. Feche essa aba e tente de novo."));
        }
    }

    private String page(String title, String message) {
        return "<!doctype html><html><head><meta charset=\"utf-8\">"
                + "<title>" + title + "</title>"
                + "<style>"
                + "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;"
                + "background:#0c0c14;color:#e6e6f0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}"
                + ".card{max-width:380px}"
                + "h1{font-size:22px;margin:0 0 12px}"
                + "p{font-size:14px;line-height:1.5;color:#a9a9bd;margin:0}"
                + "</style></head><body><div class=\"card\">"
                + "<h1>" + title + "</h1><p>" + message + "</p>"
                + "</div><script>setTimeout(function(){window.close();}, 2500);</script>"
                + "</body></html>";
    }
}
