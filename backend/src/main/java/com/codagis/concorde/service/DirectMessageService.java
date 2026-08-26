package com.codagis.concorde.service;

import com.codagis.concorde.domain.DirectChannel;
import com.codagis.concorde.domain.DirectMessage;
import com.codagis.concorde.domain.DirectMessageReaction;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.DirectMessageDtos.DmChannelInfo;
import com.codagis.concorde.dto.DirectMessageDtos.DmMessage;
import com.codagis.concorde.dto.MessageDtos.ReactionSummary;
import com.codagis.concorde.dto.MessageDtos.ReplyPreview;
import com.codagis.concorde.repository.DirectChannelRepository;
import com.codagis.concorde.repository.DirectMessageReactionRepository;
import com.codagis.concorde.repository.DirectMessageRepository;
import com.codagis.concorde.repository.UserRepository;
import com.codagis.concorde.ws.OnlinePresenceService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Mensagens do chat PRIVADO - mesma forma/comportamento de MessageService (server), so' que
 * "channel" aqui e' um DirectChannel (dois participantes fixos) em vez de um Channel de
 * servidor, e a permissao pra ler/postar/reagir/fixar e' simplesmente "voce e' um dos dois
 * participantes dessa conversa" (ver assertParticipant) - sem ServerPermission nem cargo
 * nenhum, e' privado por definicao.
 */
@Service
public class DirectMessageService {

    private final DirectMessageRepository directMessageRepository;
    private final DirectMessageReactionRepository reactionRepository;
    private final DirectChannelRepository directChannelRepository;
    private final UserRepository userRepository;
    private final OnlinePresenceService presenceService;
    private final FriendshipService friendshipService;

    public DirectMessageService(DirectMessageRepository directMessageRepository,
                                 DirectMessageReactionRepository reactionRepository,
                                 DirectChannelRepository directChannelRepository, UserRepository userRepository,
                                 OnlinePresenceService presenceService, FriendshipService friendshipService) {
        this.directMessageRepository = directMessageRepository;
        this.reactionRepository = reactionRepository;
        this.directChannelRepository = directChannelRepository;
        this.userRepository = userRepository;
        this.presenceService = presenceService;
        this.friendshipService = friendshipService;
    }

    @Transactional
    public DmMessage save(Long channelId, Long authorId, String content, String imageUrl, Long replyToId) {
        DirectChannel channel = requireParticipant(channelId, authorId);
        assertNotBlocked(channel);
        boolean hasText = content != null && !content.isBlank();
        boolean hasImage = imageUrl != null && !imageUrl.isBlank();
        if (!hasText && !hasImage) {
            throw new IllegalArgumentException("Mensagem vazia - escreva algo ou anexe uma imagem");
        }
        Long validReplyToId = null;
        if (replyToId != null) {
            validReplyToId = directMessageRepository.findById(replyToId)
                    .filter(m -> m.getChannelId().equals(channelId))
                    .map(DirectMessage::getId)
                    .orElse(null);
        }
        DirectMessage saved = directMessageRepository.save(DirectMessage.builder()
                .channelId(channelId)
                .authorId(authorId)
                .content(hasText ? content : "")
                .imageUrl(hasImage ? imageUrl : null)
                .replyToId(validReplyToId)
                .build());
        return toDto(saved);
    }

    @Transactional
    public DmMessage saveRoll(Long channelId, Long authorId, DiceService.RollResult roll) {
        DirectChannel channel = requireParticipant(channelId, authorId);
        assertNotBlocked(channel);
        StringBuilder resultsCsv = new StringBuilder();
        StringBuilder resultsReadable = new StringBuilder();
        for (int i = 0; i < roll.results().length; i++) {
            if (i > 0) {
                resultsCsv.append(",");
                resultsReadable.append(", ");
            }
            resultsCsv.append(roll.results()[i]);
            resultsReadable.append(roll.results()[i]);
        }
        String modifierText = roll.modifier() > 0 ? " +" + roll.modifier() : roll.modifier() < 0 ? " " + roll.modifier() : "";
        String fallback = "🎲 rolou " + roll.notation() + " → [" + resultsReadable + "]" + modifierText + " = **" + roll.total() + "**";

        DirectMessage saved = directMessageRepository.save(DirectMessage.builder()
                .channelId(channelId)
                .authorId(authorId)
                .content(fallback)
                .rollNotation(roll.notation())
                .rollSides(roll.sides())
                .rollResultsCsv(resultsCsv.toString())
                .rollTotal(roll.total())
                .build());
        return toDto(saved);
    }

    @Transactional
    public DmMessage edit(Long channelId, Long messageId, Long requesterId, String newContent) {
        DirectMessage message = findInChannel(channelId, messageId);
        if (!message.getAuthorId().equals(requesterId)) {
            throw new IllegalStateException("Você só pode editar suas próprias mensagens");
        }
        if (newContent == null || newContent.isBlank()) {
            throw new IllegalArgumentException("Mensagem não pode ficar vazia");
        }
        message.setContent(newContent);
        message.setEditedAt(Instant.now());
        return toDto(directMessageRepository.save(message));
    }

    @Transactional
    public void delete(Long channelId, Long messageId, Long requesterId) {
        DirectMessage message = findInChannel(channelId, messageId);
        if (!message.getAuthorId().equals(requesterId)) {
            throw new IllegalStateException("Você só pode apagar suas próprias mensagens");
        }
        reactionRepository.deleteByMessageId(messageId);
        directMessageRepository.delete(message);
    }

    @Transactional
    public DmMessage toggleReaction(Long channelId, Long messageId, Long userId, String emoji) {
        assertParticipant(channelId, userId);
        DirectMessage message = findInChannel(channelId, messageId);
        String normalizedEmoji = emoji == null ? "" : emoji.trim();
        if (normalizedEmoji.isBlank() || normalizedEmoji.length() > 32) {
            throw new IllegalArgumentException("Emoji inválido");
        }
        reactionRepository.findByMessageIdAndUserIdAndEmoji(messageId, userId, normalizedEmoji)
                .ifPresentOrElse(
                        reactionRepository::delete,
                        () -> reactionRepository.save(DirectMessageReaction.builder()
                                .messageId(messageId)
                                .userId(userId)
                                .emoji(normalizedEmoji)
                                .build())
                );
        return toDto(message);
    }

    @Transactional
    public DmMessage setPinned(Long channelId, Long messageId, Long requesterId, boolean pinned) {
        assertParticipant(channelId, requesterId);
        DirectMessage message = findInChannel(channelId, messageId);
        message.setPinned(pinned);
        message.setPinnedAt(pinned ? Instant.now() : null);
        return toDto(directMessageRepository.save(message));
    }

    public List<DmMessage> listPinned(Long channelId, Long requesterId) {
        assertParticipant(channelId, requesterId);
        return toDtos(directMessageRepository.findByChannelIdAndPinnedTrueOrderByPinnedAtDesc(channelId));
    }

    public List<DmMessage> search(Long channelId, Long requesterId, String query) {
        assertParticipant(channelId, requesterId);
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return toDtos(directMessageRepository
                .findTop50ByChannelIdAndContentContainingIgnoreCaseOrderByIdDesc(channelId, query.trim()));
    }

    public List<DmMessage> history(Long channelId, Long requesterId) {
        assertParticipant(channelId, requesterId);
        List<DirectMessage> messages = directMessageRepository.findTop50ByChannelIdOrderByIdDesc(channelId).stream()
                .sorted(Comparator.comparing(DirectMessage::getId))
                .toList();
        return toDtos(messages);
    }

    /** Uma linha por conversa, com o outro participante e a ultima mensagem - o que alimenta a
     *  lista de DMs na Home (ver FriendsPage.jsx), mais recente primeiro. */
    public List<DmChannelInfo> listChannels(Long userId) {
        List<DirectChannel> channels = directChannelRepository.findAllForUser(userId);
        return channels.stream()
                .map(c -> {
                    Long otherId = c.getUserAId().equals(userId) ? c.getUserBId() : c.getUserAId();
                    User other = userRepository.findById(otherId).orElse(null);
                    if (other == null) {
                        return null;
                    }
                    DmMessage last = directMessageRepository.findTop1ByChannelIdOrderByIdDesc(c.getId())
                            .map(this::toDto).orElse(null);
                    return new DmChannelInfo(c.getId(), other.getId(), other.getUsername(), other.getNickname(),
                            other.getAvatarUrl(), presenceService.effectiveStatus(other.getId()), last);
                })
                .filter(Objects::nonNull)
                .sorted(Comparator.comparing(
                        (DmChannelInfo d) -> d.lastMessage() != null ? d.lastMessage().createdAt() : Instant.EPOCH)
                        .reversed())
                .toList();
    }

    public void assertParticipant(Long channelId, Long userId) {
        requireParticipant(channelId, userId);
    }

    private DirectChannel requireParticipant(Long channelId, Long userId) {
        DirectChannel channel = directChannelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Conversa não existe"));
        if (!channel.getUserAId().equals(userId) && !channel.getUserBId().equals(userId)) {
            throw new IllegalStateException("Você não participa dessa conversa");
        }
        return channel;
    }

    // So' barra MENSAGEM NOVA (texto/imagem/dado) - historico continua legivel pros dois, so'
    // nao da mais pra mandar nada enquanto um bloqueou o outro (ver FriendshipService.block).
    private void assertNotBlocked(DirectChannel channel) {
        if (friendshipService.isBlocked(channel.getUserAId(), channel.getUserBId())) {
            throw new IllegalStateException("Não é possível enviar mensagem - conversa bloqueada");
        }
    }

    private DirectMessage findInChannel(Long channelId, Long messageId) {
        DirectMessage message = directMessageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Mensagem não existe"));
        if (!message.getChannelId().equals(channelId)) {
            throw new IllegalArgumentException("Mensagem não pertence a essa conversa");
        }
        return message;
    }

    private List<DmMessage> toDtos(List<DirectMessage> messages) {
        List<Long> ids = messages.stream().map(DirectMessage::getId).toList();
        Map<Long, List<DirectMessageReaction>> reactionsByMessage = reactionRepository.findByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(DirectMessageReaction::getMessageId));
        return messages.stream()
                .map(m -> toDto(m, reactionsByMessage.getOrDefault(m.getId(), List.of())))
                .toList();
    }

    private DmMessage toDto(DirectMessage m) {
        return toDto(m, reactionRepository.findByMessageId(m.getId()));
    }

    private DmMessage toDto(DirectMessage m, List<DirectMessageReaction> reactions) {
        User author = userRepository.findById(m.getAuthorId()).orElse(null);
        String username = author != null ? author.getUsername() : "desconhecido";
        String avatarUrl = author != null ? author.getAvatarUrl() : null;
        ReplyPreview replyTo = m.getReplyToId() != null ? buildReplyPreview(m.getReplyToId()) : null;
        return new DmMessage(m.getId(), m.getChannelId(), m.getAuthorId(), username, avatarUrl, m.getContent(),
                m.getImageUrl(), m.getCreatedAt(), m.getEditedAt(), m.getReplyToId(), replyTo,
                m.getRollNotation(), m.getRollSides(), m.getRollResultsCsv(), m.getRollTotal(),
                groupReactions(reactions), m.isPinned());
    }

    private List<ReactionSummary> groupReactions(List<DirectMessageReaction> reactions) {
        Map<String, List<Long>> byEmoji = new LinkedHashMap<>();
        for (DirectMessageReaction r : reactions) {
            byEmoji.computeIfAbsent(r.getEmoji(), k -> new ArrayList<>()).add(r.getUserId());
        }
        return byEmoji.entrySet().stream().map(e -> new ReactionSummary(e.getKey(), e.getValue())).toList();
    }

    private ReplyPreview buildReplyPreview(Long originalId) {
        return directMessageRepository.findById(originalId).map(original -> {
            User originalAuthor = userRepository.findById(original.getAuthorId()).orElse(null);
            String originalUsername = originalAuthor != null ? originalAuthor.getUsername() : "desconhecido";
            String originalAvatarUrl = originalAuthor != null ? originalAuthor.getAvatarUrl() : null;
            return new ReplyPreview(original.getId(), originalUsername, originalAvatarUrl, original.getContent(), original.getImageUrl());
        }).orElse(null);
    }
}
