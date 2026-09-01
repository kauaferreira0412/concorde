package com.codagis.concorde.ws;

import com.codagis.concorde.dto.MapDtos.AddTokenRequest;
import com.codagis.concorde.dto.MapDtos.MapEvent;
import com.codagis.concorde.dto.MapDtos.MapTokenResponse;
import com.codagis.concorde.dto.MapDtos.MoveTokenRequest;
import com.codagis.concorde.dto.MapDtos.RemoveTokenRequest;
import com.codagis.concorde.dto.MapDtos.RenameTokenRequest;
import com.codagis.concorde.service.MapService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Tokens/pins do mapa de batalha - mover é o que precisa ser "ao vivo" de verdade (pedido
 * explicito do usuario), por isso é WebSocket (não REST) igual o resto do chat em tempo real
 * (ver ChatController, mesmo padrão - inclusive o tokenId vai no CORPO da mensagem, não no
 * destino STOMP, igual ToggleReactionRequest/PinMessageRequest ja' fazem). Upload da imagem do
 * mapa em si é REST, ver MapController (precisa de multipart/GcsService).
 */
@Controller
public class MapWsController {

    private final MapService mapService;
    private final SimpMessagingTemplate messagingTemplate;

    public MapWsController(MapService mapService, SimpMessagingTemplate messagingTemplate) {
        this.mapService = mapService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/channel.{channelId}.map.token.add")
    public void addToken(@DestinationVariable Long channelId, AddTokenRequest payload, Principal principal) {
        try {
            MapTokenResponse token = mapService.addToken(channelId, userId(principal), payload);
            broadcast(channelId, MapEvent.tokenAdded(token));
        } catch (RuntimeException e) {
            System.err.println("Falha ao adicionar token no canal " + channelId + ": " + e.getMessage());
        }
    }

    // Publicado com throttle do lado do frontend enquanto arrasta (ver BattleMap.jsx) - sem
    // isso, um arraste de 1s vira dezenas de mensagens WS por segundo.
    @MessageMapping("/channel.{channelId}.map.token.move")
    public void moveToken(@DestinationVariable Long channelId, MoveTokenRequest payload, Principal principal) {
        try {
            mapService.moveToken(channelId, userId(principal), payload.tokenId(), payload.x(), payload.y());
            broadcast(channelId, MapEvent.tokenMoved(payload.tokenId(), payload.x(), payload.y()));
        } catch (RuntimeException e) {
            System.err.println("Falha ao mover token " + payload.tokenId() + " no canal " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.map.token.rename")
    public void renameToken(@DestinationVariable Long channelId, RenameTokenRequest payload, Principal principal) {
        try {
            MapTokenResponse token = mapService.renameToken(channelId, userId(principal), payload.tokenId(), payload);
            broadcast(channelId, MapEvent.tokenRenamed(token));
        } catch (RuntimeException e) {
            System.err.println("Falha ao renomear token " + payload.tokenId() + " no canal " + channelId + ": " + e.getMessage());
        }
    }

    @MessageMapping("/channel.{channelId}.map.token.remove")
    public void removeToken(@DestinationVariable Long channelId, RemoveTokenRequest payload, Principal principal) {
        try {
            mapService.removeToken(channelId, userId(principal), payload.tokenId());
            broadcast(channelId, MapEvent.tokenRemoved(payload.tokenId()));
        } catch (RuntimeException e) {
            System.err.println("Falha ao remover token " + payload.tokenId() + " no canal " + channelId + ": " + e.getMessage());
        }
    }

    private Long userId(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private void broadcast(Long channelId, MapEvent event) {
        messagingTemplate.convertAndSend("/topic/channel." + channelId + ".map", event);
    }
}
