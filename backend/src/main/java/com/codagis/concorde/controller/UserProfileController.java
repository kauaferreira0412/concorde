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
        return new PublicProfileResponse(user.getId(), user.getUsername(), user.getNickname(), user.getAvatarUrl(),
                user.getBio(), presenceService.effectiveStatus(user.getId()), user.getCreatedAt(), user.getRole());
    }
}
