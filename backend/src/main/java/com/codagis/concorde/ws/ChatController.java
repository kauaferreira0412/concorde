package com.codagis.concorde.ws;

import com.codagis.concorde.dto.MessageDtos.ChatEvent;
import com.codagis.concorde.dto.MessageDtos.ChatMessage;
import com.codagis.concorde.dto.MessageDtos.DeleteChatMessage;
import com.codagis.concorde.dto.MessageDtos.EditChatMessage;
import com.codagis.concorde.dto.MessageDtos.OutgoingChatMessage;
import com.codagis.concorde.dto.MessageDtos.PinMessageRequest;
import com.codagis.concorde.dto.MessageDtos.RollDiceRequest;
import com.codagis.concorde.dto.MessageDtos.ToggleReactionRequest;
import com.codagis.concorde.service.DiceService;
import com.codagis.concorde.service.DisplayNameService;
import com.codagis.concorde.service.MessageService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class ChatController {

    private final MessageService messageService;
    private final DiceService diceService;
    private final DisplayNameService displayNameService;
    private final SimpMessagingTemplate messagingTemplate;

    public ChatController(MessageService messageService, DiceService diceService, DisplayNameService displayNameService,
                           SimpMessagingTemplate messagingTemplate) {
        this.messageService = messageService;
        this.diceService = diceService;
        this.displayNameService = displayNameService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/channel.{channelId}.send")
    public void send(@DestinationVariable Long channelId, OutgoingChatMessage payload, Principal principal) {
        Long authorId = userId(principal);
        try {
            ChatMessage saved = messageService.save(channelId, authorId, payload.content(), payload.imageUrl(), payload.replyToId(),
                    payload.fileUrl(), payload.fileName(), payload.fileType(), payload.fileSize());
            broadcast(channelId, ChatEvent.created(saved));
        } catch (RuntimeException e) {
            System.err.println("Falha ao enviar mensagem no canal " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.roll")
    public void roll(@DestinationVariable Long channelId, RollDiceRequest payload, Principal principal) {
        Long authorId = userId(principal);
        try {
            DiceService.RollResult result = diceService.roll(payload.notation());
            ChatMessage saved = messageService.saveRoll(channelId, authorId, result);
            broadcast(channelId, ChatEvent.created(saved));
        } catch (RuntimeException e) {
            System.err.println("Falha ao rolar dado no canal " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.edit")
    public void edit(@DestinationVariable Long channelId, EditChatMessage payload, Principal principal) {
        Long requesterId = userId(principal);
        try {
            ChatMessage updated = messageService.edit(channelId, payload.messageId(), requesterId, payload.content());
            broadcast(channelId, ChatEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao editar mensagem " + payload.messageId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.delete")
    public void delete(@DestinationVariable Long channelId, DeleteChatMessage payload, Principal principal) {
        Long requesterId = userId(principal);
        try {
            messageService.delete(channelId, payload.messageId(), requesterId);
            broadcast(channelId, ChatEvent.deleted(payload.messageId()));
        } catch (RuntimeException e) {
            System.err.println("Falha ao apagar mensagem " + payload.messageId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.react")
    public void react(@DestinationVariable Long channelId, ToggleReactionRequest payload, Principal principal) {
        Long userId = userId(principal);
        try {
            ChatMessage updated = messageService.toggleReaction(channelId, payload.messageId(), userId, payload.emoji());
            broadcast(channelId, ChatEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao reagir na mensagem " + payload.messageId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.pin")
    public void pin(@DestinationVariable Long channelId, PinMessageRequest payload, Principal principal) {
        Long requesterId = userId(principal);
        try {
            ChatMessage updated = messageService.setPinned(channelId, payload.messageId(), requesterId, payload.pinned());
            broadcast(channelId, ChatEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao fixar/desafixar mensagem " + payload.messageId() + ": " + e.getMessage());
        }
    }

    public record TypingRequest(boolean typing) {}
    public record TypingEvent(Long userId, String username, boolean typing) {}

    @MessageMapping("/channel.{channelId}.typing")
    public void typing(@DestinationVariable Long channelId, TypingRequest payload, Principal principal) {
        Long userId = userId(principal);
        String username = displayNameService.resolveForChannel(channelId, userId);
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".typing",
                new TypingEvent(userId, username, payload.typing()));
    }

    private Long userId(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private void broadcast(Long channelId, ChatEvent event) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId, event);
    }
}
