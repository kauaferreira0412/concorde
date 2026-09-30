package com.codagis.concorde.controller;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.enums.ChannelType;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.PermissionService;
import com.codagis.concorde.service.SpotifyService;
import com.codagis.concorde.ws.VoicePresenceService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/channels")
public class MusicController {

    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final VoicePresenceService voicePresenceService;
    private final CurrentUser currentUser;
    private final SpotifyService spotifyService;
    private final PermissionService permissionService;
    private final String musicBotUrl;
    private final RestTemplate restTemplate = new RestTemplate();

    public MusicController(ChannelRepository channelRepository, MembershipRepository membershipRepository,
                            VoicePresenceService voicePresenceService, CurrentUser currentUser,
                            SpotifyService spotifyService, PermissionService permissionService,
                            @Value("${app.music-bot.url}") String musicBotUrl) {
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.voicePresenceService = voicePresenceService;
        this.currentUser = currentUser;
        this.spotifyService = spotifyService;
        this.permissionService = permissionService;
        this.musicBotUrl = musicBotUrl;
    }

    public record PlayRequest(String query) {}
    public record PlayResponse(String title, Integer durationSec, boolean queued) {}
    public record RemoveFromQueueRequest(int index) {}
    public record OpenQueueRequest(String name) {}
    public record VolumeRequest(int volume) {}

    @PostMapping("/{channelId}/music/play")
    public PlayResponse play(@PathVariable Long channelId, @RequestBody PlayRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        if (req.query() == null || req.query().isBlank()) {
            throw new IllegalArgumentException("Informe um link ou o nome da música");
        }
        String resolvedQuery = spotifyService.resolveIfSpotifyTrack(req.query());
        String query = resolvedQuery != null ? resolvedQuery : req.query();
        Map<String, Object> body = Map.of("channelId", channelId, "query", query);
        Map<?, ?> response = callBot("/play", body);
        Object durationRaw = response.get("durationSec");
        Integer durationSec = durationRaw == null ? null : ((Number) durationRaw).intValue();
        boolean queued = Boolean.TRUE.equals(response.get("queued"));
        return new PlayResponse((String) response.get("title"), durationSec, queued);
    }

    @GetMapping("/{channelId}/music/queue")
    public Map<?, ?> queue(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        boolean canSetVolume = permissionService.isOwnerOrGlobalAdmin(channel.getServerId(), currentUser.id());
        Map<String, Object> empty = new HashMap<>();
        empty.put("queueId", null);
        empty.put("active", false);
        empty.put("name", null);
        empty.put("nowPlaying", null);
        empty.put("queue", List.of());
        empty.put("volume", 100);
        empty.put("canSetVolume", canSetVolume);
        try {
            Map response = restTemplate.getForObject(musicBotUrl + "/queue/" + channelId, Map.class);
            if (response == null) return empty;
            Map<String, Object> merged = new HashMap<>(response);
            merged.put("canSetVolume", canSetVolume);
            return merged;
        } catch (RestClientException e) {
            return empty;
        }
    }

    @PostMapping("/{channelId}/music/queue/open")
    public Map<?, ?> openQueue(@PathVariable Long channelId, @RequestBody(required = false) OpenQueueRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        String name = req == null || req.name() == null ? "" : req.name();
        return callBot("/queue/" + channelId + "/open", Map.of("name", name));
    }

    @PostMapping("/{channelId}/music/queue/delete")
    public void deleteQueue(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/queue/" + channelId + "/delete", Map.of());
    }

    @PostMapping("/{channelId}/music/queue/remove")
    public void removeFromQueue(@PathVariable Long channelId, @RequestBody RemoveFromQueueRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/queue/" + channelId + "/remove", Map.of("index", req.index()));
    }

    @PostMapping("/{channelId}/music/stop")
    public void stop(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/stop", Map.of("channelId", channelId));
    }

    @PostMapping("/{channelId}/music/skip")
    public void skip(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/skip", Map.of("channelId", channelId));
    }

    @PostMapping("/{channelId}/music/pause")
    public void pause(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/pause", Map.of("channelId", channelId, "paused", true));
    }

    @PostMapping("/{channelId}/music/resume")
    public void resume(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/pause", Map.of("channelId", channelId, "paused", false));
    }

    @PostMapping("/{channelId}/music/volume")
    public void volume(@PathVariable Long channelId, @RequestBody VolumeRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        assertIsMaster(channel);
        int clamped = Math.max(0, Math.min(100, req.volume()));
        callBot("/volume", Map.of("channelId", channelId, "volume", clamped));
    }

    private Channel requireVoiceChannel(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        if (channel.getType() != ChannelType.VOICE) {
            throw new IllegalArgumentException("Música só funciona em canal de voz");
        }
        return channel;
    }

    private void assertCanControlMusic(Channel channel) {
        Long userId = currentUser.id();
        membershipRepository.findByServerIdAndUserId(channel.getServerId(), userId)
                .orElseThrow(() -> new IllegalStateException("Você não é membro desse servidor"));
        if (!voicePresenceService.isPresent(channel.getId(), userId)) {
            throw new IllegalStateException("Você precisa estar conectado nessa call para tocar música");
        }
    }

    private void assertIsMaster(Channel channel) {
        if (!permissionService.isOwnerOrGlobalAdmin(channel.getServerId(), currentUser.id())) {
            throw new IllegalStateException("Só o dono do servidor pode ajustar o volume geral do bot");
        }
    }

    private Map<?, ?> callBot(String path, Map<String, Object> body) {
        try {
            Map<?, ?> response = restTemplate.postForObject(musicBotUrl + path, body, Map.class);
            return response == null ? Map.of() : response;
        } catch (HttpStatusCodeException e) {
            String message;
            try {
                message = String.valueOf(e.getResponseBodyAs(Map.class).get("error"));
            } catch (Exception parseErr) {
                message = "Não foi possível tocar essa música";
            }
            throw new IllegalStateException(message);
        } catch (RestClientException e) {
            throw new IllegalStateException("Não foi possível falar com o bot de música agora - tente de novo em instantes");
        }
    }
}
