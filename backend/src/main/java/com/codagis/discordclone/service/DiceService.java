package com.codagis.discordclone.service;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Rolagem de dados pro comando /roll (ver ChatController/DiceRollCard no frontend) - notacao
 * de mesa classica "NdM+K" (ex: "2d20+5", "d6", "1d100-2"). SecureRandom de proposito - roda
 * so' aqui no servidor, ninguem consegue forjar um resultado mexendo no cliente.
 */
@Service
public class DiceService {

    // Grupo 1 = quantidade (opcional, default 1), grupo 2 = lados, grupo 3 = modificador (opcional).
    private static final Pattern NOTATION = Pattern.compile("^(\\d{0,2})[dD](\\d{1,3})\\s*([+-]\\s*\\d{1,3})?$");
    private static final Set<Integer> ALLOWED_SIDES = Set.of(4, 6, 8, 10, 12, 20, 100);

    private final SecureRandom random = new SecureRandom();

    public record RollResult(String notation, int sides, int[] results, int modifier, int total) {}

    public RollResult roll(String notationRaw) {
        if (notationRaw == null || notationRaw.isBlank()) {
            throw new IllegalArgumentException("Notação de dado vazia - use algo como 1d20, 2d6+3 ou d100");
        }
        Matcher m = NOTATION.matcher(notationRaw.trim());
        if (!m.matches()) {
            throw new IllegalArgumentException("Notação inválida - use algo como 1d20, 2d6+3 ou d100");
        }
        int count = (m.group(1) == null || m.group(1).isEmpty()) ? 1 : Integer.parseInt(m.group(1));
        int sides = Integer.parseInt(m.group(2));
        int modifier = m.group(3) == null ? 0 : Integer.parseInt(m.group(3).replaceAll("\\s+", ""));

        if (count < 1 || count > 20) {
            throw new IllegalArgumentException("Só dá pra rolar de 1 a 20 dados de uma vez");
        }
        if (!ALLOWED_SIDES.contains(sides)) {
            throw new IllegalArgumentException("Dado inválido - use d4, d6, d8, d10, d12, d20 ou d100");
        }

        int[] results = new int[count];
        int sum = 0;
        for (int i = 0; i < count; i++) {
            int r = random.nextInt(sides) + 1;
            results[i] = r;
            sum += r;
        }
        String canonical = count + "d" + sides + (modifier > 0 ? "+" + modifier : modifier < 0 ? String.valueOf(modifier) : "");
        return new RollResult(canonical, sides, results, modifier, sum + modifier);
    }
}
