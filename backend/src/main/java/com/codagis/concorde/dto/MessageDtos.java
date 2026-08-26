package com.codagis.concorde.dto;

import com.codagis.concorde.dto.PollDtos.PollDto;

import java.time.Instant;
import java.util.List;

public class MessageDtos {

    public record OutgoingChatMessage(String content, String imageUrl, Long replyToId,
                                       String fileUrl, String fileName, String fileType, Long fileSize) {}

    public record EditChatMessage(Long messageId, String content) {}

    public record DeleteChatMessage(Long messageId) {}

    public record ReplyPreview(Long id, String authorUsername, String authorAvatarUrl, String content, String imageUrl,
                                String fileUrl, String fileName, String fileType) {}

    public record ReactionSummary(String emoji, List<Long> userIds) {}

    public record ToggleReactionRequest(Long messageId, String emoji) {}

    public record PinMessageRequest(Long messageId, boolean pinned) {}

    public record ChatMessage(Long id, Long channelId, Long authorId, String authorUsername, String authorAvatarUrl,
                               String content, String imageUrl, Instant createdAt, Instant editedAt,
                               Long replyToId, ReplyPreview replyTo,
                               String rollNotation, Integer rollSides, String rollResultsCsv, Integer rollTotal,
                               List<ReactionSummary> reactions, boolean pinned, PollDto poll,
                               String fileUrl, String fileName, String fileType, Long fileSize) {}

    public record RollDiceRequest(String notation) {}

    public record ChatEvent(String type, ChatMessage message, Long messageId) {
        public static ChatEvent created(ChatMessage message) {
            return new ChatEvent("CREATED", message, null);
        }
        public static ChatEvent updated(ChatMessage message) {
            return new ChatEvent("UPDATED", message, null);
        }
        public static ChatEvent deleted(Long messageId) {
            return new ChatEvent("DELETED", null, messageId);
        }
    }

    public record AttachmentResponse(String url) {}

    // Anexo generico (video/documento/audio, ver GcsService.uploadAttachment) - resposta do
    // upload SEPARADA de AttachmentResponse (que continua so' pra imagem, sem mudar nada nela)
    // pra nao arriscar quebrar o fluxo de imagem que ja' funciona.
    public record FileAttachmentResponse(String url, String name, String contentType, long size) {}
}
