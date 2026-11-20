package com.codagis.concorde.dto;

import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.PresenceStatus;

import java.time.Instant;

public class UserProfileDtos {

    public record PublicProfileResponse(Long id, String username, String nickname, String avatarUrl, String bio,
                                         PresenceStatus status, Instant createdAt, Role role,
                                         String bannerUrl, String customStatus, String accentColor,
                                         String accentColor2, java.util.List<AboutBlock> aboutBlocks,
                                         java.util.Map<String, String> cardColors) {}

    /** Cores do card (chaves de CardColors.KEYS); vazio volta ao tema. */
    public record CardColorsRequest(java.util.Map<String, String> colors) {}

    /** Um bloco do "Sobre mim": type = link | game | music. image = capa (opcional, https). */
    public record AboutBlock(String type, String title, String subtitle, String url, String image) {}

    public record AboutBlocksRequest(java.util.List<AboutBlock> blocks) {}
}
