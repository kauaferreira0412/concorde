package com.codagis.concorde.controller;

import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.UserProfileDtos.PublicProfileResponse;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.ws.OnlinePresenceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
        return toResponse(user);
    }

    // Busca por nome de usuario EXATO - usado pelo card de previa ao digitar num campo de
    // "adicionar amigo" (ver FriendsPanel.jsx), pra mostrar quem sera adicionado (foto/nome)
    // ANTES de mandar o pedido de verdade.
    @GetMapping("/by-username/{username}")
    public PublicProfileResponse getByUsername(@PathVariable String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalArgumentException("Usuário não encontrado"));
        return toResponse(user);
    }

    private PublicProfileResponse toResponse(User user) {
        return new PublicProfileResponse(user.getId(), user.getUsername(), user.getNickname(), user.getAvatarUrl(),
                user.getBio(), presenceService.effectiveStatus(user.getId()), user.getCreatedAt(), user.getRole());
    }
}
