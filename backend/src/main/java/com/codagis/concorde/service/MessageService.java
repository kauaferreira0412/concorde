package com.codagis.concorde.service;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Message;
import com.codagis.concorde.domain.Role;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.MessageDtos.ChatMessage;
import com.codagis.concorde.dto.MessageDtos.ReplyPreview;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MessageRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

@Service
public class MessageService {

    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final ChannelRepository channelRepository;

    public MessageService(MessageRepository messageRepository, UserRepository userRepository, ChannelRepository channelRepository) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.channelRepository = channelRepository;
    }

    @Transactional
    public ChatMessage save(Long channelId, Long authorId, String content, String imageUrl, Long replyToId) {
        boolean hasText = content != null && !content.isBlank();
        boolean hasImage = imageUrl != null && !imageUrl.isBlank();
        if (!hasText && !hasImage) {
            throw new IllegalArgumentException("Mensagem vazia - escreva algo ou anexe uma imagem");
        }
        assertCanPostIn(channelId, authorId);
        Long validReplyToId = null;
        if (replyToId != null) {
            validReplyToId = messageRepository.findById(replyToId)
                    .filter(m -> m.getChannelId().equals(channelId))
                    .map(Message::getId)
                    .orElse(null);
        }
        Message saved = messageRepository.save(Message.builder()
                .channelId(channelId)
                .authorId(authorId)
                .content(hasText ? content : "")
                .imageUrl(hasImage ? imageUrl : null)
                .replyToId(validReplyToId)
                .build());
        return toDto(saved);
    }

    @Transactional
    public ChatMessage saveRoll(Long channelId, Long authorId, DiceService.RollResult roll) {
        assertCanPostIn(channelId, authorId);
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

        Message saved = messageRepository.save(Message.builder()
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
    public ChatMessage edit(Long channelId, Long messageId, Long requesterId, String newContent) {
        Message message = findInChannel(channelId, messageId);
        assertCanModify(message, requesterId);
        if (newContent == null || newContent.isBlank()) {
            throw new IllegalArgumentException("Mensagem nao pode ficar vazia");
        }
        message.setContent(newContent);
        message.setEditedAt(Instant.now());
        return toDto(messageRepository.save(message));
    }

    @Transactional
    public void delete(Long channelId, Long messageId, Long requesterId) {
        Message message = findInChannel(channelId, messageId);
        assertCanModify(message, requesterId);
        messageRepository.delete(message);
    }

    private Message findInChannel(Long channelId, Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Mensagem nao existe"));
        if (!message.getChannelId().equals(channelId)) {
            throw new IllegalArgumentException("Mensagem nao pertence a esse canal");
        }
        return message;
    }

    private void assertCanModify(Message message, Long requesterId) {
        if (message.getAuthorId().equals(requesterId)) {
            return;
        }
        boolean isAdmin = userRepository.findById(requesterId).map(u -> u.getRole() == Role.ADMIN).orElse(false);
        if (!isAdmin) {
            throw new IllegalStateException("Voce so pode editar ou apagar suas proprias mensagens");
        }
    }

    private void assertCanPostIn(Long channelId, Long authorId) {
        Channel channel = channelRepository.findById(channelId).orElse(null);
        if (channel == null || !channel.isAdminOnly()) {
            return;
        }
        boolean isAdmin = userRepository.findById(authorId).map(u -> u.getRole() == Role.ADMIN).orElse(false);
        if (!isAdmin) {
            throw new IllegalStateException("Só administradores podem postar nesse canal");
        }
    }

    public List<ChatMessage> history(Long channelId) {
        return messageRepository.findTop50ByChannelIdOrderByIdDesc(channelId).stream()
                .sorted(Comparator.comparing(Message::getId))
                .map(this::toDto)
                .toList();
    }

    private ChatMessage toDto(Message m) {
        User author = userRepository.findById(m.getAuthorId()).orElse(null);
        String username = author != null ? author.getUsername() : "desconhecido";
        String avatarUrl = author != null ? author.getAvatarUrl() : null;
        ReplyPreview replyTo = m.getReplyToId() != null ? buildReplyPreview(m.getReplyToId()) : null;
        return new ChatMessage(m.getId(), m.getChannelId(), m.getAuthorId(), username, avatarUrl, m.getContent(),
                m.getImageUrl(), m.getCreatedAt(), m.getEditedAt(), m.getReplyToId(), replyTo,
                m.getRollNotation(), m.getRollSides(), m.getRollResultsCsv(), m.getRollTotal());
    }

    private ReplyPreview buildReplyPreview(Long originalId) {
        return messageRepository.findById(originalId).map(original -> {
            User originalAuthor = userRepository.findById(original.getAuthorId()).orElse(null);
            String originalUsername = originalAuthor != null ? originalAuthor.getUsername() : "desconhecido";
            String originalAvatarUrl = originalAuthor != null ? originalAuthor.getAvatarUrl() : null;
            return new ReplyPreview(original.getId(), originalUsername, originalAvatarUrl, original.getContent(), original.getImageUrl());
        }).orElse(null);
    }
}
