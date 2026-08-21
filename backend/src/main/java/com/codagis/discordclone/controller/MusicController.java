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

import java.util.HashMap;
import java.util.List;
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
    /** queued=true quando so' entrou na FILA (ja' tinha algo tocando nesse canal) - false
     *  quando comecou a tocar na hora (ver MusicController.play/music-bot/index.js enqueue). */
    public record PlayResponse(String title, Integer durationSec, boolean queued) {}
    public record RemoveFromQueueRequest(int index) {}
    public record OpenQueueRequest(String name) {}

    /** Link (YouTube/etc, o que o yt-dlp suportar) ou busca livre (o bot resolve pro primeiro
     *  resultado) - entra tocando na hora se a call estiver ociosa, ou no FIM da fila se ja'
     *  tiver algo tocando (ver /fila no ChatWindow.jsx e MusicQueueCard.jsx). */
    @PostMapping("/{channelId}/music/play")
    public PlayResponse play(@PathVariable Long channelId, @RequestBody PlayRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        if (req.query() == null || req.query().isBlank()) {
            throw new IllegalArgumentException("Informe um link ou o nome da música");
        }
        Map<String, Object> body = Map.of("channelId", channelId, "query", req.query());
        Map<?, ?> response = callBot("/play", body);
        Object durationRaw = response.get("durationSec");
        Integer durationSec = durationRaw == null ? null : ((Number) durationRaw).intValue();
        boolean queued = Boolean.TRUE.equals(response.get("queued"));
        return new PlayResponse((String) response.get("title"), durationSec, queued);
    }

    /** Estado atual da fila (o que esta tocando + o que vem depois) - so' pro card carregar
     *  quando abre (ver MusicQueueCard.jsx); atualizacoes ao vivo depois disso vem por
     *  WebSocket (ver MusicBotInternalController.queue). */
    @GetMapping("/{channelId}/music/queue")
    public Map<?, ?> queue(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        Map<String, Object> empty = new HashMap<>();
        empty.put("queueId", null);
        empty.put("active", false);
        empty.put("name", null);
        empty.put("nowPlaying", null);
        empty.put("queue", List.of());
        try {
            Map<?, ?> response = restTemplate.getForObject(musicBotUrl + "/queue/" + channelId, Map.class);
            return response == null ? empty : response;
        } catch (RestClientException e) {
            return empty;
        }
    }

    /** Abre a fila desse canal - ENCERRA automaticamente qualquer fila que ja estivesse aberta
     *  (nao precisa apagar na mao antes, ver /open no bot). devolve o "queueId" novo, que o
     *  frontend embute no marcador da mensagem-card (ver ChatWindow.jsx/MusicQueueCard.jsx) -
     *  e' assim que o card sabe se ainda e' a fila ATUAL ou se ja foi substituida por outra
     *  (nesse caso se tranca sozinho como "encerrada", em vez de virar a fila nova na tela).
     *  Nome e' opcional, so' aparece no titulo do card. */
    @PostMapping("/{channelId}/music/queue/open")
    public Map<?, ?> openQueue(@PathVariable Long channelId, @RequestBody(required = false) OpenQueueRequest req) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        String name = req == null || req.name() == null ? "" : req.name();
        return callBot("/queue/" + channelId + "/open", Map.of("name", name));
    }

    /** Encerra a fila inteira (descarta tudo que ainda nao tocou) e libera pra abrir uma nova -
     *  a musica que estiver tocando agora continua, so' as PROXIMAS somem. O card dessa fila no
     *  chat NAO e' apagado - so' passa a mostrar "encerrada" sozinho (ver /open acima e
     *  MusicQueueCard.jsx). PUBLICO, qualquer membro conectado na call pode encerrar. */
    @PostMapping("/{channelId}/music/queue/delete")
    public void deleteQueue(@PathVariable Long channelId) {
        Channel channel = requireVoiceChannel(channelId);
        assertCanControlMusic(channel);
        callBot("/queue/" + channelId + "/delete", Map.of());
    }

    /** A fila e' PUBLICA - qualquer membro conectado nessa call pode tirar qualquer musica
     *  dela, sem exigir nenhuma permissao especial de moderacao (pedido explicito do usuario). */
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

    /** Pula pra proxima musica da fila (ou fica quieto se estiver vazia) - PUBLICO, qualquer
     *  membro conectado na call pode pular, nao so' quem pediu a musica atual (pedido explicito
     *  do usuario, mesma regra da fila em si). */
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
