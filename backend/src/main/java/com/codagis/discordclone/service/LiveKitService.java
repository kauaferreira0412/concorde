package com.codagis.discordclone.service;

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

/**
 * Gera o token de acesso que o cliente React usa para conectar direto no servidor LiveKit
 * (SFU responsavel por audio/video/compartilhamento de tela via WebRTC).
 *
 * Formato: JWT assinado com o "api-secret" do LiveKit, contendo um "video grant"
 * (https://docs.livekit.io/home/get-started/authentication/). O Spring Boot NUNCA
 * carrega midia; ele so autoriza quem pode entrar em qual "room" (= canal de voz).
 */
@Service
public class LiveKitService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SecretKey key;
    private final String apiKey;
    private final String wsUrl;
    private final String internalUrl;
    private final long ttlMinutes;
    // Timeout curto de proposito - disconnectParticipant() e' chamado de dentro do handler de
    // desconexao do WebSocket (ver VoicePresenceService.leaveBySession), NAO pode ficar preso
    // esperando o LiveKit responder se ele estiver lento/fora do ar (o RestTemplate sem timeout
    // configurado usa o default da JVM, que pode travar por bem mais tempo que isso).
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

    /**
     * @param roomName normalmente "channel-{channelId}"
     * @param identity  identificador unico do usuario na room (ex: "user-42")
     * @param displayName nome mostrado na call (username)
     * @param avatarUrl URL da foto de perfil (ou null) - vai no "metadata" do participante,
     *                  assim quem esta na call ve a foto de todo mundo (ver VoiceCallContext.jsx)
     */
    public String generateAccessToken(String roomName, String identity, String displayName, String avatarUrl) {
        Instant now = Instant.now();

        Map<String, Object> videoGrant = new HashMap<>();
        videoGrant.put("room", roomName);
        videoGrant.put("roomJoin", true);
        videoGrant.put("canPublish", true);
        videoGrant.put("canSubscribe", true);
        videoGrant.put("canPublishData", true);
        // canPublishSources controla explicitamente microfone, camera e compartilhamento de tela (com audio)
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

        // O LiveKit exige HS256 especificamente - sem isso, o jjwt escolhe o algoritmo
        // sozinho com base no tamanho da chave (HS512 pra chaves de 64+ bytes, como as
        // geradas com "openssl rand -hex 32"), e o LiveKit rejeita o token como invalido
        // por nao reconhecer o algoritmo.
        return builder.signWith(key, Jwts.SIG.HS256).compact();
    }

    private String toMetadataJson(String avatarUrl) {
        try {
            return JSON.writeValueAsString(Map.of("avatarUrl", avatarUrl));
        } catch (Exception e) {
            return "{}";
        }
    }

    /**
     * Forca a desconexao de verdade de alguem da sala do LiveKit (nao so' da nossa lista de
     * presenca, que e' outro sistema - ver VoicePresenceService). Existe pra cobrir o caso de
     * "conexao fantasma": se o app de alguem cai sem avisar (internet cortada, app fechado a
     * força), o WebSocket do chat percebe rapido e ja tira a pessoa da lista de presenca, mas
     * a conexao de MIDIA (WebRTC, outro protocolo inteiramente) pode demorar bem mais pra
     * perceber sozinha que a pessoa sumiu - o microfone dela continua "vivo" na call por um
     * tempo mesmo ja nao aparecendo pra ninguem (reportado pelo usuario). Tambem cobre o kick
     * de moderacao (ver VoiceModerationController) contra alguem cujo app parou de responder -
     * antes disso, kick so' funcionava se o cliente-alvo estivesse vivo pra reagir ao evento
     * sozinho. Melhor esforco: se a chamada falhar (ex: LiveKit fora do ar), so' loga e segue -
     * nao trava a limpeza de presenca por causa disso.
     */
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

    /** Token de servidor-pra-servidor (nao e' de um participante de verdade) - so' com
     *  permissao de administrar ESSA sala especifica, valido por pouco tempo (essa chamada). */
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
