package com.codagis.concorde.service;

import com.codagis.concorde.domain.CharacterSheet;
import com.codagis.concorde.domain.Server;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.CharacterSheetDtos.CharacterSheetResponse;
import com.codagis.concorde.repository.CharacterSheetRepository;
import com.codagis.concorde.repository.MembershipRepository;
import com.codagis.concorde.repository.ServerRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Personagens de uma mesa de RPG (villoes, NPCs, personagens de jogador - kit de RPG, pedido
 * explicito do usuario). Vive no SERVIDOR inteiro (cada servidor RPG e' uma mesa/campanha so' -
 * pedido explicito: "desvincule as fichas dos personagens de uma categoria"). SO' o mestre (o
 * dono do servidor) cria personagens e decide qual JOGADOR fica vinculado a cada um - o jogador
 * vinculado ve e EDITA essa ficha (nome/foto/PDF); quem nao esta' vinculado nem sabe que existe
 * (personagem some da lista dele, ver list()).
 */
@Service
public class CharacterSheetService {

    private final CharacterSheetRepository characterSheetRepository;
    private final ServerRepository serverRepository;
    private final MembershipRepository membershipRepository;
    private final PermissionService permissionService;
    private final UserRepository userRepository;

    public CharacterSheetService(CharacterSheetRepository characterSheetRepository, ServerRepository serverRepository,
                                  MembershipRepository membershipRepository, PermissionService permissionService,
                                  UserRepository userRepository) {
        this.characterSheetRepository = characterSheetRepository;
        this.serverRepository = serverRepository;
        this.membershipRepository = membershipRepository;
        this.permissionService = permissionService;
        this.userRepository = userRepository;
    }

    /** Confere que o servidor existe e o usuario e' membro dele (ou dono/admin global, ver
     *  PermissionService.isOwnerOrGlobalAdmin) - devolve o servidor pra quem chamou nao
     *  precisar buscar de novo. */
    private Server assertCanUseSheets(Long serverId, Long userId) {
        Server server = serverRepository.findById(serverId)
                .orElseThrow(() -> new IllegalArgumentException("Servidor não encontrado"));
        if (!membershipRepository.existsByServerIdAndUserId(serverId, userId) && !permissionService.isOwnerOrGlobalAdmin(serverId, userId)) {
            throw new IllegalStateException("Você não pertence a esse servidor");
        }
        return server;
    }

    /** O "mestre" de uma mesa RPG e' o DONO do servidor (ou admin global) - um servidor, um
     *  mestre, pedido explicito do usuario ("cada servidor vai ser pra um mestre especifico"). */
    private boolean isMaster(Long serverId, Long userId) {
        return permissionService.isOwnerOrGlobalAdmin(serverId, userId);
    }

    private boolean canEdit(Long serverId, CharacterSheet sheet, Long userId) {
        return isMaster(serverId, userId) || (sheet.getLinkedUserId() != null && sheet.getLinkedUserId().equals(userId));
    }

    /** Mestre ve TODOS os personagens da mesa. Jogador comum so' ve os que estao VINCULADOS a
     *  ele - villao/NPC (sem vinculo nenhum) ou o personagem de outro jogador simplesmente nao
     *  aparecem (pedido explicito do usuario). */
    public List<CharacterSheetResponse> list(Long serverId, Long userId) {
        assertCanUseSheets(serverId, userId);
        boolean master = isMaster(serverId, userId);
        List<CharacterSheet> sheets = characterSheetRepository.findByServerIdOrderByUploadedAtDesc(serverId).stream()
                .filter(s -> master || (s.getLinkedUserId() != null && s.getLinkedUserId().equals(userId)))
                .toList();
        return sheets.stream().map(s -> toResponse(s, serverId, userId)).toList();
    }

    /** So' o mestre cria personagem novo (pedido explicito: "os jogadores nao criam personagem
     *  dentro da mesa do mestre, so' o mestre que cria"). imageUrl/fileUrl/fileName/fileSize
     *  todos opcionais - da' pra criar so' com o nome e completar depois. */
    @Transactional
    public CharacterSheetResponse create(Long serverId, Long userId, String characterName,
                                          String imageUrl, String fileUrl, String fileName, Long fileSize) {
        assertCanUseSheets(serverId, userId);
        if (!isMaster(serverId, userId)) {
            throw new IllegalStateException("Só o mestre desse servidor pode criar personagens");
        }
        String name = (characterName == null || characterName.isBlank()) ? "Personagem" : characterName.trim();
        if (name.length() > 60) name = name.substring(0, 60);
        CharacterSheet sheet = characterSheetRepository.save(CharacterSheet.builder()
                .serverId(serverId)
                .ownerUserId(userId)
                .characterName(name)
                .imageUrl(blankToNull(imageUrl))
                .fileUrl(blankToNull(fileUrl))
                .fileName(blankToNull(fileName))
                .fileSize(fileSize)
                .build());
        return toResponse(sheet, serverId, userId);
    }

    /** Mestre OU o jogador vinculado podem editar (pedido explicito: "o jogador... podendo ate'
     *  alterar"). Cada parametro null = nao mexe no que ja' tem; "" (string vazia) REMOVE
     *  foto/PDF atual - mesma convencao ja' usada em MapService.renameToken pros tokens. */
    @Transactional
    public CharacterSheetResponse update(Long serverId, Long userId, Long sheetId,
                                          String characterName, String imageUrl, String fileUrl, String fileName, Long fileSize) {
        assertCanUseSheets(serverId, userId);
        CharacterSheet sheet = requireSheetOfServer(serverId, sheetId);
        if (!canEdit(serverId, sheet, userId)) {
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
        return toResponse(characterSheetRepository.save(sheet), serverId, userId);
    }

    /** So' o mestre vincula (ou desvincula, userId null) um jogador a um personagem - pedido
     *  explicito: "e' o mestre que vai dizer qual ficha cada jogador tem acesso". Precisa ser
     *  membro do servidor (nao da' pra vincular alguem de fora). */
    @Transactional
    public CharacterSheetResponse linkPlayer(Long serverId, Long userId, Long sheetId, Long linkedUserId) {
        assertCanUseSheets(serverId, userId);
        if (!isMaster(serverId, userId)) {
            throw new IllegalStateException("Só o mestre desse servidor pode vincular jogadores");
        }
        CharacterSheet sheet = requireSheetOfServer(serverId, sheetId);
        if (linkedUserId != null && !membershipRepository.existsByServerIdAndUserId(serverId, linkedUserId)) {
            throw new IllegalArgumentException("Esse usuário não é membro desse servidor");
        }
        sheet.setLinkedUserId(linkedUserId);
        return toResponse(characterSheetRepository.save(sheet), serverId, userId);
    }

    /** So' o mestre apaga um personagem (o jogador vinculado edita, mas nao apaga - continuidade
     *  da campanha e' decisao do mestre). */
    @Transactional
    public void delete(Long serverId, Long userId, Long sheetId) {
        assertCanUseSheets(serverId, userId);
        if (!isMaster(serverId, userId)) {
            throw new IllegalStateException("Só o mestre desse servidor pode apagar um personagem");
        }
        CharacterSheet sheet = requireSheetOfServer(serverId, sheetId);
        characterSheetRepository.delete(sheet);
    }

    private CharacterSheet requireSheetOfServer(Long serverId, Long sheetId) {
        CharacterSheet sheet = characterSheetRepository.findById(sheetId)
                .orElseThrow(() -> new IllegalArgumentException("Personagem não encontrado"));
        if (!serverId.equals(sheet.getServerId())) {
            throw new IllegalArgumentException("Personagem não pertence a esse servidor");
        }
        return sheet;
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private CharacterSheetResponse toResponse(CharacterSheet sheet, Long serverId, Long viewerUserId) {
        User linked = sheet.getLinkedUserId() != null ? userRepository.findById(sheet.getLinkedUserId()).orElse(null) : null;
        return new CharacterSheetResponse(sheet.getId(), sheet.getServerId(), sheet.getCharacterName(), sheet.getImageUrl(),
                sheet.getFileUrl(), sheet.getFileName(), sheet.getFileSize(),
                sheet.getLinkedUserId(), linked != null ? linked.getUsername() : null, linked != null ? linked.getAvatarUrl() : null,
                sheet.getUploadedAt(), canEdit(serverId, sheet, viewerUserId));
    }
}
