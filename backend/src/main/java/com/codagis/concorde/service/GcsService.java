package com.codagis.concorde.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

@Service
public class GcsService {

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

    private final String credentialsJson;
    private final String bucketName;
    private final String baseFolder;
    private Storage storage;

    public GcsService(@Value("${app.gcs.credentials-json:}") String credentialsJson,
                       @Value("${app.gcs.bucket}") String bucketName,
                       @Value("${app.gcs.base-folder}") String baseFolder) {
        this.credentialsJson = credentialsJson;
        this.bucketName = bucketName;
        this.baseFolder = baseFolder;
    }

    @PostConstruct
    void init() {
        if (credentialsJson == null || credentialsJson.isBlank()) {
            System.out.println("==============================================================");
            System.out.println(" AVISO: variavel GCS_CREDENTIALS_JSON vazia.");
            System.out.println(" Upload de avatar/imagens vai falhar ate voce configurar essa variavel.");
            System.out.println("==============================================================");
            return;
        }
        try (InputStream in = new ByteArrayInputStream(credentialsJson.getBytes(StandardCharsets.UTF_8))) {
            GoogleCredentials credentials = GoogleCredentials.fromStream(in);
            this.storage = StorageOptions.newBuilder().setCredentials(credentials).build().getService();
        } catch (IOException e) {
            throw new IllegalStateException("Nao foi possivel carregar as credenciais do GCS: " + e.getMessage(), e);
        }
    }

    public String upload(MultipartFile file, String subFolder) {
        if (storage == null) {
            throw new IllegalStateException(
                    "Google Cloud Storage nao configurado - defina a variavel GCS_CREDENTIALS_JSON com o JSON da conta de servico");
        }
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Arquivo vazio");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_CONTENT_TYPES.contains(contentType.toLowerCase())) {
            throw new IllegalArgumentException("Tipo de arquivo nao permitido - envie uma imagem (png, jpg, gif ou webp)");
        }

        String extension = extensionFor(contentType);
        String objectName = "%s/%s/%s%s".formatted(baseFolder, subFolder, UUID.randomUUID(), extension);
        BlobId blobId = BlobId.of(bucketName, objectName);
        BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType(contentType).build();

        try {
            storage.create(blobInfo, file.getBytes());
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao ler o arquivo enviado: " + e.getMessage(), e);
        }

        return "https://storage.googleapis.com/%s/%s".formatted(bucketName, objectName);
    }

    public String uploadAudio(MultipartFile file, String subFolder) {
        if (storage == null) {
            throw new IllegalStateException(
                    "Google Cloud Storage nao configurado - defina a variavel GCS_CREDENTIALS_JSON com o JSON da conta de servico");
        }
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
        BlobId blobId = BlobId.of(bucketName, objectName);
        BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType(contentType).build();

        try {
            storage.create(blobInfo, file.getBytes());
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao ler o arquivo enviado: " + e.getMessage(), e);
        }

        return "https://storage.googleapis.com/%s/%s".formatted(bucketName, objectName);
    }

    /** Anexo generico de chat (video, documento, arquivo qualquer, ou audio - inclusive mensagem
     *  de voz gravada no proprio app, ver useAudioRecorder.js no frontend) - diferente de upload()
     *  (so' imagem) e uploadAudio() (so' pro soundboard, com lista fechada de tipos), aqui o nome
     *  ORIGINAL do arquivo e' preservado no retorno (pra mostrar "relatorio.pdf" no chat, nao um
     *  uuid ilegivel) - o nome no BUCKET continua sendo um uuid (evita colisao/nome com caracter
     *  invalido em URL), so' o nome de exibicao que guarda o original. */
    public FileUploadResult uploadAttachment(MultipartFile file, String subFolder) {
        if (storage == null) {
            throw new IllegalStateException(
                    "Google Cloud Storage nao configurado - defina a variavel GCS_CREDENTIALS_JSON com o JSON da conta de servico");
        }
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
        BlobId blobId = BlobId.of(bucketName, objectName);
        BlobInfo blobInfo = BlobInfo.newBuilder(blobId).setContentType(contentType).build();

        try {
            storage.create(blobInfo, file.getBytes());
        } catch (IOException e) {
            throw new IllegalStateException("Falha ao ler o arquivo enviado: " + e.getMessage(), e);
        }

        String url = "https://storage.googleapis.com/%s/%s".formatted(bucketName, objectName);
        String displayName = (originalName == null || originalName.isBlank()) ? "arquivo" + objectExt : originalName;
        return new FileUploadResult(url, displayName, contentType, file.getSize());
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
