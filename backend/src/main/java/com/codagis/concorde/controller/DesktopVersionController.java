package com.codagis.concorde.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/desktop")
public class DesktopVersionController {

    @Value("classpath:desktop-min-version.txt")
    private Resource minVersionResource;

    @Value("${app.desktop.min-version-override:}")
    private String minVersionOverride;

    @Value("${app.desktop.download-url}")
    private String downloadUrl;

    public record DesktopVersionResponse(String latestBuildId, String downloadUrl) {}

    @GetMapping("/version")
    public DesktopVersionResponse getVersion() {
        return new DesktopVersionResponse(resolveLatestBuildId(), downloadUrl);
    }

    private String resolveLatestBuildId() {
        if (minVersionOverride != null && !minVersionOverride.isBlank()) {
            return minVersionOverride.trim();
        }
        try {
            return minVersionResource.getContentAsString(StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            throw new UncheckedIOException("Não foi possível ler desktop-min-version.txt", e);
        }
    }
}
