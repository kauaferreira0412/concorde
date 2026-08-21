package com.codagis.discordclone.controller;

import com.codagis.discordclone.domain.MusicBotSettings;
import com.codagis.discordclone.service.MusicBotSettingsService;
import com.codagis.discordclone.ws.VoicePresenceService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Endpoint INTERNO, chamado pelo proprio bot de musica (music-bot/index.js), nao pelo
 * frontend - avisa "entrei/saí de verdade da call" pra o bot aparecer na lista de presenca de
 * voz (ver VoicePresenceService.joinBot/leaveBot) igual qualquer outro participante, e retransmite
 * o estado da fila (ver MusicQueueCard.jsx) toda vez que ela muda. Nao usa o fluxo normal de
 * autenticacao (JWT de usuario) porque o bot nao e' um usuario logado - so' e' alcancavel de
 * dentro da rede interna do Docker (ver MUSIC_BOT_URL/BACKEND_URL nos compose*.yml), o mesmo
 * nivel de confianca que o backend ja' usa pra falar com o bot no outro sentido (MusicController
 * tambem nao manda nenhum segredo pro bot hoje).
 */
@RestController
@RequestMapping("/internal/music-bot")
public class MusicBotInternalController {

    private final VoicePresenceService voicePresenceService;
    private final MusicBotSettingsService musicBotSettingsService;
    private final SimpMessagingTemplate messagingTemplate;

    public MusicBotInternalController(VoicePresenceService voicePresenceService,
                                       MusicBotSettingsService musicBotSettingsService,
                                       SimpMessagingTemplate messagingTemplate) {
        this.voicePresenceService = voicePresenceService;
        this.musicBotSettingsService = musicBotSettingsService;
        this.messagingTemplate = messagingTemplate;
    }

    public record PresenceRequest(boolean joined) {}

    @PostMapping("/{channelId}/presence")
    public void presence(@PathVariable Long channelId, @RequestBody PresenceRequest req) {
        if (req.joined()) {
            // Nome fixo ("Melodion") + foto configurada pelo admin (ver MusicBotSettingsController) -
            // lido AQUI (nao guardado em VoicePresenceService, que e' so' presenca efemera) pra
            // trocar a foto valer na proxima vez que o bot entrar em QUALQUER call, sem reiniciar nada.
            MusicBotSettings settings = musicBotSettingsService.get();
            voicePresenceService.joinBot(channelId, "Melodion", settings.getAvatarUrl());
        } else {
            voicePresenceService.leaveBot(channelId);
        }
    }

    /** Corpo e' so' repassado pra frente ({@code {nowPlaying, queue}}, ja' pronto do jeito que
     *  o MusicQueueCard.jsx espera) - o bot e' quem monta o formato, o backend so' retransmite. */
    @PostMapping("/{channelId}/queue")
    public void queue(@PathVariable Long channelId, @RequestBody Map<String, Object> payload) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".music.queue", payload);
    }
}
