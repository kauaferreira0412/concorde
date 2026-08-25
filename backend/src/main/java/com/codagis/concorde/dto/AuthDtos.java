package com.codagis.concorde.dto;

import com.codagis.concorde.domain.Role;
import com.codagis.concorde.domain.UserStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class AuthDtos {

    public record LoginRequest(
            @NotBlank String usernameOrEmail,
            @NotBlank String password
    ) {}

    public record UserResponse(Long id, String username, String email, String avatarUrl, Role role, UserStatus status,
                                String nickname, String bio) {}

    public record AuthResponse(String token, UserResponse user) {}

    public record CreateUserRequest(
            @NotBlank @Size(min = 3, max = 32) String username,
            @NotBlank @Email String email,
            @NotBlank @Size(min = 6) String password
    ) {}

    public record StatusRequest(@NotNull UserStatus status) {}

    public record ProfileRequest(@Size(max = 32) String nickname, @Size(max = 190) String bio) {}
}
