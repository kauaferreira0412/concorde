package com.codagis.discordclone.controller;

import com.codagis.discordclone.domain.User;
import com.codagis.discordclone.dto.UserProfileDtos.PublicProfileResponse;
import com.codagis.discordclone.repository.UserRepository;
import com.codagis.discordclone.ws.OnlinePresenceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Perfil publico de qualquer usuario (clicavel a partir do chat, lista de membros, canal de
 * voz - ver ProfileModal.jsx no frontend). Nao exige serem do mesmo servidor: como so' o
 * ADMIN cria contas e nao ha cadastro publico, qualquer usuario autenticado ja e' "de
 * confianca" o bastante pra ver o perfil (nome/foto/bio) de outro - nada sensivel exposto aqui.
 */
@RestController
@RequestMapping("/api/users")
public class UserProfileController {

    private final UserRepository userRepository;
    private final OnlinePresenceService presenceService;

    public UserProfileController(UserRepository userRepository, OnlinePresenceService presenceService) {
        this.userRepository = userRepository;
        this.presenceService = presenceService;
    }

    @GetMapping("/{userId}/profile")
    public PublicProfileResponse getProfile(@PathVariable Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Usuario nao encontrado"));
        return new PublicProfileResponse(user.getId(), user.getUsername(), user.getNickname(), user.getAvatarUrl(),
                user.getBio(), presenceService.effectiveStatus(user.getId()), user.getCreatedAt(), user.getRole());
    }
}
