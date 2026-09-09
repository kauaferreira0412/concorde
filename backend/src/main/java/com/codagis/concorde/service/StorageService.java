package com.codagis.concorde.service;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.net.URI;
import java.util.Set;
import java.util.UUID;

/**
 * Upload de avatar/imagens/anexos - Cloudflare R2 (pedido explicito do usuario: "eu quero trocar
 * do Google Cloud para o Cloudflare Storage"). R2 fala a MESMA API do S3, entao da' pra usar o
 * SDK oficial da AWS (software.amazon.awssdk:s3) so' trocando o endpoint - nao precisa de
 * biblioteca especifica da Cloudflare. Chamava-se "GcsService" antes (Google Cloud Storage) -
 * renomeado pra nao ficar enganoso, mas a URL publica gravada no banco (ver upload()/
 * uploadAudio()/uploadAttachment()) e' so' "publicBaseUrl + / + nome-do-objeto", igual antes so'
 * que com prefixo do R2 em vez do "storage.googleapis.com" do GCS - arquivos e URLs de ANTES da
 * troca precisam ser migrados manualmente (copiar os objetos pro bucket novo + atualizar as
 * URLs gravadas no banco), ver DEPLOY.md.
 */
@Service
public class StorageService {

    private static final Set<String> ALLOWED_CONTENT_TYPES =
            Set.of("image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp");

    private static final Set<String> ALLOWED_AUDIO_CONTENT_TYPES =
            Set.of("audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4", "audio/aac");

    private static final long MAX_AUDIO_BYTES = 3L * 1024 * 1024;

    // Anexo generico de mensagem (video/audio/documento/etc, ver uploadAttachment) - deliberadamente
    // sem lista de permitidos (Discord tambem aceita qualquer tipo), so' um bloqueio de extensoes
    // executaveis/perigosas, ja' que quem envia precisa estar logado (nao e' upload publico).
    private static final Set<String> BLOCKED_ATTACHMENT_EXTENSIONS =
            Set.of("exe", "msi", "bat", "cmd", "com", "scr", "dll", "apk", "jar", "vbs", "vbe", "ps1", "sh", "app", "deb", "rpm");

    private static final long MAX_ATTACHMENT_BYTES = 25L * 1024 * 1024;

    public record FileUploadResult(String url, String name, String contentType, long size) {}

    private final String accountId;
    private final String accessKeyId;
    private final String secretAccessKey;
    private final String bucketName;
    private final String publicBaseUrl;
    private final String baseFolder;
    private S3Client s3;

    public StorageService(@Value("${app.storage.r2.account-id:}") String accountId,
                           @Value("${app.storage.r2.access-key-id:}") String accessKeyId,
                           @Value("${app.storage.r2.secret-access-key:}") String secretAccessKey,
                           @Value("${app.storage.r2.bucket:}") String bucketName,
                           @Value("${app.storage.r2.public-base-url:}") String publicBaseUrl,
                           @Value("${app.storage.base-folder}") String baseFolder) {
        this.accountId = accountId;
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
        this.bucketName = bucketName;
        // Sem "/" no final - "upload()" sempre monta a URL como "publicBaseUrl + / + objeto",
        // uma barra dupla ("//") no meio nao quebra em HTTP mas fica feio/inconsistente.
        this.publicBaseUrl = publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        this.baseFolder = baseFolder;
    }

    @PostConstruct
    void init() {
        if (accountId.isBlank() || accessKeyId.isBlank() || secretAccessKey.isBlank() || bucketName.isBlank() || publicBaseUrl.isBlank()) {
            System.out.println("==============================================================");
            System.out.println(" AVISO: configuração do Cloudflare R2 incompleta (R2_ACCOUNT_ID/");
            System.out.println(" R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_BASE_URL).");
            System.out.println(" Upload de avatar/imagens vai falhar até você configurar essas variáveis.");
            System.out.println("==============================================================");
            return;
        }
        this.s3 = S3Client.builder()
                // R2 nao tem "regiao" de verdade (e' distribuido globalmente) - "auto" e' o
                // valor que a propria Cloudflare recomenda usar aqui pros SDKs da AWS.
                .region(Region.of("auto"))
                .endpointOverride(URI.create("https://" + accountId + ".r2.cloudflarestorage.com"))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                .build();
    }

    public String upload(MultipartFile file, String subFolder) {
        requireConfigured();
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Arquivo vazio");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("Tipo de arquivo nao permitido - envie uma imagem (png, jpg, gif ou webp)");
        }

        String extension = extensionFor(contentType);
        String objectName = "%s/%s/%s%s".formatted(baseFolder, subFolder, UUID.randomUUID(), extension);
        putObject(objectName, contentType, file);
        return publicBaseUrl + "/" + objectName;
    }

    public String uploadAudio(MultipartFile file, String subFolder) {
        requireConfigured();
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Arquivo vazio");
        }
        if (file.getSize() > MAX_AUDIO_BYTES) {
            throw new IllegalArgumentException("Áudio muito grande - o máximo é 3MB (mantenha o som curto)");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_AUDIO_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("Tipo de arquivo não permitido - envie um áudio (mp3, wav, ogg, webm, m4a ou aac)");
        }

        String extension = audioExtensionFor(contentType);
        String objectName = "%s/%s/%s%s".formatted(baseFolder, subFolder, UUID.randomUUID(), extension);
        putObject(objectName, contentType, file);
        return publicBaseUrl + "/" + objectName;
    }

    /** Anexo generico de chat (video, documento, arquivo qualquer, ou audio - inclusive mensagem
     *  de voz gravada no proprio app, ver useAudioRecorder.js no frontend) - diferente de upload()
     *  (so' imagem) e uploadAudio() (so' pro soundboard, com lista fechada de tipos), aqui o nome
     *  ORIGINAL do arquivo e' preservado no retorno (pra mostrar "relatorio.pdf" no chat, nao um
     *  uuid ilegivel) - o nome no BUCKET continua sendo um uuid (evita colisao/nome com caracter
     *  invalido em URL), so' o nome de exibicao que guarda o original. */
    public FileUploadResult uploadAttachment(MultipartFile file, String subFolder) {
        requireConfigured();
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Arquivo vazio");
        }
        if (file.getSize() > MAX_ATTACHMENT_BYTES) {
            throw new IllegalArgumentException("Arquivo muito grande - o máximo é 25MB");
        }
        String originalName = file.getOriginalFilename();
        String ext = "";
        if (originalName != null && originalName.contains(".")) {
            ext = originalName.substring(originalName.lastIndexOf('.') + 1).toLowerCase();
        }
        if (BLOCKED_ATTACHMENT_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("Esse tipo de arquivo não é permitido");
        }
        String contentType = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        String objectExt = ext.isBlank() ? "" : "." + ext;
        String objectName = "%s/%s/%s%s".formatted(baseFolder, subFolder, UUID.randomUUID(), objectExt);
        putObject(objectName, contentType, file);

        String url = publicBaseUrl + "/" + objectName;
        String displayName = (originalName == null || originalName.isBlank()) ? "arquivo" + objectExt : originalName;
        return new FileUploadResult(url, displayName, contentType, file.getSize());
    }

    private void requireConfigured() {
        if (s3 == null) {
            throw new IllegalStateException(
                    "Cloudflare R2 não configurado - defina R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_BASE_URL");
        }
    }

    private void putObject(String objectName, String contentType, MultipartFile file) {
        try {
            s3.putObject(
                    PutObjectRequest.builder().bucket(bucketName).key(objectName).contentType(contentType).build(),
                    RequestBody.fromBytes(file.getBytes()));
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao ler o arquivo enviado: " + e.getMessage(), e);
        }
    }

    private String extensionFor(String contentType) {
        return switch (contentType.toLowerCase()) {
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            default -> ".jpg";
        };
    }

    private String audioExtensionFor(String contentType) {
        return switch (contentType.toLowerCase()) {
            case "audio/wav", "audio/x-wav" -> ".wav";
            case "audio/ogg" -> ".ogg";
            case "audio/webm" -> ".webm";
            case "audio/mp4", "audio/aac" -> ".m4a";
            default -> ".mp3";
        };
    }
}
