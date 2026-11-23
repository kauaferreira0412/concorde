package com.codagis.concorde.config;

import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.security.AdminGuard;
import com.codagis.concorde.security.JwtService;
import com.codagis.concorde.service.TerminalService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.*;

/**
 * Ponte entre o xterm.js do painel e um shell SSH na VPS.
 *
 * Protocolo (texto JSON do navegador pro servidor):
 *   {type:"auth", token, password, cols, rows} - primeira mensagem, em até 15s
 *   {type:"input", data} / {type:"resize", cols, rows} / {type:"ping"}
 * Do servidor: mensagens binárias = saída do terminal; texto JSON = {type:"ready"|"error"|"closed", ...}.
 */
@Component
public class TerminalWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(TerminalWebSocketHandler.class);
    private static final long AUTH_TIMEOUT_SECONDS = 15;
    private static final long IDLE_TIMEOUT_MILLIS = 30 * 60_000;

    private final JwtService jwtService;
    private final AdminGuard adminGuard;
    private final UserRepository userRepository;
    private final TerminalService terminalService;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "terminal-timeouts");
        t.setDaemon(true);
        return t;
    });
    private final ExecutorService pumps = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "terminal-output");
        t.setDaemon(true);
        return t;
    });
    private final Map<String, Conn> connections = new ConcurrentHashMap<>();

    public TerminalWebSocketHandler(JwtService jwtService, AdminGuard adminGuard, UserRepository userRepository,
                                    TerminalService terminalService) {
        this.jwtService = jwtService;
        this.adminGuard = adminGuard;
        this.userRepository = userRepository;
        this.terminalService = terminalService;
        scheduler.scheduleAtFixedRate(this::closeIdle, 1, 1, TimeUnit.MINUTES);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession raw) {
        WebSocketSession ws = new ConcurrentWebSocketSessionDecorator(raw, 10_000, 1024 * 1024);
        Conn conn = new Conn(ws);
        connections.put(raw.getId(), conn);
        scheduler.schedule(() -> {
            if (conn.shell == null) closeWithError(conn, "Tempo esgotado para entrar no terminal.");
        }, AUTH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
    }

    @Override
    protected void handleTextMessage(WebSocketSession raw, TextMessage message) throws Exception {
        Conn conn = connections.get(raw.getId());
        if (conn == null) return;
        JsonNode msg = mapper.readTree(message.getPayload());
        String type = msg.path("type").asText("");

        if (conn.shell == null) {
            if (!"auth".equals(type) || conn.authenticating) return;
            conn.authenticating = true;
            authenticate(conn, msg);
            return;
        }

        conn.lastActivity = System.currentTimeMillis();
        switch (type) {
            case "input" -> conn.shell.write(msg.path("data").asText("").getBytes(StandardCharsets.UTF_8));
            case "resize" -> conn.shell.resize(msg.path("cols").asInt(80), msg.path("rows").asInt(24));
            default -> { /* ping: só mantém vivo */ }
        }
    }

    private void authenticate(Conn conn, JsonNode msg) {
        Long userId;
        try {
            userId = jwtService.extractUserId(msg.path("token").asText(""));
        } catch (Exception e) {
            closeWithError(conn, "Sessão expirada - entre de novo no Concorde.");
            return;
        }
        if (userId == null || !adminGuard.hasTerminalAccess(userId)) {
            closeWithError(conn, "Você não tem acesso ao terminal da VPS.");
            return;
        }
        String username = userRepository.findById(userId).map(u -> u.getUsername()).orElse("?");
        String remote = conn.ws.getRemoteAddress() == null ? "?" : conn.ws.getRemoteAddress().toString();
        try {
            conn.shell = terminalService.openShell(userId, msg.path("password").asText(""),
                    msg.path("cols").asInt(80), msg.path("rows").asInt(24));
        } catch (IllegalArgumentException | IllegalStateException e) {
            log.warn("Terminal da VPS: acesso negado para {} ({}): {}", username, remote, e.getMessage());
            conn.authenticating = false;
            sendJson(conn, Map.of("type", "error", "message", e.getMessage()));
            return;
        }
        conn.username = username;
        conn.lastActivity = System.currentTimeMillis();
        log.warn("Terminal da VPS ABERTO por {} ({})", username, remote);
        sendJson(conn, Map.of("type", "ready", "target", terminalService.target()));
        pumps.submit(() -> pump(conn));
    }

    /** Copia a saída do shell pro navegador até o shell fechar. */
    private void pump(Conn conn) {
        byte[] buffer = new byte[8192];
        try {
            InputStream out = conn.shell.output();
            int read;
            while ((read = out.read(buffer)) != -1) {
                if (!conn.ws.isOpen()) break;
                byte[] chunk = new byte[read];
                System.arraycopy(buffer, 0, chunk, 0, read);
                conn.ws.sendMessage(new BinaryMessage(chunk));
            }
        } catch (IOException ignored) {
            // conexão caiu
        } finally {
            sendJson(conn, Map.of("type", "closed", "message", "Sessão encerrada na VPS."));
            close(conn, CloseStatus.NORMAL);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession raw, CloseStatus status) {
        Conn conn = connections.remove(raw.getId());
        if (conn != null) releaseShell(conn);
    }

    @Override
    public void handleTransportError(WebSocketSession raw, Throwable exception) {
        Conn conn = connections.get(raw.getId());
        if (conn != null) close(conn, CloseStatus.SERVER_ERROR);
    }

    private void closeIdle() {
        long now = System.currentTimeMillis();
        connections.values().forEach(conn -> {
            if (conn.shell != null && now - conn.lastActivity > IDLE_TIMEOUT_MILLIS) {
                sendJson(conn, Map.of("type", "closed", "message", "Terminal fechado após 30 minutos sem uso."));
                close(conn, CloseStatus.NORMAL);
            }
        });
    }

    private void closeWithError(Conn conn, String message) {
        sendJson(conn, Map.of("type", "error", "message", message));
        close(conn, CloseStatus.POLICY_VIOLATION);
    }

    private void close(Conn conn, CloseStatus status) {
        releaseShell(conn);
        try {
            if (conn.ws.isOpen()) conn.ws.close(status);
        } catch (IOException ignored) {
            // já fechado
        }
    }

    private void releaseShell(Conn conn) {
        TerminalService.Shell shell = conn.shell;
        if (shell != null) {
            shell.close();
            if (conn.username != null && !conn.closedLogged) {
                conn.closedLogged = true;
                log.warn("Terminal da VPS fechado ({})", conn.username);
            }
        }
    }

    private void sendJson(Conn conn, Map<String, Object> payload) {
        try {
            if (conn.ws.isOpen()) conn.ws.sendMessage(new TextMessage(mapper.writeValueAsString(payload)));
        } catch (IOException ignored) {
            // conexão caiu
        }
    }

    private static final class Conn {
        final WebSocketSession ws;
        volatile TerminalService.Shell shell;
        volatile boolean authenticating;
        volatile long lastActivity = System.currentTimeMillis();
        volatile String username;
        volatile boolean closedLogged;

        Conn(WebSocketSession ws) {
            this.ws = ws;
        }
    }
}
