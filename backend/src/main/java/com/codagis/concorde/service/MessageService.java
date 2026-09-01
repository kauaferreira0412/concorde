package com.codagis.concorde.service;

import com.codagis.concorde.domain.Channel;
import com.codagis.concorde.domain.Message;
import com.codagis.concorde.domain.MessageReaction;
import com.codagis.concorde.domain.Poll;
import com.codagis.concorde.domain.PollOption;
import com.codagis.concorde.domain.PollVote;
import com.codagis.concorde.domain.User;
import com.codagis.concorde.dto.MessageDtos.ChatMessage;
import com.codagis.concorde.dto.MessageDtos.ReactionSummary;
import com.codagis.concorde.dto.MessageDtos.ReplyPreview;
import com.codagis.concorde.dto.PollDtos.PollDto;
import com.codagis.concorde.dto.PollDtos.PollOptionDto;
import com.codagis.concorde.enums.Role;
import com.codagis.concorde.enums.ServerPermission;
import com.codagis.concorde.repository.CategoryAccessRepository;
import com.codagis.concorde.repository.ChannelRepository;
import com.codagis.concorde.repository.MessageReactionRepository;
import com.codagis.concorde.repository.MessageRepository;
import com.codagis.concorde.repository.PollOptionRepository;
import com.codagis.concorde.repository.PollRepository;
import com.codagis.concorde.repository.PollVoteRepository;
import com.codagis.concorde.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class MessageService {

    private final MessageRepository messageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final PollRepository pollRepository;
    private final PollOptionRepository pollOptionRepository;
    private final PollVoteRepository pollVoteRepository;
    private final UserRepository userRepository;
    private final ChannelRepository channelRepository;
    private final PermissionService permissionService;
    private final CategoryAccessRepository categoryAccessRepository;

    public MessageService(MessageRepository messageRepository, MessageReactionRepository messageReactionRepository,
                           PollRepository pollRepository, PollOptionRepository pollOptionRepository,
                           PollVoteRepository pollVoteRepository, UserRepository userRepository,
                           ChannelRepository channelRepository, PermissionService permissionService,
                           CategoryAccessRepository categoryAccessRepository) {
        this.messageRepository = messageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.pollRepository = pollRepository;
        this.pollOptionRepository = pollOptionRepository;
        this.pollVoteRepository = pollVoteRepository;
        this.userRepository = userRepository;
        this.channelRepository = channelRepository;
        this.permissionService = permissionService;
        this.categoryAccessRepository = categoryAccessRepository;
    }

    @Transactional
    public ChatMessage save(Long channelId, Long authorId, String content, String imageUrl, Long replyToId,
                             String fileUrl, String fileName, String fileType, Long fileSize) {
        boolean hasText = content != null && !content.isBlank();
        boolean hasImage = imageUrl != null && !imageUrl.isBlank();
        boolean hasFile = fileUrl != null && !fileUrl.isBlank();
        if (!hasText && !hasImage && !hasFile) {
            throw new IllegalArgumentException("Mensagem vazia - escreva algo ou anexe um arquivo");
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
                .fileUrl(hasFile ? fileUrl : null)
                .fileName(hasFile ? fileName : null)
                .fileType(hasFile ? fileType : null)
                .fileSize(hasFile ? fileSize : null)
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
    public ChatMessage saveWithPoll(Long channelId, Long authorId, String content, Long pollId) {
        assertCanPostIn(channelId, authorId);
        Message saved = messageRepository.save(Message.builder()
                .channelId(channelId)
                .authorId(authorId)
                .content(content)
                .pollId(pollId)
                .build());
        return toDto(saved);
    }

    public ChatMessage get(Long channelId, Long messageId) {
        return toDto(findInChannel(channelId, messageId));
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
        messageReactionRepository.deleteByMessageId(messageId);
        if (message.getPollId() != null) {
            pollVoteRepository.deleteByPollId(message.getPollId());
            pollOptionRepository.deleteByPollId(message.getPollId());
            pollRepository.deleteById(message.getPollId());
        }
        messageRepository.delete(message);
    }

    @Transactional
    public ChatMessage toggleReaction(Long channelId, Long messageId, Long userId, String emoji) {
        Message message = findInChannel(channelId, messageId);
        String normalizedEmoji = emoji == null ? "" : emoji.trim();
        if (normalizedEmoji.isBlank() || normalizedEmoji.length() > 32) {
            throw new IllegalArgumentException("Emoji inválido");
        }
        messageReactionRepository.findByMessageIdAndUserIdAndEmoji(messageId, userId, normalizedEmoji)
                .ifPresentOrElse(
                        messageReactionRepository::delete,
                        () -> messageReactionRepository.save(MessageReaction.builder()
                                .messageId(messageId)
                                .userId(userId)
                                .emoji(normalizedEmoji)
                                .build())
                );
        return toDto(message);
    }

    @Transactional
    public ChatMessage setPinned(Long channelId, Long messageId, Long requesterId, boolean pinned) {
        Message message = findInChannel(channelId, messageId);
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new IllegalArgumentException("Canal não encontrado"));
        permissionService.assertHas(channel.getServerId(), requesterId, ServerPermission.MANAGE_CHANNELS);
        message.setPinned(pinned);
        message.setPinnedAt(pinned ? Instant.now() : null);
        return toDto(messageRepository.save(message));
    }

    public List<ChatMessage> listPinned(Long channelId) {
        List<Message> pinned = messageRepository.findByChannelIdAndPinnedTrueOrderByPinnedAtDesc(channelId);
        return toDtos(pinned);
    }

    public List<ChatMessage> search(Long channelId, String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        List<Message> found = messageRepository
                .findTop50ByChannelIdAndContentContainingIgnoreCaseOrderByIdDesc(channelId, query.trim());
        return toDtos(found);
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
        if (channel == null) return;
        if (channel.isAdminOnly()) {
            boolean isAdmin = userRepository.findById(authorId).map(u -> u.getRole() == Role.ADMIN).orElse(false);
            if (!isAdmin) {
                throw new IllegalStateException("Só administradores podem postar nesse canal");
            }
        }
        // Categoria com acesso restrito (ver CategoryAccessEntry/ServerService.
        // setCategoryAccess) - quem nao esta' na lista nem consegue VER o canal na barra
        // lateral (listChannels ja' filtra), mas isso aqui e' o que impede alguem que descobriu
        // o id do canal por fora (ou tinha acesso e perdeu) de continuar postando.
        if (channel.getCategoryId() != null) {
            var entries = categoryAccessRepository.findByCategoryId(channel.getCategoryId());
            boolean restricted = !entries.isEmpty();
            boolean allowed = entries.stream().anyMatch(e -> e.getUserId().equals(authorId));
            if (restricted && !allowed) {
                throw new IllegalStateException("Você não tem acesso a essa categoria");
            }
        }
    }

    public List<ChatMessage> history(Long channelId) {
        List<Message> messages = messageRepository.findTop50ByChannelIdOrderByIdDesc(channelId).stream()
                .sorted(Comparator.comparing(Message::getId))
                .toList();
        return toDtos(messages);
    }

    private List<ChatMessage> toDtos(List<Message> messages) {
        List<Long> ids = messages.stream().map(Message::getId).toList();
        Map<Long, List<MessageReaction>> reactionsByMessage = messageReactionRepository.findByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(MessageReaction::getMessageId));
        return messages.stream()
                .map(m -> toDto(m, reactionsByMessage.getOrDefault(m.getId(), List.of())))
                .toList();
    }

    private ChatMessage toDto(Message m) {
        return toDto(m, messageReactionRepository.findByMessageId(m.getId()));
    }

    private ChatMessage toDto(Message m, List<MessageReaction> reactions) {
        User author = userRepository.findById(m.getAuthorId()).orElse(null);
        String username = author != null ? author.getUsername() : "desconhecido";
        String avatarUrl = author != null ? author.getAvatarUrl() : null;
        ReplyPreview replyTo = m.getReplyToId() != null ? buildReplyPreview(m.getReplyToId()) : null;
        PollDto poll = m.getPollId() != null ? buildPollDto(m.getPollId()) : null;
        return new ChatMessage(m.getId(), m.getChannelId(), m.getAuthorId(), username, avatarUrl, m.getContent(),
                m.getImageUrl(), m.getCreatedAt(), m.getEditedAt(), m.getReplyToId(), replyTo,
                m.getRollNotation(), m.getRollSides(), m.getRollResultsCsv(), m.getRollTotal(),
                groupReactions(reactions), m.isPinned(), poll,
                m.getFileUrl(), m.getFileName(), m.getFileType(), m.getFileSize());
    }

    private PollDto buildPollDto(Long pollId) {
        Poll poll = pollRepository.findById(pollId).orElse(null);
        if (poll == null) {
            return null;
        }
        List<PollOption> options = pollOptionRepository.findByPollIdOrderByPositionAsc(pollId);
        Map<Long, List<Long>> votersByOption = pollVoteRepository.findByPollId(pollId).stream()
                .collect(Collectors.groupingBy(PollVote::getOptionId, Collectors.mapping(PollVote::getUserId, Collectors.toList())));
        List<PollOptionDto> optionDtos = options.stream()
                .map(o -> new PollOptionDto(o.getId(), o.getText(), votersByOption.getOrDefault(o.getId(), List.of())))
                .toList();
        return new PollDto(poll.getId(), poll.getQuestion(), poll.isMultipleChoice(), poll.getCreatedBy(), optionDtos);
    }

    private List<ReactionSummary> groupReactions(List<MessageReaction> reactions) {
        Map<String, List<Long>> byEmoji = new LinkedHashMap<>();
        for (MessageReaction r : reactions) {
            byEmoji.computeIfAbsent(r.getEmoji(), k -> new java.util.ArrayList<>()).add(r.getUserId());
        }
        return byEmoji.entrySet().stream().map(e -> new ReactionSummary(e.getKey(), e.getValue())).toList();
    }

    private ReplyPreview buildReplyPreview(Long originalId) {
        return messageRepository.findById(originalId).map(original -> {
            User originalAuthor = userRepository.findById(original.getAuthorId()).orElse(null);
            String originalUsername = originalAuthor != null ? originalAuthor.getUsername() : "desconhecido";
            String originalAvatarUrl = originalAuthor != null ? originalAuthor.getAvatarUrl() : null;
            return new ReplyPreview(original.getId(), originalUsername, originalAvatarUrl, original.getContent(), original.getImageUrl(),
                    original.getFileUrl(), original.getFileName(), original.getFileType());
        }).orElse(null);
    }
}
