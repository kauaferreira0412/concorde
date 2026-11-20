package com.codagis.concorde.util;

import com.codagis.concorde.dto.UserProfileDtos.AboutBlock;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Blocos do "Sobre mim" guardados como JSON numa coluna do usuário. */
public final class AboutBlocks {

    public static final int MAX_BLOCKS = 8;
    private static final Set<String> TYPES = Set.of("link", "game", "music");
    private static final ObjectMapper JSON = new ObjectMapper();

    private AboutBlocks() {}

    public static List<AboutBlock> parse(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<AboutBlock> list = JSON.readValue(raw, new TypeReference<List<AboutBlock>>() {});
            return list == null ? List.of() : list;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** Limpa e valida; lança IllegalArgumentException com mensagem amigável. */
    public static String format(List<AboutBlock> blocks) {
        if (blocks == null || blocks.isEmpty()) return null;
        if (blocks.size() > MAX_BLOCKS) throw new IllegalArgumentException("No máximo " + MAX_BLOCKS + " blocos");
        List<AboutBlock> clean = new ArrayList<>();
        for (AboutBlock b : blocks) {
            if (b == null) continue;
            String type = trim(b.type());
            if (type == null || !TYPES.contains(type)) throw new IllegalArgumentException("Tipo de bloco inválido");
            String title = trim(b.title());
            if (title == null) throw new IllegalArgumentException("Todo bloco precisa de um título");
            if (title.length() > 60) throw new IllegalArgumentException("Título muito longo (máx. 60)");
            String subtitle = trim(b.subtitle());
            if (subtitle != null && subtitle.length() > 80) throw new IllegalArgumentException("Detalhe muito longo (máx. 80)");
            String url = trim(b.url());
            if (url != null) {
                if (url.length() > 300) throw new IllegalArgumentException("Link muito longo");
                String lower = url.toLowerCase(java.util.Locale.ROOT);
                if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
                    url = "https://" + url;
                }
                try {
                    java.net.URI uri = new java.net.URI(url);
                    if (uri.getHost() == null || uri.getHost().isBlank()) throw new IllegalArgumentException();
                } catch (Exception e) {
                    throw new IllegalArgumentException("Link inválido: " + b.url());
                }
            }
            if ("link".equals(type) && url == null) throw new IllegalArgumentException("Bloco de link precisa do endereço");
            clean.add(new AboutBlock(type, title, subtitle, url, cleanImage(b.image())));
        }
        if (clean.isEmpty()) return null;
        try {
            return JSON.writeValueAsString(clean);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Capa só se for um endereço https válido (vem da prévia do link); senão some sem dar erro. */
    private static String cleanImage(String raw) {
        String image = trim(raw);
        if (image == null || image.length() > 600) return null;
        try {
            java.net.URI uri = new java.net.URI(image);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return null;
            return image;
        } catch (Exception e) {
            return null;
        }
    }

    private static String trim(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
