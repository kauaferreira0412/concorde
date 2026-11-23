package com.codagis.concorde.service;

import com.codagis.concorde.domain.SteamAccount;
import com.codagis.concorde.repository.SteamAccountRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Integração com a Steam:
 * - vínculo da conta pelo login oficial (OpenID 2.0) - a Steam devolve o SteamID64 assinado
 *   e a gente confirma a assinatura com a própria Steam (check_authentication);
 * - dados públicos do perfil / jogo atual pela Steam Web API (precisa de STEAM_API_KEY).
 *
 * A Steam não avisa quando alguém começa a jogar, então o frontend consulta de tempos em
 * tempos (igual o "ouvindo Spotify") e aqui fica um cache curto pra não estourar o limite da API.
 */
@Service
public class SteamService {

    private static final String OPENID_URL = "https://steamcommunity.com/openid/login";
    private static final String OPENID_NS = "http://specs.openid.net/auth/2.0";
    private static final String OPENID_IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
    private static final Pattern CLAIMED_ID_PATTERN = Pattern.compile("^https?://steamcommunity\\.com/openid/id/(\\d{17})$");

    private static final String API_BASE = "https://api.steampowered.com";
    private static final int SUMMARIES_BATCH_SIZE = 100;
    private static final long SUMMARY_TTL_MILLIS = 30_000;
    private static final long EXTRAS_TTL_MILLIS = 5 * 60_000;
    private static final long PENDING_STATE_TTL_MILLIS = 10 * 60_000;

    private static final String[] PERSONA_STATES = {
            "Offline", "Online", "Ocupado", "Ausente", "Soneca", "Querendo trocar", "Querendo jogar"
    };

    private final SteamAccountRepository accountRepository;
    private final String apiKey;
    private final String returnUrl;
    private final String realm;
    private final RestTemplate restTemplate = new RestTemplate();

    private final Map<String, PendingState> pendingStates = new ConcurrentHashMap<>();
    private final Map<String, Cached<PlayerSummary>> summaryCache = new ConcurrentHashMap<>();
    private final Map<String, Cached<Extras>> extrasCache = new ConcurrentHashMap<>();

    public SteamService(SteamAccountRepository accountRepository,
                        @Value("${app.steam.api-key}") String apiKey,
                        @Value("${app.steam.return-url}") String returnUrl) {
        this.accountRepository = accountRepository;
        this.apiKey = apiKey;
        this.returnUrl = returnUrl;
        URI uri = URI.create(returnUrl);
        this.realm = uri.getScheme() + "://" + uri.getAuthority();
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /* ------------------------------------------------------------------ vínculo */

    public String loginUrl(Long userId) {
        if (!isConfigured()) {
            throw new IllegalStateException("Integração com a Steam não configurada no servidor");
        }
        purgeExpiredStates();
        String state = UUID.randomUUID().toString();
        pendingStates.put(state, new PendingState(userId, System.currentTimeMillis() + PENDING_STATE_TTL_MILLIS));
        return OPENID_URL
                + "?openid.ns=" + encode(OPENID_NS)
                + "&openid.mode=checkid_setup"
                + "&openid.return_to=" + encode(returnToFor(state))
                + "&openid.realm=" + encode(realm)
                + "&openid.identity=" + encode(OPENID_IDENTIFIER_SELECT)
                + "&openid.claimed_id=" + encode(OPENID_IDENTIFIER_SELECT);
    }

    /** Valida a resposta do login da Steam e vincula a conta. Devolve o id do usuário do Concorde. */
    @Transactional
    public Long handleCallback(Map<String, String> params) {
        String state = params.get("state");
        PendingState pending = state == null ? null : pendingStates.remove(state);
        if (pending == null || pending.expiresAtMillis < System.currentTimeMillis()) {
            throw new IllegalStateException("Link de login expirado ou inválido - tente conectar de novo");
        }
        if ("cancel".equals(params.get("openid.mode"))) {
            throw new IllegalStateException("Você cancelou o login na Steam.");
        }
        if (!"id_res".equals(params.get("openid.mode"))
                || !OPENID_URL.equals(params.get("openid.op_endpoint"))
                || !returnToFor(state).equals(params.get("openid.return_to"))) {
            throw new IllegalStateException("Resposta inválida da Steam - tente conectar de novo");
        }
        String claimedId = params.get("openid.claimed_id");
        Matcher matcher = claimedId == null ? null : CLAIMED_ID_PATTERN.matcher(claimedId);
        if (matcher == null || !matcher.matches() || !claimedId.equals(params.get("openid.identity"))) {
            throw new IllegalStateException("Resposta inválida da Steam - tente conectar de novo");
        }
        if (!verifyWithSteam(params)) {
            throw new IllegalStateException("A Steam não confirmou o login - tente conectar de novo");
        }

        String steamId = matcher.group(1);
        accountRepository.findBySteamId(steamId).ifPresent(existing -> {
            if (!existing.getUserId().equals(pending.userId)) {
                throw new IllegalStateException("Essa conta Steam já está vinculada a outro usuário do Concorde.");
            }
        });

        SteamAccount account = accountRepository.findByUserId(pending.userId)
                .orElseGet(() -> SteamAccount.builder().userId(pending.userId).build());
        account.setSteamId(steamId);
        account.setConnectedAt(Instant.now());
        accountRepository.save(account);
        summaryCache.remove(steamId);
        extrasCache.remove(steamId);
        return pending.userId;
    }

    @Transactional
    public void disconnect(Long userId) {
        accountRepository.findByUserId(userId).ifPresent(a -> {
            summaryCache.remove(a.getSteamId());
            extrasCache.remove(a.getSteamId());
        });
        accountRepository.deleteByUserId(userId);
    }

    public Status status(Long userId) {
        SteamAccount account = accountRepository.findByUserId(userId).orElse(null);
        if (account == null) return new Status(isConfigured(), false, null, null, null);
        PlayerSummary summary = summaries(List.of(account.getSteamId())).get(account.getSteamId());
        return new Status(isConfigured(), true,
                summary == null ? null : summary.personaName,
                summary == null ? null : summary.avatarUrl,
                summary == null ? profileUrlFor(account.getSteamId()) : summary.profileUrl);
    }

    /* ------------------------------------------------------------------ dados */

    /** Jogo atual de cada usuário (só entra no mapa quem está jogando algo agora). */
    public Map<Long, Game> playingBatch(Set<Long> userIds) {
        if (!isConfigured() || userIds.isEmpty()) return Map.of();
        List<SteamAccount> accounts = accountRepository.findByUserIdIn(userIds);
        if (accounts.isEmpty()) return Map.of();
        Map<String, PlayerSummary> summaries = summaries(accounts.stream().map(SteamAccount::getSteamId).toList());
        Map<Long, Game> result = new HashMap<>();
        for (SteamAccount account : accounts) {
            PlayerSummary s = summaries.get(account.getSteamId());
            if (s != null && s.playing != null) result.put(account.getUserId(), s.playing);
        }
        return result;
    }

    public Profile profile(Long userId) {
        SteamAccount account = accountRepository.findByUserId(userId).orElse(null);
        if (account == null || !isConfigured()) return Profile.notConnected();
        String steamId = account.getSteamId();
        PlayerSummary s = summaries(List.of(steamId)).get(steamId);
        if (s == null) {
            return new Profile(true, false, null, null, profileUrlFor(steamId), null, null, null, List.of());
        }
        Extras extras = s.publicProfile ? extras(steamId) : Extras.EMPTY;
        return new Profile(true, s.publicProfile, s.personaName, s.avatarUrl, s.profileUrl, s.personaState,
                extras.level, s.playing, extras.recentGames);
    }

    private Map<String, PlayerSummary> summaries(Collection<String> steamIds) {
        long now = System.currentTimeMillis();
        Map<String, PlayerSummary> result = new HashMap<>();
        List<String> missing = new ArrayList<>();
        for (String id : new LinkedHashSet<>(steamIds)) {
            Cached<PlayerSummary> cached = summaryCache.get(id);
            if (cached != null && cached.fetchedAtMillis + SUMMARY_TTL_MILLIS > now) {
                if (cached.value != null) result.put(id, cached.value);
            } else {
                missing.add(id);
            }
        }
        for (int i = 0; i < missing.size(); i += SUMMARIES_BATCH_SIZE) {
            List<String> chunk = missing.subList(i, Math.min(i + SUMMARIES_BATCH_SIZE, missing.size()));
            Map<String, PlayerSummary> fetched = fetchSummaries(chunk);
            if (fetched == null) {
                // Steam fora do ar: devolve o que tiver no cache, mesmo vencido
                chunk.forEach(id -> {
                    Cached<PlayerSummary> stale = summaryCache.get(id);
                    if (stale != null && stale.value != null) result.put(id, stale.value);
                });
                continue;
            }
            for (String id : chunk) {
                PlayerSummary summary = fetched.get(id);
                summaryCache.put(id, new Cached<>(summary, now));
                if (summary != null) result.put(id, summary);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, PlayerSummary> fetchSummaries(List<String> steamIds) {
        String url = API_BASE + "/ISteamUser/GetPlayerSummaries/v2/?key=" + encode(apiKey)
                + "&steamids=" + String.join(",", steamIds);
        try {
            Map<String, Object> body = restTemplate.getForObject(url, Map.class);
            Map<String, Object> response = body == null ? null : (Map<String, Object>) body.get("response");
            List<Map<String, Object>> players = response == null ? null : (List<Map<String, Object>>) response.get("players");
            Map<String, PlayerSummary> result = new HashMap<>();
            if (players == null) return result;
            for (Map<String, Object> p : players) {
                String steamId = str(p.get("steamid"));
                if (steamId == null) continue;
                boolean publicProfile = num(p.get("communityvisibilitystate")) == 3;
                int state = num(p.get("personastate"));
                String gameName = str(p.get("gameextrainfo"));
                String gameId = str(p.get("gameid"));
                Game playing = gameName == null ? null : new Game(gameId, gameName,
                        isAppId(gameId) ? headerUrl(gameId) : null,
                        isAppId(gameId) ? storeUrl(gameId) : null);
                result.put(steamId, new PlayerSummary(
                        str(p.get("personaname")),
                        str(p.get("avatarfull")),
                        Optional.ofNullable(str(p.get("profileurl"))).orElse(profileUrlFor(steamId)),
                        state >= 0 && state < PERSONA_STATES.length ? PERSONA_STATES[state] : null,
                        publicProfile,
                        playing));
            }
            return result;
        } catch (RestClientException | ClassCastException e) {
            return null;
        }
    }

    private Extras extras(String steamId) {
        long now = System.currentTimeMillis();
        Cached<Extras> cached = extrasCache.get(steamId);
        if (cached != null && cached.fetchedAtMillis + EXTRAS_TTL_MILLIS > now) return cached.value;
        Extras extras = new Extras(fetchLevel(steamId), fetchRecentGames(steamId));
        extrasCache.put(steamId, new Cached<>(extras, now));
        return extras;
    }

    @SuppressWarnings("unchecked")
    private Integer fetchLevel(String steamId) {
        String url = API_BASE + "/IPlayerService/GetSteamLevel/v1/?key=" + encode(apiKey) + "&steamid=" + steamId;
        try {
            Map<String, Object> body = restTemplate.getForObject(url, Map.class);
            Map<String, Object> response = body == null ? null : (Map<String, Object>) body.get("response");
            Object level = response == null ? null : response.get("player_level");
            return level instanceof Number n ? n.intValue() : null;
        } catch (RestClientException | ClassCastException e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<RecentGame> fetchRecentGames(String steamId) {
        String url = API_BASE + "/IPlayerService/GetRecentlyPlayedGames/v1/?key=" + encode(apiKey)
                + "&steamid=" + steamId + "&count=3";
        try {
            Map<String, Object> body = restTemplate.getForObject(url, Map.class);
            Map<String, Object> response = body == null ? null : (Map<String, Object>) body.get("response");
            List<Map<String, Object>> games = response == null ? null : (List<Map<String, Object>>) response.get("games");
            if (games == null) return List.of();
            return games.stream().map(g -> {
                String appId = str(g.get("appid"));
                String icon = str(g.get("img_icon_url"));
                return new RecentGame(appId, str(g.get("name")),
                        icon == null ? null : "https://media.steampowered.com/steamcommunity/public/images/apps/" + appId + "/" + icon + ".jpg",
                        Math.max(0, num(g.get("playtime_2weeks"))),
                        Math.max(0, num(g.get("playtime_forever"))),
                        storeUrl(appId));
            }).collect(Collectors.toList());
        } catch (RestClientException | ClassCastException e) {
            return List.of();
        }
    }

    /* ------------------------------------------------------------------ utilitários */

    private boolean verifyWithSteam(Map<String, String> params) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        params.forEach((k, v) -> {
            if (k.startsWith("openid.")) form.add(k, v);
        });
        form.set("openid.mode", "check_authentication");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        try {
            String body = restTemplate.postForObject(OPENID_URL, new HttpEntity<>(form, headers), String.class);
            return body != null && body.lines().anyMatch(line -> line.trim().equals("is_valid:true"));
        } catch (RestClientException e) {
            return false;
        }
    }

    private String returnToFor(String state) {
        return returnUrl + (returnUrl.contains("?") ? "&" : "?") + "state=" + state;
    }

    private void purgeExpiredStates() {
        long now = System.currentTimeMillis();
        pendingStates.entrySet().removeIf(e -> e.getValue().expiresAtMillis < now);
    }

    private static boolean isAppId(String gameId) {
        // jogos de fora da Steam ("atalhos") vêm com ids enormes que não existem na loja
        if (gameId == null || !gameId.matches("\\d{1,10}")) return false;
        return Long.parseLong(gameId) < 100_000_000L;
    }

    private static String headerUrl(String appId) {
        return "https://cdn.cloudflare.steamstatic.com/steam/apps/" + appId + "/header.jpg";
    }

    private static String storeUrl(String appId) {
        return appId == null ? null : "https://store.steampowered.com/app/" + appId;
    }

    private static String profileUrlFor(String steamId) {
        return "https://steamcommunity.com/profiles/" + steamId;
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o);
        return s.isBlank() ? null : s;
    }

    private static int num(Object o) {
        if (o instanceof Number n) return n.intValue();
        try {
            return o == null ? -1 : Integer.parseInt(String.valueOf(o));
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private record PendingState(Long userId, long expiresAtMillis) {}

    private record Cached<T>(T value, long fetchedAtMillis) {}

    private record PlayerSummary(String personaName, String avatarUrl, String profileUrl, String personaState,
                                 boolean publicProfile, Game playing) {}

    private record Extras(Integer level, List<RecentGame> recentGames) {
        static final Extras EMPTY = new Extras(null, List.of());
    }

    public record Status(boolean configured, boolean connected, String personaName, String avatarUrl, String profileUrl) {}

    public record Game(String gameId, String name, String headerUrl, String storeUrl) {}

    public record RecentGame(String appId, String name, String iconUrl, int minutesTwoWeeks, int minutesTotal,
                             String storeUrl) {}

    public record Profile(boolean connected, boolean publicProfile, String personaName, String avatarUrl,
                          String profileUrl, String personaState, Integer level, Game playing,
                          List<RecentGame> recentGames) {
        public static Profile notConnected() {
            return new Profile(false, false, null, null, null, null, null, null, List.of());
        }
    }
}
