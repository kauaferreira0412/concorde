package com.codagis.concorde.service;

import com.codagis.concorde.domain.CharacterSheet;
import com.codagis.concorde.domain.ChannelCategory;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.CharacterSheetDtos.CharacterSheetResponse;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.repository.CategoryAccessRepository;
import com.codagis.concorde.repository.ChannelCategoryRepository;
import com.codagis.concorde.repository.CharacterSheetRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Fichas de personagem em PDF - kit de RPG (pedido explicito do usuario). Vivem numa
 * CATEGORIA inteira (a campanha), nao num canal especifico - assim ficam juntas com o
 * mapa/sessoes/chats da mesma mesa. Qualquer membro com acesso aquela categoria pode subir a
 * PROPRIA ficha (varias, se quiser - um personagem novo, um NPC etc); so' apaga a sua ou o
 * mestre (dono da categoria, ver ChannelCategory.createdBy) apaga qualquer uma.
 */
@Service
public class CharacterSheetService {

    private final CharacterSheetRepository characterSheetRepository;
    private final ChannelCategoryRepository channelCategoryRepository;
    private final MembershipRepository membershipRepository;
    private final CategoryAccessRepository categoryAccessRepository;
    private final PermissionService permissionService;
    private final UserRepository userRepository;

    public CharacterSheetService(CharacterSheetRepository characterSheetRepository,
                                  ChannelCategoryRepository channelCategoryRepository,
                                  MembershipRepository membershipRepository,
                                  CategoryAccessRepository categoryAccessRepository,
                                  PermissionService permissionService, UserRepository userRepository) {
        this.characterSheetRepository = characterSheetRepository;
        this.channelCategoryRepository = channelCategoryRepository;
        this.membershipRepository = membershipRepository;
        this.categoryAccessRepository = categoryAccessRepository;
        this.permissionService = permissionService;
        this.userRepository = userRepository;
    }

    /** Confere que a categoria existe, pertence a esse servidor, o usuario e' membro do
     *  servidor e (se a categoria tiver acesso restrito) esta' na lista - devolve ela pra quem
     *  chamou nao precisar buscar de novo. Mesma regra de acesso do mapa (ver MapService). */
    private ChannelCategory assertCanUseSheets(Long serverId, Long categoryId, Long userId) {
        ChannelCategory category = channelCategoryRepository.findById(categoryId)
                .orElseThrow(() -> new IllegalArgumentException("Categoria não encontrada"));
        if (!category.getServerId().equals(serverId)) {
            throw new IllegalArgumentException("Categoria não pertence a esse servidor");
        }
        if (!membershipRepository.existsByServerIdAndUserId(serverId, userId)) {
            throw new IllegalStateException("Você não pertence a esse servidor");
        }
        var entries = categoryAccessRepository.findByCategoryId(categoryId);
        boolean restricted = !entries.isEmpty();
        boolean allowed = entries.stream().anyMatch(e -> e.getUserId().equals(userId));
        if (restricted && !allowed) {
            throw new IllegalStateException("Você não tem acesso a essa categoria");
        }
        return category;
    }

    public List<CharacterSheetResponse> list(Long serverId, Long categoryId, Long userId) {
        assertCanUseSheets(serverId, categoryId, userId);
        List<CharacterSheet> sheets = characterSheetRepository.findByCategoryIdOrderByUploadedAtDesc(categoryId);
        Map<Long, User> usersById = userRepository.findAllById(sheets.stream().map(CharacterSheet::getOwnerUserId).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, u -> u));
        return sheets.stream().map(s -> toResponse(s, usersById.get(s.getOwnerUserId()))).toList();
    }

    @Transactional
    public CharacterSheetResponse upload(Long serverId, Long categoryId, Long userId, String characterName,
                                          String fileUrl, String fileName, Long fileSize) {
        assertCanUseSheets(serverId, categoryId, userId);
        String name = (characterName == null || characterName.isBlank()) ? "Personagem" : characterName.trim();
        if (name.length() > 60) name = name.substring(0, 60);
        CharacterSheet sheet = characterSheetRepository.save(CharacterSheet.builder()
                .categoryId(categoryId)
                .ownerUserId(userId)
                .characterName(name)
                .fileUrl(fileUrl)
                .fileName(fileName)
                .fileSize(fileSize)
                .build());
        return toResponse(sheet, userRepository.findById(userId).orElse(null));
    }

    @Transactional
    public void delete(Long serverId, Long categoryId, Long userId, Long sheetId) {
        ChannelCategory category = assertCanUseSheets(serverId, categoryId, userId);
        CharacterSheet sheet = characterSheetRepository.findById(sheetId)
                .orElseThrow(() -> new IllegalArgumentException("Ficha não encontrada"));
        if (!sheet.getCategoryId().equals(categoryId)) {
            throw new IllegalArgumentException("Ficha não pertence a essa categoria");
        }
        boolean isOwner = sheet.getOwnerUserId().equals(userId);
        boolean isMaster = category.getCreatedBy() != null && category.getCreatedBy().equals(userId);
        boolean canManage = permissionService.has(serverId, userId, ServerPermission.MANAGE_CHANNELS);
        if (!isOwner && !isMaster && !canManage) {
            throw new IllegalStateException("Só quem subiu essa ficha (ou o mestre) pode apagá-la");
        }
        characterSheetRepository.delete(sheet);
    }

    private CharacterSheetResponse toResponse(CharacterSheet sheet, User owner) {
        return new CharacterSheetResponse(sheet.getId(), sheet.getCategoryId(), sheet.getOwnerUserId(),
                owner != null ? owner.getUsername() : "desconhecido", owner != null ? owner.getAvatarUrl() : null,
                sheet.getCharacterName(), sheet.getFileUrl(), sheet.getFileName(), sheet.getFileSize(), sheet.getUploadedAt());
    }
}
