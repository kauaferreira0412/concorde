package com.codagis.concorde.controller;

import com.codagis.concorde.domain.MusicBotSettings;
import com.codagis.concorde.domain.SoundboardBotSettings;
import com.codagis.concorde.service.MusicBotSettingsService;
import com.codagis.concorde.service.SoundboardBotSettingsService;
import com.codagis.concorde.ws.VoicePresenceService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/internal/music-bot")
public class MusicBotInternalController {

    private final VoicePresenceService voicePresenceService;
    private final MusicBotSettingsService musicBotSettingsService;
    private final SoundboardBotSettingsService soundboardBotSettingsService;
    private final SimpMessagingTemplate messagingTemplate;

    public MusicBotInternalController(VoicePresenceService voicePresenceService,
                                       MusicBotSettingsService musicBotSettingsService,
                                       SoundboardBotSettingsService soundboardBotSettingsService,
                                       SimpMessagingTemplate messagingTemplate) {
        this.voicePresenceService = voicePresenceService;
        this.musicBotSettingsService = musicBotSettingsService;
        this.soundboardBotSettingsService = soundboardBotSettingsService;
        this.messagingTemplate = messagingTemplate;
    }

    public record PresenceRequest(boolean joined) {}

    @PostMapping("/{channelId}/presence")
    public void presence(@PathVariable Long channelId, @RequestBody PresenceRequest req) {
        if (req.joined()) {
            MusicBotSettings settings = musicBotSettingsService.get();
            voicePresenceService.joinBot(channelId, "Melodion", settings.getAvatarUrl());
        } else {
            voicePresenceService.leaveBot(channelId);
        }
    }

    // Batera (bot do soundboard) - participante SEPARADO do Melodion no LiveKit (ver
    // music-bot/src/soundboardSession.js), por isso tem sua propria rota de presenca aqui.
    @PostMapping("/{channelId}/soundboard-presence")
    public void soundboardPresence(@PathVariable Long channelId, @RequestBody PresenceRequest req) {
        if (req.joined()) {
            SoundboardBotSettings settings = soundboardBotSettingsService.get();
            voicePresenceService.joinSoundboardBot(channelId, "Batera", settings.getAvatarUrl());
        } else {
            voicePresenceService.leaveSoundboardBot(channelId);
        }
    }

    @PostMapping("/{channelId}/queue")
    public void queue(@PathVariable Long channelId, @RequestBody Map<String, Object> payload) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".music.queue", payload);
    }
}
