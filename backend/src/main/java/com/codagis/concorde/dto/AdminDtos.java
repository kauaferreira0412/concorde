package com.codagis.concorde.dto;

import com.codagis.concorde.enums.Role;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public class AdminDtos {

    public record GrantAccessRequest(@NotNull Long userId) {}

    public record UpdateUserRequest(
            @NotBlank @Size(min = 3, max = 32) String username,
            @NotBlank @Email String email,
            String password,
            @NotNull Role role
    ) {}
}
