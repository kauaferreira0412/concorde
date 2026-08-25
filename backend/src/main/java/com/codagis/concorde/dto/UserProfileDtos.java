package com.codagis.concorde.dto;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.PresenceStatus;

import java.time.Instant;

public class UserProfileDtos {

    public record PublicProfileResponse(Long id, String username, String nickname, String avatarUrl, String bio,
                                         PresenceStatus status, Instant createdAt, Role role) {}
}
