package com.codagis.discordclone.controller;

import com.codagis.discordclone.dto.VoiceDtos.VoiceTokenResponse;
import com.codagis.discordclone.repository.UserRepository;
import com.codagis.discordclone.security.CurrentUser;
import com.codagis.discordclone.service.DisplayNameService;
import com.codagis.discordclone.service.LiveKitService;
import com.codagis.discordclone.ws.VoiceParticipantInfo;
import com.codagis.discordclone.ws.VoicePresenceService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/channels")
public class VoiceController {

    private final LiveKitService liveKitService;
    private final CurrentUser currentUser;
    private final UserRepository userRepository;
    private final VoicePresenceService voicePresenceService;
    private final DisplayNameService displayNameService;

    public VoiceController(LiveKitService liveKitService, CurrentUser currentUser, UserRepository userRepository,
                            VoicePresenceService voicePresenceService, DisplayNameService displayNameService) {
        this.liveKitService = liveKitService;
        this.currentUser = currentUser;
        this.userRepository = userRepository;
        this.voicePresenceService = voicePresenceService;
        this.displayNameService = displayNameService;
    }

    /** Snapshot de quem esta conectado nesse canal de voz agora - usado pra popular a UI antes de qualquer evento chegar via WebSocket. */
    @GetMapping("/{channelId}/voice-presence")
    public List<VoiceParticipantInfo> getVoicePresence(@PathVariable Long channelId) {
        return voicePresenceService.snapshot(channelId);
    }

    /** O frontend chama isso ao clicar em um canal de voz, e usa o token para conectar no LiveKit. */
    @PostMapping("/{channelId}/voice-token")
    public VoiceTokenResponse getVoiceToken(@PathVariable Long channelId) {
        Long userId = currentUser.id();
        var user = userRepository.findById(userId);
        // Apelido DESSE servidor primeiro, senao o apelido global, senao o username puro -
        // ver DisplayNameService. Antes disso, o nome dentro da call (LiveKit) sempre usava
        // so' o username, ignorando qualquer apelido configurado em Configuracoes.
        String displayName = displayNameService.resolveForChannel(channelId, userId);
        String avatarUrl = user.map(u -> u.getAvatarUrl()).orElse(null);

        String room = "channel-" + channelId;
        String identity = "user-" + userId;
        String token = liveKitService.generateAccessToken(room, identity, displayName, avatarUrl);

        return new VoiceTokenResponse(token, liveKitService.getWsUrl(), room, identity);
    }
}
