package com.codagis.concorde.controller;

import com.codagis.concorde.dto.DirectMessageDtos.DmChannelInfo;
import com.codagis.concorde.dto.DirectMessageDtos.DmMessage;
import com.codagis.concorde.dto.MessageDtos.AttachmentResponse;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.DirectMessageService;
import com.codagis.concorde.service.GcsService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/dm")
public class DirectMessageController {

    private final DirectMessageService directMessageService;
    private final GcsService gcsService;
    private final CurrentUser currentUser;

    public DirectMessageController(DirectMessageService directMessageService, GcsService gcsService, CurrentUser currentUser) {
        this.directMessageService = directMessageService;
        this.gcsService = gcsService;
        this.currentUser = currentUser;
    }

    @GetMapping("/channels")
    public List<DmChannelInfo> channels() {
        return directMessageService.listChannels(currentUser.id());
    }

    @GetMapping("/channels/{channelId}/messages")
    public List<DmMessage> history(@PathVariable Long channelId) {
        return directMessageService.history(channelId, currentUser.id());
    }

    @GetMapping("/channels/{channelId}/messages/pinned")
    public List<DmMessage> pinned(@PathVariable Long channelId) {
        return directMessageService.listPinned(channelId, currentUser.id());
    }

    @GetMapping("/channels/{channelId}/messages/search")
    public List<DmMessage> search(@PathVariable Long channelId, @RequestParam("q") String query) {
        return directMessageService.search(channelId, currentUser.id(), query);
    }

    @PostMapping(value = "/channels/{channelId}/attachments", consumes = "multipart/form-data")
    public AttachmentResponse uploadAttachment(@PathVariable Long channelId, @RequestParam("file") MultipartFile file) {
        directMessageService.assertParticipant(channelId, currentUser.id());
        String url = gcsService.upload(file, "dm/" + channelId);
        return new AttachmentResponse(url);
    }
}
