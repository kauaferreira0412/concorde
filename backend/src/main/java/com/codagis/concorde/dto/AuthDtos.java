package com.codagis.concorde.dto;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.UserStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class AuthDtos {

    public record LoginRequest(
            @NotBlank String usernameOrEmail,
            @NotBlank String password,
            Boolean rememberMe
    ) {}

    public record UserResponse(Long id, String username, String email, String avatarUrl, Role role, UserStatus status,
                                String nickname, String bio, String bannerUrl, String customStatus,
                                String accentColor, java.util.List<Long> serverOrder,
                                boolean avatarAnimateOnSpeak) {}

    public record AuthResponse(String token, UserResponse user) {}

    public record CreateUserRequest(
            @NotBlank @Size(min = 3, max = 32) String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 6) String password
    ) {}

    public record StatusRequest(@NotNull UserStatus status) {}

    public record AvatarAnimationRequest(boolean onlyWhenSpeaking) {}

    public record ServerOrderRequest(@NotNull @Size(max = 200) java.util.List<Long> ids) {}

    public record AccentColorRequest(
            @jakarta.validation.constraints.Pattern(regexp = "^(#[0-9a-fA-F]{6})?$", message = "Cor inválida") String color) {}

    public record CustomStatusRequest(@jakarta.validation.constraints.Size(max = 80) String text) {}

    public record ProfileRequest(@Size(max = 32) String nickname, @Size(max = 190) String bio) {}
}
