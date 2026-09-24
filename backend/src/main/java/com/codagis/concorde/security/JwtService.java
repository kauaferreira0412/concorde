package com.codagis.concorde.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;

@Service
public class JwtService {

    private final SecretKey key;
    private final long expirationMinutes;
    private final long rememberExpirationMinutes;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                       @Value("${app.jwt.expiration-minutes}") long expirationMinutes,
                       @Value("${app.jwt.remember-expiration-minutes}") long rememberExpirationMinutes) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = expirationMinutes;
        this.rememberExpirationMinutes = rememberExpirationMinutes;
    }

    public String generateToken(Long userId, String username, boolean rememberMe) {
        Instant now = Instant.now();
        long minutes = rememberMe ? rememberExpirationMinutes : expirationMinutes;
        return Jwts.builder()
                .subject(String.valueOf(userId))
                .claim("username", username)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(minutes * 60)))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public Long extractUserId(String token) {
        return Long.valueOf(parse(token).getSubject());
    }
}
