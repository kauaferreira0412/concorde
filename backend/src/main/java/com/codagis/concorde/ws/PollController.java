package com.codagis.concorde.ws;

import com.codagis.concorde.dto.MessageDtos.ChatEvent;
import com.codagis.concorde.dto.MessageDtos.ChatMessage;
import com.codagis.concorde.dto.PollDtos.AddPollOptionRequest;
import com.codagis.concorde.dto.PollDtos.CreatePollRequest;
import com.codagis.concorde.dto.PollDtos.VotePollRequest;
import com.codagis.concorde.service.PollService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class PollController {

    private final PollService pollService;
    private final SimpMessagingTemplate messagingTemplate;

    public PollController(PollService pollService, SimpMessagingTemplate messagingTemplate) {
        this.pollService = pollService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/channel.{channelId}.poll.create")
    public void create(@DestinationVariable Long channelId, CreatePollRequest payload, Principal principal) {
        Long userId = userId(principal);
        try {
            ChatMessage saved = pollService.createPoll(channelId, userId, payload.question(), payload.options(), payload.multipleChoice());
            broadcast(channelId, ChatEvent.created(saved));
        } catch (RuntimeException e) {
            System.err.println("Falha ao criar enquete no canal " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.poll.addOption")
    public void addOption(@DestinationVariable Long channelId, AddPollOptionRequest payload, Principal principal) {
        Long userId = userId(principal);
        try {
            ChatMessage updated = pollService.addOption(channelId, userId, payload.pollId(), payload.text());
            broadcast(channelId, ChatEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao adicionar opção na enquete " + payload.pollId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.poll.vote")
    public void vote(@DestinationVariable Long channelId, VotePollRequest payload, Principal principal) {
        Long userId = userId(principal);
        try {
            ChatMessage updated = pollService.vote(channelId, userId, payload.pollId(), payload.optionId());
            broadcast(channelId, ChatEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao votar na enquete " + payload.pollId() + ": " + e.getMessage());
        }
    }

    private Long userId(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private void broadcast(Long channelId, ChatEvent event) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId, event);
    }
}
