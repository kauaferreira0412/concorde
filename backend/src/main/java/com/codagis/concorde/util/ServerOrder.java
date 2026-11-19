package com.codagis.concorde.util;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/** Ordem pessoal dos servidores, guardada como "3,1,7". */
public final class ServerOrder {

    private ServerOrder() {}

    public static List<Long> parse(String raw) {
        List<Long> ids = new ArrayList<>();
        if (raw == null || raw.isBlank()) return ids;
        for (String part : raw.split(",")) {
            try {
                ids.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) {
                // valor corrompido: ignora
            }
        }
        return ids;
    }

    public static String format(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return null;
        StringBuilder sb = new StringBuilder();
        for (Long id : new LinkedHashSet<>(ids)) {
            if (id == null) continue;
            if (sb.length() > 0) sb.append(',');
            sb.append(id);
        }
        return sb.length() == 0 ? null : sb.toString();
    }
}
