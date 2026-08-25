package com.codagis.concorde.controller;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.SoundboardClip;
import com.codagis.concorde.dto.SoundboardDtos.ClipResponse;
import com.codagis.concorde.enums.ChannelType;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.SoundboardService;
import com.codagis.concorde.ws.VoicePresenceService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
public class SoundboardController {

    private final SoundboardService soundboardService;
    private final CurrentUser currentUser;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final VoicePresenceService voicePresenceService;
    private final String musicBotUrl;
    private final RestTemplate restTemplate = new RestTemplate();

    public SoundboardController(SoundboardService soundboardService, CurrentUser currentUser,
                                 ChannelRepository channelRepository, MembershipRepository membershipRepository,
                                 VoicePresenceService voicePresenceService,
                                 @Value("${app.music-bot.url}") String musicBotUrl) {
        this.soundboardService = soundboardService;
        this.currentUser = currentUser;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.voicePresenceService = voicePresenceService;
        this.musicBotUrl = musicBotUrl;
    }

    @GetMapping("/api/soundboard")
    public List<ClipResponse> listMine() {
        return soundboardService.listMyClips(currentUser.id());
    }

    @PostMapping(value = "/api/soundboard", consumes = "multipart/form-data")
    public ClipResponse upload(@RequestParam("file") MultipartFile file, @RequestParam(value = "name", required = false) String name) {
        return soundboardService.uploadClip(currentUser.id(), file, name);
    }

    @DeleteMapping("/api/soundboard/{clipId}")
    public void delete(@PathVariable Long clipId) {
        soundboardService.deleteClip(currentUser.id(), clipId);
    }

    @PostMapping("/api/channels/{channelId}/soundboard/play/{clipId}")
    public void play(@PathVariable Long channelId, @PathVariable Long clipId) {
        Long userId = currentUser.id();
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        if (channel.getType() != ChannelType.VOICE) {
            throw new IllegalArgumentException("Soundboard só funciona em canal de voz");
        }
        membershipRepository.findByServerIdAndUserId(channel.getServerId(), userId)
                .orElseThrow(() -> new IllegalStateException("Você não é membro desse servidor"));
        if (!voicePresenceService.isPresent(channelId, userId)) {
            throw new IllegalStateException("Você precisa estar conectado nessa call para tocar um som");
        }

        SoundboardClip clip = soundboardService.requireOwned(userId, clipId);

        try {
            restTemplate.postForObject(musicBotUrl + "/soundboard/play", Map.of("channelId", channelId, "url", clip.getFileUrl()), Map.class);
        } catch (RestClientException e) {
            throw new IllegalStateException("Não foi possível tocar o som agora - tente de novo em instantes");
        }
    }
}
