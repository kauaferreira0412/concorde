package com.codagis.concorde.controller;

import com.codagis.concorde.dto.CharacterSheetDtos.CharacterSheetResponse;
import com.codagis.concorde.dto.CharacterSheetDtos.LinkPlayerRequest;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.CharacterSheetService;
import com.codagis.concorde.service.GcsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;

/**
 * Personagens de uma mesa de RPG (villoes, NPCs, personagens de jogador - kit de RPG, ver
 * CharacterSheetService). So' o mestre cria/apaga/vincula jogador; o mestre e o jogador
 * vinculado editam. PDF da ficha e' opcional e restrito a PDF de proposito (diferente do anexo
 * generico do chat - pedido explicito do usuario: "fichas de RPG em PDF").
 */
@RestController
@RequestMapping("/api/servers/{serverId}/categories/{categoryId}/sheets")
public class CharacterSheetController {

    private final CharacterSheetService characterSheetService;
    private final GcsService gcsService;
    private final CurrentUser currentUser;

    public CharacterSheetController(CharacterSheetService characterSheetService, GcsService gcsService, CurrentUser currentUser) {
        this.characterSheetService = characterSheetService;
        this.gcsService = gcsService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<CharacterSheetResponse> list(@PathVariable Long serverId, @PathVariable Long categoryId) {
        return characterSheetService.list(serverId, categoryId, currentUser.id());
    }

    @PostMapping(consumes = "multipart/form-data")
    public CharacterSheetResponse create(@PathVariable Long serverId, @PathVariable Long categoryId,
                                          @RequestParam("characterName") String characterName,
                                          @RequestParam(value = "photo", required = false) MultipartFile photo,
                                          @RequestParam(value = "file", required = false) MultipartFile file) {
        String imageUrl = photo != null && !photo.isEmpty() ? gcsService.upload(photo, "sheets/" + categoryId + "/photos") : null;
        GcsService.FileUploadResult uploaded = uploadPdfIfPresent(file, categoryId);
        return characterSheetService.create(serverId, categoryId, currentUser.id(), characterName, imageUrl,
                uploaded != null ? uploaded.url() : null, uploaded != null ? uploaded.name() : null,
                uploaded != null ? uploaded.size() : null);
    }

    @PutMapping(value = "/{sheetId}", consumes = "multipart/form-data")
    public CharacterSheetResponse update(@PathVariable Long serverId, @PathVariable Long categoryId, @PathVariable Long sheetId,
                                          @RequestParam(value = "characterName", required = false) String characterName,
                                          @RequestParam(value = "photo", required = false) MultipartFile photo,
                                          @RequestParam(value = "removePhoto", required = false, defaultValue = "false") boolean removePhoto,
                                          @RequestParam(value = "file", required = false) MultipartFile file,
                                          @RequestParam(value = "removeFile", required = false, defaultValue = "false") boolean removeFile) {
        String imageUrl = null; // null = nao mexe
        if (removePhoto) imageUrl = "";
        else if (photo != null && !photo.isEmpty()) imageUrl = gcsService.upload(photo, "sheets/" + categoryId + "/photos");

        String fileUrl = null;
        String fileName = null;
        Long fileSize = null;
        if (removeFile) {
            fileUrl = "";
        } else {
            GcsService.FileUploadResult uploaded = uploadPdfIfPresent(file, categoryId);
            if (uploaded != null) {
                fileUrl = uploaded.url();
                fileName = uploaded.name();
                fileSize = uploaded.size();
            }
        }
        return characterSheetService.update(serverId, categoryId, currentUser.id(), sheetId, characterName, imageUrl, fileUrl, fileName, fileSize);
    }

    @PutMapping("/{sheetId}/link")
    public CharacterSheetResponse link(@PathVariable Long serverId, @PathVariable Long categoryId, @PathVariable Long sheetId,
                                        @RequestBody LinkPlayerRequest req) {
        return characterSheetService.linkPlayer(serverId, categoryId, currentUser.id(), sheetId, req.userId());
    }

    @DeleteMapping("/{sheetId}")
    public void delete(@PathVariable Long serverId, @PathVariable Long categoryId, @PathVariable Long sheetId) {
        characterSheetService.delete(serverId, categoryId, currentUser.id(), sheetId);
    }

    private GcsService.FileUploadResult uploadPdfIfPresent(MultipartFile file, Long categoryId) {
        if (file == null || file.isEmpty()) return null;
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";
        boolean looksLikePdf = "application/pdf".equals(file.getContentType())
                || originalName.toLowerCase(Locale.ROOT).endsWith(".pdf");
        if (!looksLikePdf) {
            throw new IllegalArgumentException("A ficha só pode ser um arquivo PDF");
        }
        return gcsService.uploadAttachment(file, "sheets/" + categoryId);
    }
}
