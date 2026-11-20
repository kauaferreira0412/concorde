package com.codagis.concorde.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Cores próprias do card de perfil (fundo, caixas, contorno, textos, destaque e faixa),
 * guardadas como JSON numa coluna do usuário. Cor ausente = segue o tema de quem está vendo.
 */
public final class CardColors {

    public static final List<String> KEYS = List.of("bg", "surface", "border", "text", "muted", "accent", "banner");
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private CardColors() {}

    public static Map<String, String> parse(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            Map<String, String> map = JSON.readValue(raw, new TypeReference<Map<String, String>>() {});
            return map == null ? Map.of() : map;
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** Limpa e valida; lança IllegalArgumentException com mensagem amigável. Vazio = null (volta ao tema). */
    public static String format(Map<String, String> colors) {
        if (colors == null || colors.isEmpty()) return null;
        Map<String, String> clean = new LinkedHashMap<>();
        for (String key : KEYS) {
            String value = colors.get(key);
            if (value == null || value.isBlank()) continue;
            value = value.trim();
            if (!HEX.matcher(value).matches()) throw new IllegalArgumentException("Cor inválida em " + key);
            clean.put(key, value.toUpperCase(Locale.ROOT));
        }
        if (clean.isEmpty()) return null;
        try {
            return JSON.writeValueAsString(clean);
        } catch (Exception e) {
            throw new IllegalArgumentException("Não deu pra salvar as cores");
        }
    }
}
