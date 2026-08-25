package com.codagis.concorde.controller;

import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.AuthDtos.ProfileRequest;
import com.codagis.concorde.dto.AuthDtos.StatusRequest;
import com.codagis.concorde.dto.AuthDtos.UserResponse;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.GcsService;
import com.codagis.concorde.ws.OnlinePresenceService;
import jakarta.validation.Valid;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/users/me")
public class AvatarController {

    private final GcsService gcsService;
    private final UserRepository userRepository;
    private final CurrentUser currentUser;
    private final OnlinePresenceService presenceService;

    public AvatarController(GcsService gcsService, UserRepository userRepository, CurrentUser currentUser,
                             OnlinePresenceService presenceService) {
        this.gcsService = gcsService;
        this.userRepository = userRepository;
        this.currentUser = currentUser;
        this.presenceService = presenceService;
    }

    @PostMapping(value = "/avatar", consumes = "multipart/form-data")
    @Transactional
    public UserResponse uploadAvatar(@RequestParam("file") MultipartFile file) {
        Long userId = currentUser.id();
        String url = gcsService.upload(file, "avatars/" + userId);

        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setAvatarUrl(url);
        userRepository.save(user);

        return toResponse(user);
    }

    @PutMapping("/status")
    @Transactional
    public UserResponse setStatus(@Valid @RequestBody StatusRequest req) {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setStatus(req.status());
        userRepository.save(user);
        presenceService.onStatusChanged(userId);
        return toResponse(user);
    }

    @PutMapping("/profile")
    @Transactional
    public UserResponse setProfile(@Valid @RequestBody ProfileRequest req) {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setNickname(blankToNull(req.nickname()));
        user.setBio(blankToNull(req.bio()));
        userRepository.save(user);
        return toResponse(user);
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getEmail(), user.getAvatarUrl(), user.getRole(),
                user.getStatus(), user.getNickname(), user.getBio());
    }
}
