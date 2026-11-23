package com.codagis.concorde.service;

import com.codagis.concorde.domain.TerminalConfig;
import com.codagis.concorde.repository.TerminalConfigRepository;
import com.codagis.concorde.security.AdminGuard;
import com.jcraft.jsch.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Terminal da VPS no painel admin.
 *
 * Configuração (uma vez): o admin digita a senha do usuário SSH da VPS; o backend entra com ela,
 * instala uma chave SSH própria do Concorde no authorized_keys e guarda essa chave criptografada
 * com uma chave derivada da própria senha. A senha não é salva em lugar nenhum.
 *
 * Abrir o terminal: a senha é pedida de novo e usada pra descriptografar a chave (senha errada =
 * a descriptografia falha). Aí abre um shell SSH na VPS com essa chave.
 */
@Service
public class TerminalService {

    private static final Logger log = LoggerFactory.getLogger(TerminalService.class);

    private static final long CONFIG_ID = 1L;
    private static final String KEY_COMMENT = "concorde-admin-terminal";
    private static final int PBKDF2_ITERATIONS = 310_000;
    private static final int MAX_FAILURES = 5;
    private static final long FAILURE_WINDOW_MILLIS = 15 * 60_000;
    private static final int MAX_OPEN_SHELLS = 3;
    private static final int CONNECT_TIMEOUT_MILLIS = 10_000;

    private final TerminalConfigRepository configRepository;
    private final AdminGuard adminGuard;
    private final String defaultHost;
    private final int defaultPort;
    private final String defaultUser;
    private final SecureRandom random = new SecureRandom();

    private final Map<Long, Failures> failures = new ConcurrentHashMap<>();
    private final AtomicInteger openShells = new AtomicInteger();

    public TerminalService(TerminalConfigRepository configRepository, AdminGuard adminGuard,
                           @Value("${app.terminal.ssh-host}") String defaultHost,
                           @Value("${app.terminal.ssh-port}") int defaultPort,
                           @Value("${app.terminal.ssh-user}") String defaultUser) {
        this.configRepository = configRepository;
        this.adminGuard = adminGuard;
        this.defaultHost = defaultHost;
        this.defaultPort = defaultPort;
        this.defaultUser = defaultUser;
    }

    public Status status(Long userId) {
        adminGuard.assertTerminalAccess(userId);
        TerminalConfig config = configRepository.findById(CONFIG_ID).orElse(null);
        if (config == null) {
            return new Status(false, defaultHost, defaultPort, defaultUser, null, null);
        }
        return new Status(true, config.getSshHost(), config.getSshPort(), config.getSshUser(),
                config.getHostKeyFingerprint(), config.getConfiguredAt());
    }

    /** Entra na VPS com a senha, instala a chave do Concorde e guarda a chave privada criptografada. */
    public Status setup(Long userId, String sshUser, String password) {
        adminGuard.assertTerminalAccess(userId);
        checkNotBlocked(userId);
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("Digite a senha da VPS");
        }
        String user = sshUser == null || sshUser.isBlank() ? defaultUser : sshUser.trim();
        if (!user.matches("[a-z_][a-z0-9_-]{0,31}")) {
            throw new IllegalArgumentException("Usuário SSH inválido");
        }

        JSch jsch = new JSch();
        com.jcraft.jsch.KeyPair keyPair;
        try {
            keyPair = com.jcraft.jsch.KeyPair.genKeyPair(jsch, com.jcraft.jsch.KeyPair.RSA, 3072);
        } catch (JSchException e) {
            throw new IllegalArgumentException("Não foi possível gerar a chave SSH");
        }
        ByteArrayOutputStream privOut = new ByteArrayOutputStream();
        ByteArrayOutputStream pubOut = new ByteArrayOutputStream();
        keyPair.writePrivateKey(privOut);
        keyPair.writePublicKey(pubOut, KEY_COMMENT);
        byte[] privateKey = privOut.toByteArray();
        String publicKey = pubOut.toString(StandardCharsets.UTF_8).trim();
        keyPair.dispose();

        // 1) entra com a senha e instala a chave pública
        Session session = null;
        HostKey hostKey;
        try {
            session = jsch.getSession(user, defaultHost, defaultPort);
            session.setPassword(password);
            session.setUserInfo(new PasswordUserInfo(password));
            session.setConfig("StrictHostKeyChecking", "no");
            session.setConfig("PreferredAuthentications", "password,keyboard-interactive");
            session.connect(CONNECT_TIMEOUT_MILLIS);
            hostKey = session.getHostKey();

            String command = "umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys"
                    + " && sed -i '/ " + KEY_COMMENT + "$/d' ~/.ssh/authorized_keys"
                    + " && printf '%s\\n' '" + publicKey + "' >> ~/.ssh/authorized_keys"
                    + " && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys";
            int exit = exec(session, command);
            if (exit != 0) {
                throw new IllegalArgumentException("A VPS recusou a instalação da chave SSH (código " + exit + ")");
            }
        } catch (JSchException e) {
            registerFailure(userId);
            throw new IllegalArgumentException(describeConnectError(e, true));
        } finally {
            if (session != null) session.disconnect();
        }

        // 2) confere se a chave funciona antes de salvar
        TerminalConfig config = TerminalConfig.builder()
                .id(CONFIG_ID)
                .sshHost(defaultHost)
                .sshPort(defaultPort)
                .sshUser(user)
                .publicKey(publicKey)
                .hostKeyType(hostKey.getType())
                .hostKey(hostKey.getKey())
                .hostKeyFingerprint(fingerprint(hostKey.getKey()))
                .configuredAt(Instant.now())
                .configuredByUserId(userId)
                .build();
        Session test = null;
        try {
            test = keySession(config, privateKey);
            test.connect(CONNECT_TIMEOUT_MILLIS);
        } catch (JSchException e) {
            throw new IllegalArgumentException("A chave foi instalada, mas o login com ela falhou: " + e.getMessage()
                    + ". Confira se o SSH da VPS aceita chaves (PubkeyAuthentication yes).");
        } finally {
            if (test != null) test.disconnect();
        }

        // 3) criptografa a chave privada com a senha e salva
        byte[] salt = randomBytes(16);
        byte[] iv = randomBytes(12);
        try {
            byte[] encrypted = cipher(Cipher.ENCRYPT_MODE, password, salt, iv).doFinal(privateKey);
            config.setSalt(b64(salt));
            config.setIv(b64(iv));
            config.setEncryptedPrivateKey(b64(encrypted));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Não foi possível proteger a chave SSH");
        } finally {
            Arrays.fill(privateKey, (byte) 0);
        }
        configRepository.save(config);
        failures.remove(userId);
        log.warn("Terminal da VPS configurado pelo usuario {} ({}@{}:{})", userId, user, defaultHost, defaultPort);
        return status(userId);
    }

    /** Abre um shell na VPS. A senha descriptografa a chave SSH; senha errada conta como tentativa falha. */
    public Shell openShell(Long userId, String password, int cols, int rows) {
        adminGuard.assertTerminalAccess(userId);
        checkNotBlocked(userId);
        TerminalConfig config = configRepository.findById(CONFIG_ID)
                .orElseThrow(() -> new IllegalArgumentException("O terminal ainda não foi configurado"));

        byte[] privateKey;
        try {
            privateKey = cipher(Cipher.DECRYPT_MODE, password == null ? "" : password,
                    Base64.getDecoder().decode(config.getSalt()), Base64.getDecoder().decode(config.getIv()))
                    .doFinal(Base64.getDecoder().decode(config.getEncryptedPrivateKey()));
        } catch (GeneralSecurityException e) {
            int left = registerFailure(userId);
            throw new IllegalArgumentException(left > 0
                    ? "Senha incorreta. Restam " + left + " tentativa(s)."
                    : "Senha incorreta. Terminal bloqueado por 15 minutos.");
        }
        failures.remove(userId);

        if (openShells.incrementAndGet() > MAX_OPEN_SHELLS) {
            openShells.decrementAndGet();
            Arrays.fill(privateKey, (byte) 0);
            throw new IllegalArgumentException("Já existem " + MAX_OPEN_SHELLS + " terminais abertos - feche algum antes.");
        }

        Session session = null;
        try {
            session = keySession(config, privateKey);
            session.setServerAliveInterval(30_000);
            session.connect(CONNECT_TIMEOUT_MILLIS);
            ChannelShell channel = (ChannelShell) session.openChannel("shell");
            channel.setPtyType("xterm-256color", clamp(cols, 20, 500), clamp(rows, 5, 200), 0, 0);
            channel.setEnv("LANG", "C.UTF-8");
            InputStream output = channel.getInputStream();
            OutputStream input = channel.getOutputStream();
            channel.connect(CONNECT_TIMEOUT_MILLIS);
            return new Shell(session, channel, output, input);
        } catch (Exception e) {
            if (session != null) session.disconnect();
            openShells.decrementAndGet();
            throw new IllegalArgumentException(e instanceof JSchException je ? describeConnectError(je, false)
                    : "Não foi possível abrir o terminal: " + e.getMessage());
        } finally {
            Arrays.fill(privateKey, (byte) 0);
        }
    }

    public String target() {
        return configRepository.findById(CONFIG_ID)
                .map(c -> c.getSshUser() + "@" + c.getSshHost())
                .orElse(defaultUser + "@" + defaultHost);
    }

    /* ------------------------------------------------------------------ SSH */

    private Session keySession(TerminalConfig config, byte[] privateKey) throws JSchException {
        JSch jsch = new JSch();
        jsch.addIdentity(KEY_COMMENT, privateKey.clone(), config.getPublicKey().getBytes(StandardCharsets.UTF_8), null);
        // só aceita a mesma chave de servidor vista na configuração
        String hostPattern = config.getSshPort() == 22 ? config.getSshHost()
                : "[" + config.getSshHost() + "]:" + config.getSshPort();
        String knownHosts = hostPattern + " " + config.getHostKeyType() + " " + config.getHostKey() + "\n";
        jsch.setKnownHosts(new ByteArrayInputStream(knownHosts.getBytes(StandardCharsets.UTF_8)));
        Session session = jsch.getSession(config.getSshUser(), config.getSshHost(), config.getSshPort());
        session.setConfig("StrictHostKeyChecking", "yes");
        session.setConfig("PreferredAuthentications", "publickey");
        String defaults = session.getConfig("server_host_key");
        session.setConfig("server_host_key", config.getHostKeyType() + (defaults == null ? "" : "," + defaults));
        return session;
    }

    private int exec(Session session, String command) throws JSchException {
        ChannelExec channel = (ChannelExec) session.openChannel("exec");
        channel.setCommand(command);
        channel.setInputStream(null);
        channel.connect(CONNECT_TIMEOUT_MILLIS);
        long deadline = System.currentTimeMillis() + 15_000;
        while (!channel.isClosed() && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        int exit = channel.getExitStatus();
        channel.disconnect();
        return exit;
    }

    private String describeConnectError(JSchException e, boolean withPassword) {
        String msg = e.getMessage() == null ? "" : e.getMessage();
        if (msg.contains("Auth fail") || msg.contains("Auth cancel")) {
            return withPassword
                    ? "A VPS recusou a senha. Confira a senha e se o SSH aceita login por senha (PasswordAuthentication)."
                    : "A VPS recusou a chave do Concorde - talvez ela tenha sido removida do authorized_keys. Reconfigure o terminal.";
        }
        if (msg.contains("HostKey has been changed") || msg.contains("reject HostKey")) {
            return "A identidade do servidor SSH mudou desde a configuração. Se a VPS foi reinstalada, reconfigure o terminal.";
        }
        if (msg.contains("timeout") || msg.contains("Connection refused") || msg.contains("UnknownHost")) {
            return "Não foi possível alcançar o SSH da VPS (" + defaultHost + ":" + defaultPort + ").";
        }
        return "Falha no SSH: " + msg;
    }

    /* ------------------------------------------------------------------ cripto */

    private Cipher cipher(int mode, String password, byte[] salt, byte[] iv) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, PBKDF2_ITERATIONS, 256);
        byte[] key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        spec.clearPassword();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        Arrays.fill(key, (byte) 0);
        return cipher;
    }

    private byte[] randomBytes(int size) {
        byte[] bytes = new byte[size];
        random.nextBytes(bytes);
        return bytes;
    }

    private static String b64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static String fingerprint(String base64Key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(Base64.getDecoder().decode(base64Key));
            return "SHA256:" + Base64.getEncoder().withoutPadding().encodeToString(digest);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return "?";
        }
    }

    /* ------------------------------------------------------------------ limites */

    private void checkNotBlocked(Long userId) {
        Failures f = failures.get(userId);
        if (f != null && f.count >= MAX_FAILURES && System.currentTimeMillis() - f.firstAt < FAILURE_WINDOW_MILLIS) {
            throw new IllegalArgumentException("Muitas tentativas erradas. Tente de novo em alguns minutos.");
        }
    }

    /** Registra uma falha e devolve quantas tentativas ainda restam. */
    private int registerFailure(Long userId) {
        long now = System.currentTimeMillis();
        Failures f = failures.compute(userId, (id, prev) ->
                prev == null || now - prev.firstAt > FAILURE_WINDOW_MILLIS ? new Failures(1, now) : new Failures(prev.count + 1, prev.firstAt));
        return Math.max(0, MAX_FAILURES - f.count);
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private record Failures(int count, long firstAt) {}

    /** Responde o prompt "keyboard-interactive" (alguns SSH pedem a senha por ele em vez de "password"). */
    private record PasswordUserInfo(String password) implements UserInfo, UIKeyboardInteractive {
        public String getPassphrase() { return null; }
        public String getPassword() { return password; }
        public boolean promptPassword(String message) { return true; }
        public boolean promptPassphrase(String message) { return false; }
        public boolean promptYesNo(String message) { return false; }
        public void showMessage(String message) {}
        public String[] promptKeyboardInteractive(String destination, String name, String instruction,
                                                  String[] prompt, boolean[] echo) {
            String[] answers = new String[prompt.length];
            Arrays.fill(answers, password);
            return answers;
        }
    }

    public record Status(boolean configured, String sshHost, int sshPort, String sshUser,
                         String hostKeyFingerprint, Instant configuredAt) {}

    /** Shell aberto: output = o que a VPS escreve; input = o que o usuário digita. */
    public final class Shell implements AutoCloseable {
        private final Session session;
        private final ChannelShell channel;
        private final InputStream output;
        private final OutputStream input;
        private volatile boolean closed;

        Shell(Session session, ChannelShell channel, InputStream output, OutputStream input) {
            this.session = session;
            this.channel = channel;
            this.output = output;
            this.input = input;
        }

        public InputStream output() { return output; }

        public void write(byte[] data) throws java.io.IOException {
            input.write(data);
            input.flush();
        }

        public void resize(int cols, int rows) {
            channel.setPtySize(clamp(cols, 20, 500), clamp(rows, 5, 200), 0, 0);
        }

        public boolean isOpen() {
            return !closed && channel.isConnected() && !channel.isClosed();
        }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            channel.disconnect();
            session.disconnect();
            openShells.decrementAndGet();
        }
    }
}
