package com.codagis.concorde.service;

import com.codagis.concorde.repository.UserRepository;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "Ouvir junto": coloca no Spotify de quem está ouvindo (listener) a mesma música, no mesmo ponto,
 * de quem está compartilhando (host). O frontend chama {@link #sync} a cada poucos segundos enquanto
 * a sessão está ativa; aqui só corrige o player do listener quando ele saiu de sincronia.
 *
 * Limitações do Spotify: o listener precisa ser Premium e ter o Spotify aberto em algum aparelho.
 */
@Service
public class SpotifyListenAlongService {

    private static final String PLAYER_URL = "https://api.spotify.com/v1/me/player";
    /** Diferença tolerada antes de reposicionar a música (evita ficar "pulando" o tempo todo). */
    private static final int DRIFT_TOLERANCE_MS = 3_000;
    /** Compensa o tempo entre ler a posição do host e o comando chegar no player do listener. */
    private static final int LATENCY_COMPENSATION_MS = 400;

    private final SpotifyService spotifyService;
    private final UserRepository userRepository;
    private final RestTemplate restTemplate = new RestTemplate();
    private final Map<Long, Session> sessions = new ConcurrentHashMap<>();

    public SpotifyListenAlongService(SpotifyService spotifyService, UserRepository userRepository) {
        this.spotifyService = spotifyService;
        this.userRepository = userRepository;
    }

    public State start(Long listenerId, Long hostId) {
        if (listenerId.equals(hostId)) {
            throw new IllegalArgumentException("Você não pode ouvir junto com você mesmo");
        }
        if (!spotifyService.isConnected(listenerId)) {
            throw new IllegalArgumentException("Conecte seu Spotify em Configurações → Conexões para ouvir junto.");
        }
        if (!spotifyService.canControlPlayback(listenerId)) {
            throw new IllegalArgumentException(
                    "Reconecte seu Spotify em Configurações → Conexões para liberar o \"Ouvir junto\" (precisa de uma permissão nova).");
        }
        String hostName = displayName(hostId);
        SpotifyService.NowPlaying host = spotifyService.freshNowPlaying(hostId);
        if (!host.connected() || host.trackUri() == null) {
            throw new IllegalArgumentException(hostName + " não está ouvindo nada no Spotify agora.");
        }
        sessions.put(listenerId, new Session(hostId, hostName, null, false));
        try {
            return sync(listenerId, true);
        } catch (IllegalArgumentException e) {
            sessions.remove(listenerId);
            throw e;
        }
    }

    public State sync(Long listenerId) {
        return sync(listenerId, false);
    }

    public void stop(Long listenerId) {
        sessions.remove(listenerId);
    }

    public State current(Long listenerId) {
        Session session = sessions.get(listenerId);
        return session == null ? State.inactive() : new State(true, session.hostId, session.hostName, "IN_SYNC",
                null, null, null, null, null);
    }

    private State sync(Long listenerId, boolean firstSync) {
        Session session = sessions.get(listenerId);
        if (session == null) return State.inactive();

        SpotifyService.NowPlaying host = spotifyService.freshNowPlaying(session.hostId);
        if (!host.connected()) {
            return end(listenerId, session, session.hostName + " desconectou o Spotify.");
        }
        if (host.trackUri() == null) {
            return end(listenerId, session, session.hostName + " parou de ouvir música.");
        }

        String token = spotifyService.accessTokenFor(listenerId);
        if (token == null) {
            return end(listenerId, session, "Sua conexão com o Spotify expirou - conecte de novo em Configurações.");
        }

        Map<String, Object> mine = currentPlayback(token);
        String myUri = mine == null ? null : uriOf(mine);
        boolean myPlaying = mine != null && Boolean.TRUE.equals(mine.get("is_playing"));
        int myProgress = mine == null || !(mine.get("progress_ms") instanceof Number n) ? 0 : n.intValue();

        // a pessoa mexeu no próprio player: trocou de música ou pausou -> sai do "ouvir junto", igual no Discord
        if (!firstSync && session.lastUri != null) {
            boolean changedTrack = myUri != null && !myUri.equals(session.lastUri) && !myUri.equals(host.trackUri());
            boolean pausedByHand = session.lastPlaying && !myPlaying && host.playing() && session.lastUri.equals(myUri);
            if (changedTrack || pausedByHand) {
                return end(listenerId, session, "Você mexeu no seu Spotify, então o \"Ouvir junto\" parou.");
            }
        }

        try {
            if (!host.playing()) {
                if (myPlaying) pause(token);
                session.lastUri = host.trackUri();
                session.lastPlaying = false;
                return state(session, "HOST_PAUSED", host);
            }

            int hostProgress = (host.progressMs() == null ? 0 : host.progressMs()) + LATENCY_COMPENSATION_MS;
            boolean outOfSync = !host.trackUri().equals(myUri)
                    || !myPlaying
                    || Math.abs(myProgress - hostProgress) > DRIFT_TOLERANCE_MS;
            session.lastUri = host.trackUri();
            session.lastPlaying = true;
            if (!outOfSync) return state(session, "IN_SYNC", host);

            play(token, host.trackUri(), hostProgress);
            return state(session, "SYNCED", host);
        } catch (PlaybackException e) {
            if (firstSync) throw new IllegalArgumentException(e.getMessage());
            return end(listenerId, session, e.getMessage());
        }
    }

    /* ------------------------------------------------------------------ chamadas ao Spotify */

    @SuppressWarnings("unchecked")
    private Map<String, Object> currentPlayback(String token) {
        try {
            var response = restTemplate.exchange(PLAYER_URL, HttpMethod.GET, new HttpEntity<>(auth(token)), Map.class);
            if (response.getStatusCode() == HttpStatus.NO_CONTENT) return null;
            return (Map<String, Object>) response.getBody();
        } catch (RestClientException e) {
            return null;
        }
    }

    private void play(String token, String trackUri, int positionMs) {
        Map<String, Object> body = new HashMap<>();
        body.put("uris", List.of(trackUri));
        body.put("position_ms", Math.max(0, positionMs));
        try {
            send(HttpMethod.PUT, PLAYER_URL + "/play", token, body);
        } catch (NoActiveDeviceException e) {
            // nenhum aparelho "ativo": tenta acordar o primeiro aparelho disponível da pessoa
            String deviceId = firstAvailableDevice(token);
            if (deviceId == null) {
                throw new PlaybackException("Abra o Spotify em algum aparelho (PC, celular ou web) e tente de novo.");
            }
            send(HttpMethod.PUT, PLAYER_URL + "/play?device_id=" + deviceId, token, body);
        }
    }

    private void pause(String token) {
        try {
            send(HttpMethod.PUT, PLAYER_URL + "/pause", token, null);
        } catch (NoActiveDeviceException ignored) {
            // nada tocando - nada pra pausar
        }
    }

    private void send(HttpMethod method, String url, String token, Object body) {
        HttpHeaders headers = auth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            restTemplate.exchange(url, method, new HttpEntity<>(body, headers), String.class);
        } catch (HttpClientErrorException e) {
            String response = e.getResponseBodyAsString();
            if (e.getStatusCode() == HttpStatus.NOT_FOUND || response.contains("NO_ACTIVE_DEVICE")) {
                throw new NoActiveDeviceException();
            }
            if (response.contains("PREMIUM_REQUIRED")) {
                throw new PlaybackException("O \"Ouvir junto\" precisa de Spotify Premium - o Spotify só deixa controlar o player de contas Premium.");
            }
            if (e.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                throw new PlaybackException("Sua conexão com o Spotify expirou - conecte de novo em Configurações.");
            }
            if (e.getStatusCode() == HttpStatus.FORBIDDEN) {
                throw new PlaybackException(
                        "O Spotify recusou o comando. Reconecte seu Spotify em Configurações (e confira se a conta é Premium).");
            }
            throw new PlaybackException("Não foi possível controlar seu Spotify agora - tente de novo em instantes.");
        } catch (RestClientException e) {
            throw new PlaybackException("Não foi possível falar com o Spotify agora - tente de novo em instantes.");
        }
    }

    @SuppressWarnings("unchecked")
    private String firstAvailableDevice(String token) {
        try {
            var response = restTemplate.exchange(PLAYER_URL + "/devices", HttpMethod.GET, new HttpEntity<>(auth(token)), Map.class);
            Map<String, Object> body = response.getBody();
            List<Map<String, Object>> devices = body == null ? null : (List<Map<String, Object>>) body.get("devices");
            if (devices == null) return null;
            return devices.stream()
                    .filter(d -> !Boolean.TRUE.equals(d.get("is_restricted")) && d.get("id") != null)
                    .map(d -> String.valueOf(d.get("id")))
                    .findFirst()
                    .orElse(null);
        } catch (RestClientException | ClassCastException e) {
            return null;
        }
    }

    private HttpHeaders auth(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    @SuppressWarnings("unchecked")
    private static String uriOf(Map<String, Object> playback) {
        Object item = playback.get("item");
        if (!(item instanceof Map<?, ?> map)) return null;
        Object uri = ((Map<String, Object>) map).get("uri");
        return uri == null ? null : String.valueOf(uri);
    }

    /* ------------------------------------------------------------------ estado */

    private State end(Long listenerId, Session session, String message) {
        sessions.remove(listenerId);
        return new State(false, session.hostId, session.hostName, "ENDED", message, null, null, null, null);
    }

    private State state(Session session, String status, SpotifyService.NowPlaying host) {
        return new State(true, session.hostId, session.hostName, status, null,
                host.trackName(), host.artistNames(), host.albumArtUrl(), host.trackUrl());
    }

    private String displayName(Long userId) {
        return userRepository.findById(userId)
                .map(u -> u.getNickname() != null && !u.getNickname().isBlank() ? u.getNickname() : u.getUsername())
                .orElse("Essa pessoa");
    }

    private static final class Session {
        final Long hostId;
        final String hostName;
        volatile String lastUri;
        volatile boolean lastPlaying;

        Session(Long hostId, String hostName, String lastUri, boolean lastPlaying) {
            this.hostId = hostId;
            this.hostName = hostName;
            this.lastUri = lastUri;
            this.lastPlaying = lastPlaying;
        }
    }

    private static class PlaybackException extends RuntimeException {
        PlaybackException(String message) {
            super(message);
        }
    }

    private static final class NoActiveDeviceException extends PlaybackException {
        NoActiveDeviceException() {
            super("Abra o Spotify em algum aparelho (PC, celular ou web) e tente de novo.");
        }
    }

    /**
     * status: SYNCED (acabou de ajustar o player), IN_SYNC, HOST_PAUSED, ENDED (sessão acabou; message diz o porquê).
     */
    public record State(boolean active, Long hostId, String hostName, String status, String message,
                        String trackName, String artistNames, String albumArtUrl, String trackUrl) {
        static State inactive() {
            return new State(false, null, null, "ENDED", null, null, null, null, null);
        }
    }
}
