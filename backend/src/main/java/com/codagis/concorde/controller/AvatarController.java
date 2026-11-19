package com.codagis.concorde.controller;

import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.AuthDtos.AccentColorRequest;
import com.codagis.concorde.dto.AuthDtos.ServerOrderRequest;
import com.codagis.concorde.dto.AuthDtos.AvatarAnimationRequest;
import com.codagis.concorde.dto.AuthDtos.CustomStatusRequest;
import com.codagis.concorde.dto.AuthDtos.ProfileRequest;
import com.codagis.concorde.dto.AuthDtos.StatusRequest;
import com.codagis.concorde.dto.AuthDtos.UserResponse;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.StorageService;
import com.codagis.concorde.ws.OnlinePresenceService;
import jakarta.validation.Valid;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/users/me")
public class AvatarController {

    private final StorageService storageService;
    private final UserRepository userRepository;
    private final CurrentUser currentUser;
    private final OnlinePresenceService presenceService;

    public AvatarController(StorageService storageService, UserRepository userRepository, CurrentUser currentUser,
                             OnlinePresenceService presenceService) {
        this.storageService = storageService;
        this.userRepository = userRepository;
        this.currentUser = currentUser;
        this.presenceService = presenceService;
    }

    @PostMapping(value = "/avatar", consumes = "multipart/form-data")
    @Transactional
    public UserResponse uploadAvatar(@RequestParam("file") MultipartFile file) {
        Long userId = currentUser.id();
        String url = storageService.upload(file, "avatars/" + userId);

        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setAvatarUrl(url);
        userRepository.save(user);

        return toResponse(user);
    }

    @PostMapping(value = "/banner", consumes = "multipart/form-data")
    @Transactional
    public UserResponse uploadBanner(@RequestParam("file") MultipartFile file) {
        Long userId = currentUser.id();
        String url = storageService.upload(file, "banners/" + userId);

        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setBannerUrl(url);
        userRepository.save(user);

        return toResponse(user);
    }

    @DeleteMapping("/banner")
    @Transactional
    public UserResponse removeBanner() {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setBannerUrl(null);
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

    @PutMapping("/custom-status")
    @Transactional
    public UserResponse setCustomStatus(@Valid @RequestBody CustomStatusRequest req) {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setCustomStatus(blankToNull(req.text()));
        userRepository.save(user);
        presenceService.onStatusChanged(userId);
        return toResponse(user);
    }

    @PutMapping("/avatar-animation")
    @Transactional
    public UserResponse setAvatarAnimation(@RequestBody AvatarAnimationRequest req) {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setAvatarAnimateOnSpeak(req.onlyWhenSpeaking());
        userRepository.save(user);
        return toResponse(user);
    }

    @PutMapping("/server-order")
    @Transactional
    public UserResponse setServerOrder(@Valid @RequestBody ServerOrderRequest req) {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        user.setServerOrder(com.codagis.concorde.util.ServerOrder.format(req.ids()));
        userRepository.save(user);
        return toResponse(user);
    }

    @PutMapping("/accent-color")
    @Transactional
    public UserResponse setAccentColor(@Valid @RequestBody AccentColorRequest req) {
        Long userId = currentUser.id();
        User user = userRepository.findById(userId).orElseThrow(() -> new IllegalStateException("Usuario nao encontrado"));
        String color = blankToNull(req.color());
        user.setAccentColor(color == null ? null : color.toUpperCase(java.util.Locale.ROOT));
        userRepository.save(user);
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
                user.getStatus(), user.getNickname(), user.getBio(), user.getBannerUrl(), user.getCustomStatus(), user.getAccentColor(),
                com.codagis.concorde.util.ServerOrder.parse(user.getServerOrder()), user.isAvatarAnimateOnSpeakEnabled());
    }
}
