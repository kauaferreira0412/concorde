package com.codagis.concorde.dto;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.PresenceStatus;

import java.time.Instant;

public class UserProfileDtos {

    public record PublicProfileResponse(Long id, String username, String nickname, String avatarUrl, String bio,
                                         PresenceStatus status, Instant createdAt, Role role,
                                         String bannerUrl, String customStatus, String accentColor,
                                         String accentColor2, java.util.List<AboutBlock> aboutBlocks) {}

    /** Um bloco do "Sobre mim": type = link | game | music. */
    public record AboutBlock(String type, String title, String subtitle, String url) {}

    public record AboutBlocksRequest(java.util.List<AboutBlock> blocks) {}
}
