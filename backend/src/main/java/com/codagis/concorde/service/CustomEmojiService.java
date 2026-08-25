package com.codagis.concorde.service;

import com.codagis.concorde.domain.CustomEmoji;
import com.codagis.concorde.dto.CustomEmojiDtos.CustomEmojiResponse;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.repository.CustomEmojiRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.regex.Pattern;

@Service
public class CustomEmojiService {

    private static final Pattern NAME_PATTERN = Pattern.compile("^[a-z0-9_]{2,30}$");
    private static final long MAX_EMOJI_BYTES = 512L * 1024;

    private final CustomEmojiRepository customEmojiRepository;
    private final GcsService gcsService;
    private final ServerService serverService;
    private final PermissionService permissionService;

    public CustomEmojiService(CustomEmojiRepository customEmojiRepository, GcsService gcsService,
                               ServerService serverService, PermissionService permissionService) {
        this.customEmojiRepository = customEmojiRepository;
        this.gcsService = gcsService;
        this.serverService = serverService;
        this.permissionService = permissionService;
    }

    public List<CustomEmojiResponse> listForServer(Long serverId, Long userId) {
        serverService.assertMember(serverId, userId);
        return customEmojiRepository.findByServerIdOrderByNameAsc(serverId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public CustomEmojiResponse upload(Long serverId, Long userId, MultipartFile file, String rawName) {
        serverService.assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_SERVER);

        String name = rawName == null ? "" : rawName.trim().toLowerCase();
        if (!NAME_PATTERN.matcher(name).matches()) {
            throw new IllegalArgumentException("Nome do emoji precisa ter 2 a 30 letras minúsculas, números ou _");
        }
        if (customEmojiRepository.existsByServerIdAndName(serverId, name)) {
            throw new IllegalArgumentException("Já existe um emoji com esse nome nesse servidor");
        }
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Arquivo vazio");
        }
        if (file.getSize() > MAX_EMOJI_BYTES) {
            throw new IllegalArgumentException("Imagem muito grande - o máximo é 512KB pra um emoji");
        }

        String url = gcsService.upload(file, "emoji/" + serverId);
        CustomEmoji emoji = customEmojiRepository.save(CustomEmoji.builder()
                .serverId(serverId)
                .name(name)
                .imageUrl(url)
                .createdBy(userId)
                .build());
        return toResponse(emoji);
    }

    @Transactional
    public void delete(Long serverId, Long userId, Long emojiId) {
        serverService.assertMember(serverId, userId);
        permissionService.assertHas(serverId, userId, ServerPermission.MANAGE_SERVER);
        CustomEmoji emoji = customEmojiRepository.findById(emojiId)
                .orElseThrow(() -> new IllegalArgumentException("Emoji não encontrado"));
        if (!emoji.getServerId().equals(serverId)) {
            throw new IllegalArgumentException("Esse emoji não é desse servidor");
        }
        customEmojiRepository.delete(emoji);
    }

    private CustomEmojiResponse toResponse(CustomEmoji emoji) {
        return new CustomEmojiResponse(emoji.getId(), emoji.getName(), emoji.getImageUrl());
    }
}
