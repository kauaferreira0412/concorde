package com.codagis.concorde.controller;

import com.codagis.concorde.dto.CustomEmojiDtos.CustomEmojiResponse;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.CustomEmojiService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/servers/{serverId}/emojis")
public class CustomEmojiController {

    private final CustomEmojiService customEmojiService;
    private final CurrentUser currentUser;

    public CustomEmojiController(CustomEmojiService customEmojiService, CurrentUser currentUser) {
        this.customEmojiService = customEmojiService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<CustomEmojiResponse> list(@PathVariable Long serverId) {
        return customEmojiService.listForServer(serverId, currentUser.id());
    }

    @PostMapping(consumes = "multipart/form-data")
    public CustomEmojiResponse upload(@PathVariable Long serverId, @RequestParam("file") MultipartFile file,
                                       @RequestParam("name") String name) {
        return customEmojiService.upload(serverId, currentUser.id(), file, name);
    }

    @DeleteMapping("/{emojiId}")
    public void delete(@PathVariable Long serverId, @PathVariable Long emojiId) {
        customEmojiService.delete(serverId, currentUser.id(), emojiId);
    }
}
