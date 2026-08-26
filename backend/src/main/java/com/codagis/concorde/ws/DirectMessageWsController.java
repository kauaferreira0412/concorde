package com.codagis.concorde.ws;

import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.DirectMessageDtos.DmEvent;
import com.codagis.concorde.dto.DirectMessageDtos.DmMessage;
import com.codagis.concorde.dto.MessageDtos.DeleteChatMessage;
import com.codagis.concorde.dto.MessageDtos.EditChatMessage;
import com.codagis.concorde.dto.MessageDtos.OutgoingChatMessage;
import com.codagis.concorde.dto.MessageDtos.PinMessageRequest;
import com.codagis.concorde.dto.MessageDtos.RollDiceRequest;
import com.codagis.concorde.dto.MessageDtos.ToggleReactionRequest;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.service.DiceService;
import com.codagis.concorde.service.DirectMessageService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Espelha ChatController (chat de servidor), so' que sob "/app/dm.{channelId}.*" e broadcast em
 * "/topic/dm.{channelId}" - namespace SEPARADO de "channel.*" de proposito, pra nunca confundir
 * um id de DirectChannel com um id de Channel de servidor. A privacidade de verdade (so' os dois
 * participantes conseguem ASSINAR esse topico) e' garantida na entrada da conexao STOMP, ver
 * StompAuthChannelInterceptor - aqui cada acao tambem confere participante de novo do lado do
 * DirectMessageService (defesa em profundidade).
 */
// Nome de classe DIFERENTE de controller.DirectMessageController (REST) de proposito - os dois
// "DirectMessageController" (um aqui, um em controller/) geravam o MESMO nome de bean padrao
// do Spring ("directMessageController"), batendo um no outro e derrubando o backend inteiro no
// boot (ConflictingBeanDefinitionException) - erro so' aparece rodando de verdade, nao da pra
// pegar so' lendo o codigo.
@Controller
public class DirectMessageWsController {

    private final DirectMessageService directMessageService;
    private final DiceService diceService;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public DirectMessageWsController(DirectMessageService directMessageService, DiceService diceService,
                                    UserRepository userRepository, SimpMessagingTemplate messagingTemplate) {
        this.directMessageService = directMessageService;
        this.diceService = diceService;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/dm.{channelId}.send")
    public void send(@DestinationVariable Long channelId, OutgoingChatMessage payload, Principal principal) {
        Long authorId = userId(principal);
        try {
            DmMessage saved = directMessageService.save(channelId, authorId, payload.content(), payload.imageUrl(), payload.replyToId(),
                    payload.fileUrl(), payload.fileName(), payload.fileType(), payload.fileSize());
            broadcast(channelId, DmEvent.created(saved));
        } catch (RuntimeException e) {
            System.err.println("Falha ao enviar DM no canal " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/dm.{channelId}.roll")
    public void roll(@DestinationVariable Long channelId, RollDiceRequest payload, Principal principal) {
        Long authorId = userId(principal);
        try {
            DiceService.RollResult result = diceService.roll(payload.notation());
            DmMessage saved = directMessageService.saveRoll(channelId, authorId, result);
            broadcast(channelId, DmEvent.created(saved));
        } catch (RuntimeException e) {
            System.err.println("Falha ao rolar dado na DM " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/dm.{channelId}.edit")
    public void edit(@DestinationVariable Long channelId, EditChatMessage payload, Principal principal) {
        try {
            DmMessage updated = directMessageService.edit(channelId, payload.messageId(), userId(principal), payload.content());
            broadcast(channelId, DmEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao editar DM " + payload.messageId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/dm.{channelId}.delete")
    public void delete(@DestinationVariable Long channelId, DeleteChatMessage payload, Principal principal) {
        try {
            directMessageService.delete(channelId, payload.messageId(), userId(principal));
            broadcast(channelId, DmEvent.deleted(payload.messageId()));
        } catch (RuntimeException e) {
            System.err.println("Falha ao apagar DM " + payload.messageId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/dm.{channelId}.react")
    public void react(@DestinationVariable Long channelId, ToggleReactionRequest payload, Principal principal) {
        try {
            DmMessage updated = directMessageService.toggleReaction(channelId, payload.messageId(), userId(principal), payload.emoji());
            broadcast(channelId, DmEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao reagir na DM " + payload.messageId() + ": " + e.getMessage());
        }
    }

    @MessageMapping("/dm.{channelId}.pin")
    public void pin(@DestinationVariable Long channelId, PinMessageRequest payload, Principal principal) {
        try {
            DmMessage updated = directMessageService.setPinned(channelId, payload.messageId(), userId(principal), payload.pinned());
            broadcast(channelId, DmEvent.updated(updated));
        } catch (RuntimeException e) {
            System.err.println("Falha ao fixar/desafixar DM " + payload.messageId() + ": " + e.getMessage());
        }
    }

    public record TypingRequest(boolean typing) {}
    public record TypingEvent(Long userId, String username, boolean typing) {}

    @MessageMapping("/dm.{channelId}.typing")
    public void typing(@DestinationVariable Long channelId, TypingRequest payload, Principal principal) {
        Long uid = userId(principal);
        User u = userRepository.findById(uid).orElse(null);
        String username = u == null
                ? "user-" + uid
                : (u.getNickname() != null && !u.getNickname().isBlank() ? u.getNickname() : u.getUsername());
        messagingTemplate.convertAndSend("/topic/dm." + channelId + ".typing", new TypingEvent(uid, username, payload.typing()));
    }

    private Long userId(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private void broadcast(Long channelId, DmEvent event) {
        messagingTemplate.convertAndSend("/topic/dm." + channelId, event);
    }
}
