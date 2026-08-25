package com.codagis.concorde.controller;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.dto.MessageDtos.AttachmentResponse;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.security.CurrentUser;
import com.codagis.concorde.service.GcsService;
import com.codagis.concorde.service.ServerService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/channels")
public class AttachmentController {

    private final GcsService gcsService;
    private final ChannelRepository channelRepository;
    private final ServerService serverService;
    private final CurrentUser currentUser;

    public AttachmentController(GcsService gcsService, ChannelRepository channelRepository,
                                 ServerService serverService, CurrentUser currentUser) {
        this.gcsService = gcsService;
        this.channelRepository = channelRepository;
        this.serverService = serverService;
        this.currentUser = currentUser;
    }

    @PostMapping(value = "/{channelId}/attachments", consumes = "multipart/form-data")
    public AttachmentResponse uploadAttachment(@PathVariable Long channelId, @RequestParam("file") MultipartFile file) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal nao existe"));
        serverService.assertMember(channel.getServerId(), currentUser.id());

        String url = gcsService.upload(file, "chat/" + channelId);
        return new AttachmentResponse(url);
    }
}
