package com.codagis.concorde.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Filtros da busca de mensagens (texto, autor, "tem:", antes/depois de uma data). */
public record SearchFilters(String text, Long authorId, boolean hasImage, boolean hasFile, boolean hasLink, boolean hasGif,
                            Instant after, Instant before) {

    private static final ZoneId ZONE = ZoneId.of("America/Sao_Paulo");
    private static final Instant MIN = Instant.parse("1970-01-01T00:00:00Z");
    private static final Instant MAX = Instant.parse("9999-01-01T00:00:00Z");

    public static SearchFilters of(String q, Long authorId, String has, String after, String before) {
        Set<String> kinds = has == null ? Set.of()
                : Arrays.stream(has.split(",")).map(String::trim).map(String::toLowerCase).collect(Collectors.toSet());
        return new SearchFilters(
                q == null ? "" : q.trim(),
                authorId == null ? -1L : authorId,
                kinds.contains("imagem") || kinds.contains("image"),
                kinds.contains("arquivo") || kinds.contains("file"),
                kinds.contains("link"),
                kinds.contains("gif"),
                parseDay(after, false),
                parseDay(before, true));
    }

    /** "depois:2025-01-10" inclui o dia 10; "antes:2025-01-10" vai até o fim do dia 9. */
    private static Instant parseDay(String value, boolean before) {
        if (value == null || value.isBlank()) return before ? MAX : MIN;
        try {
            return LocalDate.parse(value.trim()).atStartOfDay(ZONE).toInstant();
        } catch (Exception ex) {
            throw new IllegalArgumentException("Data inválida em antes:/depois: - use AAAA-MM-DD");
        }
    }

    public boolean isEmpty() {
        return text.isEmpty() && authorId == -1L && !hasImage && !hasFile && !hasLink && !hasGif
                && after.equals(MIN) && before.equals(MAX);
    }
}
