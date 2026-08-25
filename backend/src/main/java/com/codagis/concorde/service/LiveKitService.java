package com.codagis.concorde.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

@Service
public class LiveKitService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SecretKey key;
    private final String apiKey;
    private final String wsUrl;
    private final String internalUrl;
    private final long ttlMinutes;
    private final RestTemplate restTemplate = buildRestTemplate();

    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(3000);
        return new RestTemplate(factory);
    }

    public LiveKitService(@Value("${app.livekit.api-key}") String apiKey,
                           @Value("${app.livekit.api-secret}") String apiSecret,
                           @Value("${app.livekit.ws-url}") String wsUrl,
                           @Value("${app.livekit.internal-url:}") String internalUrl,
                           @Value("${app.livekit.token-ttl-minutes}") long ttlMinutes) {
        this.apiKey = apiKey;
        this.wsUrl = wsUrl;
        this.internalUrl = internalUrl;
        this.ttlMinutes = ttlMinutes;
        this.key = Keys.hmacShaKeyFor(apiSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String getWsUrl() {
        return wsUrl;
    }

    public String generateAccessToken(String roomName, String identity, String displayName, String avatarUrl) {
        Instant now = Instant.now();

        Map<String, Object> videoGrant = new HashMap<>();
        videoGrant.put("room", roomName);
        videoGrant.put("roomJoin", true);
        videoGrant.put("canPublish", true);
        videoGrant.put("canSubscribe", true);
        videoGrant.put("canPublishData", true);
        videoGrant.put("canPublishSources", new String[]{"camera", "microphone", "screen_share", "screen_share_audio"});

        var builder = Jwts.builder()
                .issuer(apiKey)
                .subject(identity)
                .claim("name", displayName)
                .claim("video", videoGrant)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlMinutes * 60)));

        if (avatarUrl != null && !avatarUrl.isBlank()) {
            builder.claim("metadata", toMetadataJson(avatarUrl));
        }

        return builder.signWith(key, Jwts.SIG.HS256).compact();
    }

    public String generateCameraViewerToken(String roomName, String identity, String displayName) {
        Instant now = Instant.now();

        Map<String, Object> videoGrant = new HashMap<>();
        videoGrant.put("room", roomName);
        videoGrant.put("roomJoin", true);
        videoGrant.put("canPublish", false);
        videoGrant.put("canPublishData", false);
        videoGrant.put("canSubscribe", true);
        videoGrant.put("hidden", true);

        return Jwts.builder()
                .issuer(apiKey)
                .subject(identity)
                .claim("name", displayName)
                .claim("video", videoGrant)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlMinutes * 60)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    private String toMetadataJson(String avatarUrl) {
        try {
            return JSON.writeValueAsString(Map.of("avatarUrl", avatarUrl));
        } catch (Exception e) {
            return "{}";
        }
    }

    public void disconnectParticipant(String roomName, String identity) {
        try {
            String httpBase = (internalUrl != null && !internalUrl.isBlank())
                    ? internalUrl
                    : wsUrl.replaceFirst("^wss://", "https://").replaceFirst("^ws://", "http://");
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(generateAdminToken(roomName));
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(Map.of("room", roomName, "identity", identity), headers);
            restTemplate.postForEntity(httpBase + "/twirp/livekit.RoomService/RemoveParticipant", entity, String.class);
        } catch (Exception e) {
            System.err.println("Falha ao desconectar " + identity + " de " + roomName + " no LiveKit: " + e.getMessage());
        }
    }

    private String generateAdminToken(String roomName) {
        Instant now = Instant.now();
        Map<String, Object> videoGrant = new HashMap<>();
        videoGrant.put("room", roomName);
        videoGrant.put("roomAdmin", true);

        return Jwts.builder()
                .issuer(apiKey)
                .subject("backend-admin")
                .claim("video", videoGrant)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(60)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }
}
