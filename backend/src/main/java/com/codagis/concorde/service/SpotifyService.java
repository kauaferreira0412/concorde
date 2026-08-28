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
import java.util.stream.Collectors;

/**
 * Integracao com o Spotify ("ouvindo Spotify" na lista de membros/perfil, ver
 * SpotifyController) - fluxo OAuth "Authorization Code" padrao:
 *  1. authorizeUrl() gera um link pro usuario autorizar no proprio site do Spotify (com um
 *     "state" aleatorio de uso unico, guardado aqui em memoria por alguns minutos - e' o que
 *     liga o redirect de volta, que chega SEM nenhum jeito de identificar o usuario Concorde
 *     por conta propria, de volta ao userId certo).
 *  2. handleCallback() troca o "code" que o Spotify manda de volta por um access_token (dura
 *     ~1h) e um refresh_token (nao expira, so' se o usuario revogar o acesso no proprio
 *     Spotify) - guarda os dois em SpotifyAccount.
 *  3. nowPlaying() usa o access_token pra perguntar ao Spotify "o que essa pessoa esta' ouvindo
 *     agora" - renova sozinho com o refresh_token quando o access_token esta' perto de expirar,
 *     sem o usuario precisar autorizar de novo.
 *
 * So' guarda o token de quem CONECTOU (opt-in explicito, ver ConnectSpotifyCard.jsx em
 * Configuracoes) - ninguem tem a musica de ninguem exposta sem ter clicado em "Conectar".
 */
@Service
public class SpotifyService {

    private static final String AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
    private static final String TOKEN_URL = "https://accounts.spotify.com/api/token";
    private static final String NOW_PLAYING_URL = "https://api.spotify.com/v1/me/player/currently-playing";
    private static final String SCOPE = "user-read-currently-playing user-read-playback-state";
    // Cache curto do "tocando agora" - evita bater no Spotify de novo pra cada membro em cada
    // poll da lista de membros (varias pessoas olhando a mesma lista ao mesmo tempo, cada
    // frontend perguntando a cada ~15s - ver useSpotifyNowPlaying.js). 8s e' curto o suficiente
    // pra parecer "ao vivo", mas corta a maior parte das chamadas repetidas.
    private static final long CACHE_TTL_MILLIS = 8_000;
    // "state" de autorizacao pendente - de uso UNICO (removido assim que o callback chega) e
    // expira sozinho depois de um tempo, pro caso do usuario abrir o link e nunca completar.
    private static final long PENDING_STATE_TTL_MILLIS = 10 * 60 * 1000;

    private final SpotifyAccountRepository accountRepository;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;
    private final RestTemplate restTemplate = new RestTemplate();

    private final Map<String, PendingState> pendingStates = new ConcurrentHashMap<>();
    private final Map<Long, CachedNowPlaying> nowPlayingCache = new ConcurrentHashMap<>();

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

    /** Troca o "code" do Spotify pelos tokens e salva - devolve o userId Concorde pra quem
     *  chamou (SpotifyController) poder mostrar a pagina de sucesso certa. */
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

    /** Mesma coisa que nowPlaying(), so' que pra varios usuarios de uma vez (ver
     *  MemberList/ProfileModal no frontend, que preferem UMA chamada em lote a uma por membro
     *  visivel). So' devolve quem esta' CONECTADO E TOCANDO algo agora - o resto nem entra no
     *  mapa, pra a resposta ficar pequena. */
    public Map<Long, NowPlaying> nowPlayingBatch(Set<Long> userIds) {
        return userIds.stream()
                .map(id -> Map.entry(id, nowPlaying(id)))
                .filter(e -> e.getValue().playing())
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    private NowPlaying fetchNowPlaying(Long userId) {
        SpotifyAccount account = accountRepository.findByUserId(userId).orElse(null);
        if (account == null) return NowPlaying.notConnected();

        String accessToken;
        try {
            accessToken = ensureValidToken(account);
        } catch (RestClientException e) {
            // Refresh falhou (provavelmente o usuario revogou o acesso pelo lado do Spotify) -
            // desconecta de vez em vez de ficar tentando (e falhando) pra sempre.
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

    /** Renova o access_token se ele ja' expirou (ou esta' a menos de 1 minuto de expirar, pra
     *  nao correr risco de expirar NO MEIO da chamada seguinte) - refresh_token nao muda nesse
     *  processo (o Spotify pode devolver um novo, mas normalmente nao, e o antigo continua
     *  valendo se nao vier). */
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

    // URLEncoder.encode() vira espaco em "+" (application/x-www-form-urlencoded) - troca por
    // "%20" (padrao de verdade de query string) so' pra evitar qualquer ambiguidade do lado do
    // Spotify, so' o "scope" (com espaco separando os escopos) e' afetado na pratica.
    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private record PendingState(Long userId, long expiresAtMillis) {
    }

    private record CachedNowPlaying(NowPlaying value, long fetchedAtMillis) {
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
