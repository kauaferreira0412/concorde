package com.codagis.discordclone.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controle de versao do app desktop (Electron) - checado pelo frontend ANTES do login (ver
 * UpdateRequiredGate.jsx), publico de proposito (ver SecurityConfig, /api/desktop/** e'
 * permitAll) porque ainda nao existe token nenhum nesse momento. Quem esta com versao
 * instalada MENOR que "minVersion" fica bloqueado com uma tela pedindo pra atualizar.
 */
@RestController
@RequestMapping("/api/desktop")
public class DesktopVersionController {

    @Value("${app.desktop.min-version}")
    private String minVersion;

    @Value("${app.desktop.download-url}")
    private String downloadUrl;

    public record DesktopVersionResponse(String minVersion, String downloadUrl) {}

    @GetMapping("/version")
    public DesktopVersionResponse getVersion() {
        return new DesktopVersionResponse(minVersion, downloadUrl);
    }
}
