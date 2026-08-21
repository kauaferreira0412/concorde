package com.codagis.discordclone.controller;

import com.codagis.discordclone.ws.VoicePresenceService;
import org.springframework.web.bind.annotation.*;

/**
 * Endpoint INTERNO, chamado pelo proprio bot de musica (music-bot/index.js), nao pelo
 * frontend - avisa "entrei/saí de verdade da call" pra o bot aparecer na lista de presenca de
 * voz (ver VoicePresenceService.joinBot/leaveBot) igual qualquer outro participante. Nao usa
 * o fluxo normal de autenticacao (JWT de usuario) porque o bot nao e' um usuario logado - so'
 * e' alcancavel de dentro da rede interna do Docker (ver MUSIC_BOT_URL/BACKEND_URL nos
 * compose*.yml), o mesmo nivel de confianca que o backend ja' usa pra falar com o bot no outro
 * sentido (MusicController tambem nao manda nenhum segredo pro bot hoje).
 */
@RestController
@RequestMapping("/internal/music-bot")
public class MusicBotInternalController {

    private final VoicePresenceService voicePresenceService;

    public MusicBotInternalController(VoicePresenceService voicePresenceService) {
        this.voicePresenceService = voicePresenceService;
    }

    public record PresenceRequest(boolean joined) {}

    @PostMapping("/{channelId}/presence")
    public void presence(@PathVariable Long channelId, @RequestBody PresenceRequest req) {
        if (req.joined()) {
            voicePresenceService.joinBot(channelId);
        } else {
            voicePresenceService.leaveBot(channelId);
        }
    }
}
