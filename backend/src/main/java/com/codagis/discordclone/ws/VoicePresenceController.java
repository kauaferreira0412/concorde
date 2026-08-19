package com.codagis.discordclone.ws;

import com.codagis.discordclone.domain.Channel;
import com.codagis.discordclone.domain.Membership;
import com.codagis.discordclone.domain.ServerPermission;
import com.codagis.discordclone.repository.ChannelRepository;
import com.codagis.discordclone.repository.MembershipRepository;
import com.codagis.discordclone.repository.UserRepository;
import com.codagis.discordclone.service.DisplayNameService;
import com.codagis.discordclone.service.PermissionService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * Cliente publica em /app/channel.{channelId}.voice.join|leave|mic quando entra/sai/muta
 * um canal de voz. Todo mundo que tem o canal na tela recebe o snapshot atualizado em
 * /topic/channel.{channelId}.voice - mesmo sem ter entrado na call (so quem entrou ve
 * quem esta falando de verdade, isso e' so "quem esta conectado").
 */
@Controller
public class VoicePresenceController {

    private final VoicePresenceService presenceService;
    private final UserRepository userRepository;
    private final ChannelRepository channelRepository;
    private final MembershipRepository membershipRepository;
    private final DisplayNameService displayNameService;
    private final PermissionService permissionService;

    public VoicePresenceController(VoicePresenceService presenceService, UserRepository userRepository,
                                    ChannelRepository channelRepository, MembershipRepository membershipRepository,
                                    DisplayNameService displayNameService, PermissionService permissionService) {
        this.presenceService = presenceService;
        this.userRepository = userRepository;
        this.channelRepository = channelRepository;
        this.membershipRepository = membershipRepository;
        this.displayNameService = displayNameService;
        this.permissionService = permissionService;
    }

    public record MicStatePayload(boolean micEnabled) {}
    public record DeafenStatePayload(boolean deafened) {}

    @MessageMapping("/channel.{channelId}.voice.join")
    public void join(@DestinationVariable Long channelId, @Header("simpSessionId") String sessionId, Principal principal) {
        Long userId = (Long) ((Authentication) principal).getPrincipal();
        var user = userRepository.findById(userId);
        // Apelido desse servidor primeiro, senao o global, senao o username - ver
        // DisplayNameService (mesma logica usada pro nome dentro da call de verdade, ver
        // VoiceController) - assim "Conectados agora" na sidebar bate com o que aparece
        // dentro da call.
        String displayName = displayNameService.resolveForChannel(channelId, userId);
        String avatarUrl = user.map(u -> u.getAvatarUrl()).orElse(null);
        // Punicao GRAVADA (ver Membership.forceMuted/forceDeafened) - entra na call ja'
        // refletindo isso, em vez de sempre comecar "limpo" (o que deixava sair/entrar
        // "resetar" a punicao - pedido explicito do usuario pra isso NAO acontecer).
        boolean forceMuted = false;
        boolean forceDeafened = false;
        Channel channel = channelRepository.findById(channelId).orElse(null);
        if (channel != null) {
            Membership membership = membershipRepository.findByServerIdAndUserId(channel.getServerId(), userId).orElse(null);
            if (membership != null) {
                forceMuted = membership.isForceMuted();
                forceDeafened = membership.isForceDeafened();
            }
        }
        presenceService.join(channelId, sessionId, userId, displayName, avatarUrl, forceMuted, forceDeafened);
    }

    @MessageMapping("/channel.{channelId}.voice.leave")
    public void leave(@DestinationVariable Long channelId, @Header("simpSessionId") String sessionId) {
        presenceService.leaveBySession(sessionId);
    }

    @MessageMapping("/channel.{channelId}.voice.mic")
    public void mic(@DestinationVariable Long channelId, MicStatePayload payload, @Header("simpSessionId") String sessionId,
                     Principal principal) {
        // Se um moderador te mutou a força (forceMuted), voce so' consegue se desmutar
        // sozinho se TAMBEM tiver a permissao de mutar gente (ver ServerPermission.MUTE_MEMBERS)
        // - regra pedida explicitamente pelo usuario: "o alvo so' pode se livrar se tiver
        // permissao tambem". Mutar a SI MESMO (payload.micEnabled()==false) sempre e' permitido.
        if (payload.micEnabled() && presenceService.isForceMuted(channelId, userIdOf(principal))
                && !hasPermission(channelId, userIdOf(principal), ServerPermission.MUTE_MEMBERS)) {
            return;
        }
        presenceService.setMicEnabled(sessionId, payload.micEnabled());
    }

    @MessageMapping("/channel.{channelId}.voice.deafen")
    public void deafen(@DestinationVariable Long channelId, DeafenStatePayload payload, @Header("simpSessionId") String sessionId,
                        Principal principal) {
        if (!payload.deafened() && presenceService.isForceDeafened(channelId, userIdOf(principal))
                && !hasPermission(channelId, userIdOf(principal), ServerPermission.DEAFEN_MEMBERS)) {
            return;
        }
        presenceService.setDeafened(sessionId, payload.deafened());
    }

    private Long userIdOf(Principal principal) {
        return (Long) ((Authentication) principal).getPrincipal();
    }

    private boolean hasPermission(Long channelId, Long userId, ServerPermission permission) {
        Channel channel = channelRepository.findById(channelId).orElse(null);
        return channel != null && permissionService.has(channel.getServerId(), userId, permission);
    }
}
