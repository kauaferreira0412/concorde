package com.codagis.discordclone.dto;

import com.codagis.discordclone.domain.Role;
import com.codagis.discordclone.ws.PresenceStatus;

import java.time.Instant;

public class UserProfileDtos {

    /**
     * Perfil PUBLICO de um usuario (o que qualquer outro usuario logado pode ver ao clicar
     * nele) - sem email nem nada sensivel, so' o que aparece em qualquer app de chat. "role"
     * foi adicionado so' pro selo de Administrador no card (ver ProfileModal.jsx) - continua
     * sem nada sensivel (nao e' segredo quem e' admin).
     */
    public record PublicProfileResponse(Long id, String username, String nickname, String avatarUrl, String bio,
                                         PresenceStatus status, Instant createdAt, Role role) {}
}
