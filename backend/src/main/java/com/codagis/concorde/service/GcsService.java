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

    private String extensionFor(String contentType) {
        return switch (contentType.toLowerCase()) {
            case "image/png" -> ".png";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            default -> ".jpg";
        };
    }
}
