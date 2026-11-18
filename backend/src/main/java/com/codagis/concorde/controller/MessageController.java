package com.codagis.concorde.controller;

import com.codagis.concorde.dto.MessageDtos.ChatMessage;
import com.codagis.concorde.service.MessageService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/channels")
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    @GetMapping("/{channelId}/messages")
    public List<ChatMessage> history(@PathVariable Long channelId) {
        return messageService.history(channelId);
    }

    @GetMapping("/{channelId}/messages/pinned")
    public List<ChatMessage> pinned(@PathVariable Long channelId) {
        return messageService.listPinned(channelId);
    }

    @GetMapping("/{channelId}/messages/search")
    public List<ChatMessage> search(@PathVariable Long channelId, @RequestParam(value = "q", defaultValue = "") String query,
                                     @RequestParam(required = false) Long authorId,
                                     @RequestParam(required = false) String has,
                                     @RequestParam(required = false) String after,
                                     @RequestParam(required = false) String before) {
        return messageService.search(channelId,
                com.codagis.concorde.dto.SearchFilters.of(query, authorId, has, after, before));
    }
}
