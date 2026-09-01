package com.codagis.concorde.controller;

import com.codagis.concorde.dto.CharacterSheetDtos.CharacterSheetResponse;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.CharacterSheetService;
import com.codagis.concorde.service.GcsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;

/**
 * Fichas de personagem em PDF de uma categoria de RPG (kit de RPG, ver CharacterSheetService/
 * CharacterSheetsModal.jsx). So' PDF (diferente do anexo generico do chat, aqui restringe de
 * proposito - pedido explicito do usuario: "fichas de RPG em PDF").
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
    public CharacterSheetResponse upload(@PathVariable Long serverId, @PathVariable Long categoryId,
                                          @RequestParam("file") MultipartFile file,
                                          @RequestParam(value = "characterName", required = false) String characterName) {
        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "";
        boolean looksLikePdf = "application/pdf".equals(file.getContentType())
                || originalName.toLowerCase(Locale.ROOT).endsWith(".pdf");
        if (!looksLikePdf) {
            throw new IllegalArgumentException("Só é possível subir arquivos PDF");
        }
        GcsService.FileUploadResult result = gcsService.uploadAttachment(file, "sheets/" + categoryId);
        return characterSheetService.upload(serverId, categoryId, currentUser.id(), characterName,
                result.url(), result.name(), result.size());
    }

    @DeleteMapping("/{sheetId}")
    public void delete(@PathVariable Long serverId, @PathVariable Long categoryId, @PathVariable Long sheetId) {
        characterSheetService.delete(serverId, categoryId, currentUser.id(), sheetId);
    }
}
