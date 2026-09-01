package com.codagis.concorde.service;

import com.codagis.concorde.domain.CharacterSheet;
import com.codagis.concorde.domain.ChannelCategory;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.CharacterSheetDtos.CharacterSheetResponse;
import com.codagis.concorde.repository.CategoryAccessRepository;
import com.codagis.concorde.repository.ChannelCategoryRepository;
import com.codagis.concorde.repository.CharacterSheetRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Personagens de uma mesa de RPG (villoes, NPCs, personagens de jogador - kit de RPG, pedido
 * explicito do usuario). SO' o mestre (quem criou a categoria) cria personagens e decide qual
 * JOGADOR fica vinculado a cada um - o jogador vinculado ve e EDITA essa ficha (nome/foto/PDF);
 * quem nao esta' vinculado nem sabe que existe (personagem some da lista dele, ver list()).
 */
@Service
public class CharacterSheetService {

    private final CharacterSheetRepository characterSheetRepository;
    private final ChannelCategoryRepository channelCategoryRepository;
    private final MembershipRepository membershipRepository;
    private final CategoryAccessRepository categoryAccessRepository;
    private final UserRepository userRepository;

    public CharacterSheetService(CharacterSheetRepository characterSheetRepository,
                                  ChannelCategoryRepository channelCategoryRepository,
                                  MembershipRepository membershipRepository,
                                  CategoryAccessRepository categoryAccessRepository,
                                  UserRepository userRepository) {
        this.characterSheetRepository = characterSheetRepository;
        this.channelCategoryRepository = channelCategoryRepository;
        this.membershipRepository = membershipRepository;
        this.categoryAccessRepository = categoryAccessRepository;
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

    private boolean isMaster(ChannelCategory category, Long userId) {
        return category.getCreatedBy() != null && category.getCreatedBy().equals(userId);
    }

    private boolean canEdit(ChannelCategory category, CharacterSheet sheet, Long userId) {
        return isMaster(category, userId) || (sheet.getLinkedUserId() != null && sheet.getLinkedUserId().equals(userId));
    }

    /** Mestre ve TODOS os personagens da mesa. Jogador comum so' ve os que estao VINCULADOS a
     *  ele - villao/NPC (sem vinculo nenhum) ou o personagem de outro jogador simplesmente nao
     *  aparecem (pedido explicito do usuario). */
    public List<CharacterSheetResponse> list(Long serverId, Long categoryId, Long userId) {
        ChannelCategory category = assertCanUseSheets(serverId, categoryId, userId);
        boolean master = isMaster(category, userId);
        List<CharacterSheet> sheets = characterSheetRepository.findByCategoryIdOrderByUploadedAtDesc(categoryId).stream()
                .filter(s -> master || (s.getLinkedUserId() != null && s.getLinkedUserId().equals(userId)))
                .toList();
        return sheets.stream().map(s -> toResponse(s, category, userId)).toList();
    }

    /** So' o mestre cria personagem novo (pedido explicito: "os jogadores nao criam personagem
     *  dentro da mesa do mestre, so' o mestre que cria"). imageUrl/fileUrl/fileName/fileSize
     *  todos opcionais - da' pra criar so' com o nome e completar depois. */
    @Transactional
    public CharacterSheetResponse create(Long serverId, Long categoryId, Long userId, String characterName,
                                          String imageUrl, String fileUrl, String fileName, Long fileSize) {
        ChannelCategory category = assertCanUseSheets(serverId, categoryId, userId);
        if (!isMaster(category, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode criar personagens");
        }
        String name = (characterName == null || characterName.isBlank()) ? "Personagem" : characterName.trim();
        if (name.length() > 60) name = name.substring(0, 60);
        CharacterSheet sheet = characterSheetRepository.save(CharacterSheet.builder()
                .categoryId(categoryId)
                .ownerUserId(userId)
                .characterName(name)
                .imageUrl(blankToNull(imageUrl))
                .fileUrl(blankToNull(fileUrl))
                .fileName(blankToNull(fileName))
                .fileSize(fileSize)
                .build());
        return toResponse(sheet, category, userId);
    }

    /** Mestre OU o jogador vinculado podem editar (pedido explicito: "o jogador b... podendo
     *  ate' alterar"). Cada parametro null = nao mexe no que ja' tem; "" (string vazia) REMOVE
     *  foto/PDF atual - mesma convencao ja' usada em MapService.renameToken pros tokens. */
    @Transactional
    public CharacterSheetResponse update(Long serverId, Long categoryId, Long userId, Long sheetId,
                                          String characterName, String imageUrl, String fileUrl, String fileName, Long fileSize) {
        ChannelCategory category = assertCanUseSheets(serverId, categoryId, userId);
        CharacterSheet sheet = requireSheetOfCategory(categoryId, sheetId);
        if (!canEdit(category, sheet, userId)) {
            throw new IllegalStateException("Você não tem permissão pra editar essa ficha");
        }
        if (characterName != null && !characterName.isBlank()) {
            sheet.setCharacterName(characterName.trim().length() > 60 ? characterName.trim().substring(0, 60) : characterName.trim());
        }
        if (imageUrl != null) {
            sheet.setImageUrl(imageUrl.isBlank() ? null : imageUrl);
        }
        if (fileUrl != null) {
            if (fileUrl.isBlank()) {
                sheet.setFileUrl(null);
                sheet.setFileName(null);
                sheet.setFileSize(null);
            } else {
                sheet.setFileUrl(fileUrl);
                sheet.setFileName(fileName);
                sheet.setFileSize(fileSize);
            }
        }
        return toResponse(characterSheetRepository.save(sheet), category, userId);
    }

    /** So' o mestre vincula (ou desvincula, userId null) um jogador a um personagem - pedido
     *  explicito: "e' o mestre que vai dizer qual ficha cada jogador tem acesso". Precisa ser
     *  membro do servidor (nao da' pra vincular alguem de fora). */
    @Transactional
    public CharacterSheetResponse linkPlayer(Long serverId, Long categoryId, Long userId, Long sheetId, Long linkedUserId) {
        ChannelCategory category = assertCanUseSheets(serverId, categoryId, userId);
        if (!isMaster(category, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode vincular jogadores");
        }
        CharacterSheet sheet = requireSheetOfCategory(categoryId, sheetId);
        if (linkedUserId != null && !membershipRepository.existsByServerIdAndUserId(serverId, linkedUserId)) {
            throw new IllegalArgumentException("Esse usuário não é membro desse servidor");
        }
        sheet.setLinkedUserId(linkedUserId);
        return toResponse(characterSheetRepository.save(sheet), category, userId);
    }

    /** So' o mestre apaga um personagem (o jogador vinculado edita, mas nao apaga - continuidade
     *  da campanha e' decisao do mestre). */
    @Transactional
    public void delete(Long serverId, Long categoryId, Long userId, Long sheetId) {
        ChannelCategory category = assertCanUseSheets(serverId, categoryId, userId);
        if (!isMaster(category, userId)) {
            throw new IllegalStateException("Só o mestre dessa categoria pode apagar um personagem");
        }
        CharacterSheet sheet = requireSheetOfCategory(categoryId, sheetId);
        characterSheetRepository.delete(sheet);
    }

    private CharacterSheet requireSheetOfCategory(Long categoryId, Long sheetId) {
        CharacterSheet sheet = characterSheetRepository.findById(sheetId)
                .orElseThrow(() -> new IllegalArgumentException("Personagem não encontrado"));
        if (!sheet.getCategoryId().equals(categoryId)) {
            throw new IllegalArgumentException("Personagem não pertence a essa categoria");
        }
        return sheet;
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private CharacterSheetResponse toResponse(CharacterSheet sheet, ChannelCategory category, Long viewerUserId) {
        User linked = sheet.getLinkedUserId() != null ? userRepository.findById(sheet.getLinkedUserId()).orElse(null) : null;
        return new CharacterSheetResponse(sheet.getId(), sheet.getCategoryId(), sheet.getCharacterName(), sheet.getImageUrl(),
                sheet.getFileUrl(), sheet.getFileName(), sheet.getFileSize(),
                sheet.getLinkedUserId(), linked != null ? linked.getUsername() : null, linked != null ? linked.getAvatarUrl() : null,
                sheet.getUploadedAt(), canEdit(category, sheet, viewerUserId));
    }
}
