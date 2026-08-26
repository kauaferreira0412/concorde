package com.codagis.concorde.dto;

import com.codagis.concorde.dto.MessageDtos.ReactionSummary;
import com.codagis.concorde.dto.MessageDtos.ReplyPreview;
import com.codagis.concorde.enums.PresenceStatus;

import java.time.Instant;
import java.util.List;

public class DirectMessageDtos {

    public record DmMessage(Long id, Long channelId, Long authorId, String authorUsername, String authorAvatarUrl,
                             String content, String imageUrl, Instant createdAt, Instant editedAt,
                             Long replyToId, ReplyPreview replyTo,
                             String rollNotation, Integer rollSides, String rollResultsCsv, Integer rollTotal,
                             List<ReactionSummary> reactions, boolean pinned) {}

    public record DmEvent(String type, DmMessage message, Long messageId) {
        public static DmEvent created(DmMessage message) {
            return new DmEvent("CREATED", message, null);
        }
        public static DmEvent updated(DmMessage message) {
            return new DmEvent("UPDATED", message, null);
        }
        public static DmEvent deleted(Long messageId) {
            return new DmEvent("DELETED", null, messageId);
        }
    }

    public record DmChannelInfo(Long channelId, Long otherUserId, String otherUsername, String otherNickname,
                                 String otherAvatarUrl, PresenceStatus otherStatus, DmMessage lastMessage) {}
}
