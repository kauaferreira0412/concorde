package com.codagis.discordclone.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/**
 * Controle de versao do app desktop (Electron) - checado pelo frontend ANTES do login (ver
 * UpdateRequiredGate.jsx), publico de proposito (ver SecurityConfig, /api/desktop/** e'
 * permitAll) porque ainda nao existe token nenhum nesse momento.
 *
 * "latestBuildId" e' um timestamp (nao o commit do git - ver package-desktop.mjs pro motivo)
 * do instalador mais recente PUBLICADO - toda vez que "npm run package:desktop" gera um
 * instalador novo, ele grava esse mesmo timestamp tanto DENTRO do instalador (embutido no
 * bundle React, ver VITE_APP_BUILD_ID) quanto aqui (desktop-min-version.txt, classpath). Ou
 * seja: publicar um instalador novo JA descontinua automaticamente qualquer instalacao
 * anterior, sem precisar editar nada no servidor na mao - o app desktop compara o proprio
 * build id embutido nele com esse valor, e QUALQUER diferenca (nao so' "menor que") conta
 * como desatualizado.
 */
@RestController
@RequestMapping("/api/desktop")
public class DesktopVersionController {

    @Value("classpath:desktop-min-version.txt")
    private Resource minVersionResource;

    // Escape hatch manual (variavel DESKTOP_MIN_VERSION) - vazio por padrao, so' usado se um
    // dia precisar forcar um valor sem publicar um instalador novo (ver application.yml).
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
