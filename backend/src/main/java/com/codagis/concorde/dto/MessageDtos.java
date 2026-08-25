package com.codagis.concorde.dto;

import java.time.Instant;

public class MessageDtos {

    public record OutgoingChatMessage(String content, String imageUrl, Long replyToId) {}

    public record EditChatMessage(Long messageId, String content) {}

    public record DeleteChatMessage(Long messageId) {}

    public record ReplyPreview(Long id, String authorUsername, String authorAvatarUrl, String content, String imageUrl) {}

    public record ChatMessage(Long id, Long channelId, Long authorId, String authorUsername, String authorAvatarUrl,
                               String content, String imageUrl, Instant createdAt, Instant editedAt,
                               Long replyToId, ReplyPreview replyTo,
                               String rollNotation, Integer rollSides, String rollResultsCsv, Integer rollTotal) {}

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
}
