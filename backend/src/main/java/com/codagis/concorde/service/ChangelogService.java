package com.codagis.concorde.service;

import com.codagis.concorde.domain.User;
import com.codagis.concorde.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Notas de versão ("Novidades") exibidas num modal ao abrir o Concorde.
 *
 * Cada versão é um arquivo em src/main/resources/changelog/, com o nome sendo a versão
 * (ex: 2026-11-23.md). A mais recente é a de maior nome em ordem alfabética - por isso o formato
 * AAAA-MM-DD (e, se sair mais de uma no mesmo dia, 2026-11-23b.md).
 */
@Service
public class ChangelogService {

    private final UserRepository userRepository;
    private List<Entry> entries = List.of();

    public ChangelogService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostConstruct
    void load() throws IOException {
        Resource[] resources = new PathMatchingResourcePatternResolver().getResources("classpath*:changelog/*.md");
        List<Entry> loaded = new ArrayList<>();
        for (Resource resource : resources) {
            String filename = resource.getFilename();
            if (filename == null) continue;
            String version = filename.substring(0, filename.length() - ".md".length());
            if (!version.matches("[A-Za-z0-9._-]{1,40}")) continue;
            String markdown = resource.getContentAsString(StandardCharsets.UTF_8).replace("\r\n", "\n").trim();
            loaded.add(new Entry(version, titleOf(markdown, version), summaryOf(markdown), markdown));
        }
        loaded.sort(Comparator.comparing(Entry::version).reversed());
        entries = List.copyOf(loaded);
    }

    public Optional<Entry> latest() {
        return entries.stream().findFirst();
    }

    public Optional<Entry> get(String version) {
        return entries.stream().filter(e -> e.version().equals(version)).findFirst();
    }

    public List<Summary> list() {
        return entries.stream().map(e -> new Summary(e.version(), e.title())).toList();
    }

    /** Versão nova que a pessoa ainda não viu (e que deve abrir sozinha), se houver. */
    public Optional<Entry> pendingFor(Long userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null || !user.isShowChangelog()) return Optional.empty();
        return latest().filter(e -> user.getLastSeenChangelog() == null
                || e.version().compareTo(user.getLastSeenChangelog()) > 0);
    }

    @Transactional
    public void markSeen(Long userId, String version) {
        userRepository.findById(userId).ifPresent(user -> {
            String current = user.getLastSeenChangelog();
            if (current == null || version.compareTo(current) > 0) {
                user.setLastSeenChangelog(version);
                userRepository.save(user);
            }
        });
    }

    public boolean showOnOpen(Long userId) {
        return userRepository.findById(userId).map(User::isShowChangelog).orElse(true);
    }

    @Transactional
    public void setShowOnOpen(Long userId, boolean show) {
        userRepository.findById(userId).ifPresent(user -> {
            user.setShowChangelog(show);
            userRepository.save(user);
        });
    }

    /** Conta nova não precisa ver as novidades de versões que saíram antes dela existir. */
    public String currentVersion() {
        return latest().map(Entry::version).orElse(null);
    }

    private static String titleOf(String markdown, String fallback) {
        return markdown.lines()
                .filter(l -> l.startsWith("# "))
                .map(l -> l.substring(2).trim())
                .findFirst()
                .orElse("Novidades da versão " + fallback);
    }

    /** Primeiro parágrafo de texto (sem títulos, listas, divisórias ou citações). */
    private static String summaryOf(String markdown) {
        StringBuilder sb = new StringBuilder();
        for (String line : markdown.split("\n")) {
            String t = line.trim();
            boolean structural = t.startsWith("#") || t.startsWith("-") || t.startsWith("*") || t.startsWith(">")
                    || t.matches("\\d+\\..*") || t.matches("[-*_]{3,}");
            if (t.isEmpty() || structural) {
                if (!sb.isEmpty()) break;
                continue;
            }
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(t);
        }
        String summary = sb.toString();
        return summary.length() > 600 ? summary.substring(0, 597) + "..." : summary;
    }

    public record Entry(String version, String title, String summary, String markdown) {}

    public record Summary(String version, String title) {}
}
