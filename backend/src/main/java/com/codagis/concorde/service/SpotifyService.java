package com.codagis.concorde.service;

import com.codagis.concorde.domain.SpotifyAccount;
import com.codagis.concorde.repository.SpotifyAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class SpotifyService {

    private static final String AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
    private static final String TOKEN_URL = "https://accounts.spotify.com/api/token";
    private static final String NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
    private static final String TRACK_URL = "https://api.spotify.com/v1/tracks/";
    private static final String SCOPE = "user-read-currently-playing user-read-playback-state";
    private static final Pattern SPOTIFY_TRACK_PATTERN =
            Pattern.compile("(?:open\\.spotify\\.com/(?:intl-\\w+/)?track/|spotify:track:)([a-zA-Z0-9]+)");
    private static final long CACHE_TTL_MILLIS = 8_000;
    private static final long PENDING_STATE_TTL_MILLIS = 10 * 60 * 1000;

    private final SpotifyAccountRepository accountRepository;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final RestTemplate restTemplate = new RestTemplate();

    private final Map<String, PendingState> pendingStates = new ConcurrentHashMap<>();
    private final Map<Long, CachedNowPlaying> nowPlayingCache = new ConcurrentHashMap<>();
    private volatile CachedAppToken appToken;

    public SpotifyService(SpotifyAccountRepository accountRepository,
                           @Value("${app.spotify.client-id}") String clientId,
                           @Value("${app.spotify.client-secret}") String clientSecret,
                           @Value("${app.spotify.redirect-uri}") String redirectUri) {
        this.accountRepository = accountRepository;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank() && clientSecret != null && !clientSecret.isBlank();
    }

    public boolean isConnected(Long userId) {
        return accountRepository.findByUserId(userId).isPresent();
    }

    public void disconnect(Long userId) {
        accountRepository.deleteByUserId(userId);
        nowPlayingCache.remove(userId);
    }

    public String authorizeUrl(Long userId) {
        if (!isConfigured()) {
            throw new IllegalStateException("Integração com Spotify não configurada no servidor");
        }
        purgeExpiredStates();
        String state = UUID.randomUUID().toString();
        pendingStates.put(state, new PendingState(userId, System.currentTimeMillis() + PENDING_STATE_TTL_MILLIS));
        return AUTHORIZE_URL + "?response_type=code"
                + "&client_id=" + encode(clientId)
                + "&scope=" + encode(SCOPE)
                + "&redirect_uri=" + encode(redirectUri)
                + "&state=" + encode(state);
    }

    public Long handleCallback(String code, String state) {
        PendingState pending = state == null ? null : pendingStates.remove(state);
        if (pending == null || pending.expiresAtMillis < System.currentTimeMillis()) {
            throw new IllegalStateException("Link de autorização expirado ou inválido - tente conectar de novo");
        }
        Map<String, Object> tokenResponse = requestToken(form(Map.of(
                "grant_type", "authorization_code",
                "code", code,
                "redirect_uri", redirectUri
        )));
        String accessToken = String.valueOf(tokenResponse.get("access_token"));
        String refreshToken = String.valueOf(tokenResponse.get("refresh_token"));
        int expiresIn = ((Number) tokenResponse.get("expires_in")).intValue();

        SpotifyAccount account = accountRepository.findByUserId(pending.userId).orElseGet(() ->
                SpotifyAccount.builder().userId(pending.userId).build());
        account.setAccessToken(accessToken);
        account.setRefreshToken(refreshToken);
        account.setExpiresAt(Instant.now().plusSeconds(expiresIn));
        if (account.getConnectedAt() == null) account.setConnectedAt(Instant.now());
        accountRepository.save(account);
        nowPlayingCache.remove(pending.userId);
        return pending.userId;
    }

    public NowPlaying nowPlaying(Long userId) {
        CachedNowPlaying cached = nowPlayingCache.get(userId);
        if (cached != null && cached.fetchedAtMillis + CACHE_TTL_MILLIS > System.currentTimeMillis()) {
            return cached.value;
        }
        NowPlaying result = fetchNowPlaying(userId);
        nowPlayingCache.put(userId, new CachedNowPlaying(result, System.currentTimeMillis()));
        return result;
    }

    public Map<Long, NowPlaying> nowPlayingBatch(Set<Long> userIds) {
        return userIds.stream()
                .map(id -> Map.entry(id, nowPlaying(id)))
                .filter(e -> e.getValue().playing())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public String resolveIfSpotifyTrack(String text) {
        if (text == null) return null;
        Matcher matcher = SPOTIFY_TRACK_PATTERN.matcher(text);
        if (!matcher.find()) return null;
        if (!isConfigured()) {
            throw new IllegalStateException("Integração com Spotify não configurada no servidor");
        }
        String trackId = matcher.group(1);
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(appAccessToken());
        try {
            var response = restTemplate.exchange(TRACK_URL + trackId, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
            Map<?, ?> body = response.getBody();
            if (body == null) throw new IllegalStateException("Música não encontrada no Spotify");
            String trackName = String.valueOf(body.get("name"));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> artists = (List<Map<String, Object>>) body.get("artists");
            String artistNames = artists == null ? "" : artists.stream()
                    .map(a -> String.valueOf(a.get("name")))
                    .collect(Collectors.joining(", "));
            String search = artistNames.isBlank() ? trackName : artistNames + " - " + trackName;
            return search.isBlank() ? null : search;
        } catch (HttpClientErrorException.NotFound e) {
            throw new IllegalStateException("Essa música não existe (ou não é mais pública) no Spotify");
        } catch (RestClientException e) {
            throw new IllegalStateException("Não foi possível consultar essa música no Spotify agora - tente de novo em instantes");
        }
    }

    private synchronized String appAccessToken() {
        if (appToken != null && appToken.expiresAt.isAfter(Instant.now().plusSeconds(60))) {
            return appToken.accessToken;
        }
        Map<String, Object> tokenResponse = requestToken(form(Map.of("grant_type", "client_credentials")));
        String accessToken = String.valueOf(tokenResponse.get("access_token"));
        int expiresIn = ((Number) tokenResponse.get("expires_in")).intValue();
        appToken = new CachedAppToken(accessToken, Instant.now().plusSeconds(expiresIn));
        return accessToken;
    }

    private NowPlaying fetchNowPlaying(Long userId) {
        SpotifyAccount account = accountRepository.findByUserId(userId).orElse(null);
        if (account == null) return NowPlaying.notConnected();

        String accessToken;
        try {
            accessToken = ensureValidToken(account);
        } catch (RestClientException e) {
            accountRepository.deleteByUserId(userId);
            return NowPlaying.notConnected();
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        try {
            var response = restTemplate.exchange(NOW_PLAYING_URL, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
            if (response.getStatusCode() == HttpStatus.NO_CONTENT || response.getBody() == null) {
                return NowPlaying.idle();
            }
            return parseNowPlaying(response.getBody());
        } catch (HttpClientErrorException.Unauthorized e) {
            accountRepository.deleteByUserId(userId);
            return NowPlaying.notConnected();
        } catch (RestClientException e) {
            return NowPlaying.idle();
        }
    }

    @SuppressWarnings("unchecked")
    private NowPlaying parseNowPlaying(Map<?, ?> body) {
        Object itemObj = body.get("item");
        if (!(itemObj instanceof Map<?, ?> item)) return NowPlaying.idle();
        boolean isPlaying = Boolean.TRUE.equals(body.get("is_playing"));
        String trackName = String.valueOf(item.get("name"));
        List<Map<String, Object>> artists = (List<Map<String, Object>>) item.get("artists");
        String artistNames = artists == null ? "" : artists.stream()
                .map(a -> String.valueOf(a.get("name")))
                .collect(Collectors.joining(", "));
        Map<String, Object> album = (Map<String, Object>) item.get("album");
        String albumName = album == null ? null : String.valueOf(album.get("name"));
        String albumArtUrl = null;
        if (album != null) {
            List<Map<String, Object>> images = (List<Map<String, Object>>) album.get("images");
            if (images != null && !images.isEmpty()) albumArtUrl = String.valueOf(images.get(0).get("url"));
        }
        Map<String, Object> externalUrls = (Map<String, Object>) item.get("external_urls");
        String trackUrl = externalUrls == null ? null : String.valueOf(externalUrls.get("spotify"));
        Number progressMs = (Number) body.get("progress_ms");
        Number durationMs = (Number) item.get("duration_ms");
        return new NowPlaying(true, isPlaying, trackName, artistNames, albumName, albumArtUrl, trackUrl,
                progressMs == null ? null : progressMs.intValue(), durationMs == null ? null : durationMs.intValue());
    }

    private String ensureValidToken(SpotifyAccount account) {
        if (account.getExpiresAt().isAfter(Instant.now().plusSeconds(60))) {
            return account.getAccessToken();
        }
        Map<String, Object> tokenResponse = requestToken(form(Map.of(
                "grant_type", "refresh_token",
                "refresh_token", account.getRefreshToken()
        )));
        String accessToken = String.valueOf(tokenResponse.get("access_token"));
        int expiresIn = ((Number) tokenResponse.get("expires_in")).intValue();
        Object newRefreshToken = tokenResponse.get("refresh_token");
        account.setAccessToken(accessToken);
        account.setExpiresAt(Instant.now().plusSeconds(expiresIn));
        if (newRefreshToken != null) account.setRefreshToken(String.valueOf(newRefreshToken));
        accountRepository.save(account);
        return accessToken;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> requestToken(MultiValueMap<String, String> form) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        String basic = Base64.getEncoder().encodeToString((clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));
        headers.set(HttpHeaders.AUTHORIZATION, "Basic " + basic);
        try {
            Map<?, ?> response = restTemplate.postForObject(TOKEN_URL, new HttpEntity<>(form, headers), Map.class);
            if (response == null) throw new IllegalStateException("Resposta vazia do Spotify");
            return (Map<String, Object>) response;
        } catch (HttpClientErrorException e) {
            throw new IllegalStateException("Não foi possível autenticar com o Spotify - tente conectar de novo");
        }
    }

    private MultiValueMap<String, String> form(Map<String, String> params) {
        MultiValueMap<String, String> map = new LinkedMultiValueMap<>();
        params.forEach(map::add);
        return map;
    }

    private void purgeExpiredStates() {
        long now = System.currentTimeMillis();
        pendingStates.entrySet().removeIf(e -> e.getValue().expiresAtMillis < now);
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private record PendingState(Long userId, long expiresAtMillis) {
    }

    private record CachedNowPlaying(NowPlaying value, long fetchedAtMillis) {
    }

    private record CachedAppToken(String accessToken, Instant expiresAt) {
    }

    public record NowPlaying(boolean connected, boolean playing, String trackName, String artistNames,
                              String albumName, String albumArtUrl, String trackUrl,
                              Integer progressMs, Integer durationMs) {
        public static NowPlaying notConnected() {
            return new NowPlaying(false, false, null, null, null, null, null, null, null);
        }

        public static NowPlaying idle() {
            return new NowPlaying(true, false, null, null, null, null, null, null, null);
        }
    }
}
