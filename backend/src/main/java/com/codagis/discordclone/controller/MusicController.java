package com.codagis.discordclone.controller;

import com.codagis.discordclone.domain.Channel;
import com.codagis.discordclone.domain.ChannelType;
import com.codagis.discordclone.repository.ChannelRepository;
import com.codagis.discordclone.repository.MembershipRepository;
import com.codagis.discordclone.security.CurrentUser;
import com.codagis.discordclone.ws.VoicePresenceService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * So' um PROXY autenticado pro bot de musica (ver music-bot/index.js, servico Node separado -
 * o Spring Boot nao processa audio nenhum, so' autoriza quem pode mandar tocar/parar em qual
 * canal e repassa o pedido). O bot em si e' quem entra na call de verdade e publica o audio.
 */
@RestController
@RequestMapping("/api/channels")
public class MusicController {

    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final VoicePresenceService voicePresenceService;
    private final CurrentUser currentUser;
    private final String musicBotUrl;
    private final RestTemplate restTemplate = new RestTemplate();

    public MusicController(ChannelRepository channelRepository, MembershipRepository membershipRepository,
                            VoicePresenceService voicePresenceService, CurrentUser currentUser,
                            @Value("${app.music-bot.url}") String musicBotUrl) {
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.voicePresenceService = voicePresenceService;
        this.currentUser = currentUser;
        this.musicBotUrl = musicBotUrl;
    }

    public record PlayRequest(String query) {}
    public record PlayResponse(String title) {}

    /** Link (YouTube/etc, o que o yt-dlp suportar) ou busca livre (o bot resolve pro primeiro resultado). */
    @PostMapping("/{channelId}/music/play")
    public PlayResponse play(@PathVariable Long channelId, @RequestBody PlayRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        if (req.query() == null || req.query().isBlank()) {
            throw new IllegalArgumentException("Informe um link ou o nome da música");
        }
        Map<String, Object> body = Map.of("channelId", channelId, "query", req.query());
        Map<?, ?> response = callBot("/play", body);
        return new PlayResponse((String) response.get("title"));
    }

    @PostMapping("/{channelId}/music/stop")
    public void stop(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/stop", Map.of("channelId", channelId));
    }

    private Channel requireVoiceChannel(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        if (channel.getType() != ChannelType.VOICE) {
            throw new IllegalArgumentException("Música só funciona em canal de voz");
        }
        return channel;
    }

    /** Precisa ser membro do servidor E estar conectado NESSA call agora - nao faz sentido
     *  alguem de fora mandar tocar musica numa call que nem esta ouvindo. */
    private void assertCanControlMusic(Channel channel) {
        Long userId = currentUser.id();
        membershipRepository.findByServerIdAndUserId(channel.getServerId(), userId)
                .orElseThrow(() -> new IllegalStateException("Você não é membro desse servidor"));
        if (!voicePresenceService.isPresent(channel.getId(), userId)) {
            throw new IllegalStateException("Você precisa estar conectado nessa call para tocar música");
        }
    }

    private Map<?, ?> callBot(String path, Map<String, Object> body) {
        try {
            Map<?, ?> response = restTemplate.postForObject(musicBotUrl + path, body, Map.class);
            return response == null ? Map.of() : response;
        } catch (HttpStatusCodeException e) {
            // O bot devolveu um erro DE VERDADE (ex: "vídeo indisponível", "link inválido") -
            // extrai a mensagem dele em vez de mostrar so' um genérico "deu ruim".
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
