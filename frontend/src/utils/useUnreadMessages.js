import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { subscribeToChannel } from "../ws/chatSocket";
import { getDesktopNotificationsEnabled } from "./notificationSettings";
import { mentionsUser } from "./mentions";
import { playMessageSound } from "./soundEffects";
import { attachmentSummary } from "./attachmentSummary";

const LAST_READ_PREFIX = "chatLastRead_";

function loadLastRead(channelId) {
  const raw = localStorage.getItem(LAST_READ_PREFIX + channelId);
  return raw ? Number(raw) : 0;
}
function saveLastRead(channelId, messageId) {
  localStorage.setItem(LAST_READ_PREFIX + channelId, String(messageId));
}

export function useUnreadMessages(textChannels, selectedChannelId, stompClient, stompConnected, currentUsername, onNotificationClick, serverName) {
  const [unreadCounts, setUnreadCounts] = useState({});
  const [mentionedChannels, setMentionedChannels] = useState({});

  const selectedChannelIdRef = useRef(selectedChannelId);
  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

  const channelNameById = useRef(new Map());
  useEffect(() => {
    textChannels.forEach((c) => channelNameById.current.set(c.id, c.name));
  }, [textChannels]);

  function markRead(channelId, messageId) {
    if (!messageId) return;
    saveLastRead(channelId, messageId);
    setUnreadCounts((prev) => (prev[channelId] ? { ...prev, [channelId]: 0 } : prev));
    setMentionedChannels((prev) => (prev[channelId] ? { ...prev, [channelId]: false } : prev));
  }

  useEffect(() => {
    let cancelled = false;
    textChannels.forEach((c) => {
      api.get(`/api/channels/${c.id}/messages`).then(({ data }) => {
        if (cancelled) return;
        const lastRead = loadLastRead(c.id);
        const unreadMessages = data.filter((m) => m.id > lastRead && m.authorUsername !== currentUsername);
        setUnreadCounts((prev) => ({ ...prev, [c.id]: unreadMessages.length }));
        if (unreadMessages.some((m) => mentionsUser(m.content, currentUsername))) {
          setMentionedChannels((prev) => ({ ...prev, [c.id]: true }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [textChannels.map((c) => c.id).join(","), currentUsername]);

  useEffect(() => {
    if (!selectedChannelId) return;
    setUnreadCounts((prev) => (prev[selectedChannelId] ? { ...prev, [selectedChannelId]: 0 } : prev));
    let cancelled = false;
    api.get(`/api/channels/${selectedChannelId}/messages`).then(({ data }) => {
      if (cancelled) return;
      const last = data[data.length - 1];
      if (last) markRead(selectedChannelId, last.id);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedChannelId]);

  useEffect(() => {
    if (!stompClient || !stompConnected || textChannels.length === 0) return;
    const subs = textChannels.map((c) =>
      subscribeToChannel(stompClient, c.id, (event) => {
        if (event.type !== "CREATED") return;
        const isMine = event.message.authorUsername === currentUsername;
        const isViewingNow = c.id === selectedChannelIdRef.current && document.visibilityState === "visible";

        if (isMine || isViewingNow) {
          markRead(c.id, event.message.id);
          return;
        }
        setUnreadCounts((prev) => ({ ...prev, [c.id]: (prev[c.id] || 0) + 1 }));
        if (mentionsUser(event.message.content, currentUsername)) {
          setMentionedChannels((prev) => ({ ...prev, [c.id]: true }));
        }
        notifyDesktop(c.id, event.message);
      })
    );
    return () => subs.forEach((s) => s.unsubscribe());
  }, [textChannels.map((c) => c.id).join(","), stompClient, stompConnected, currentUsername]);

  function summarize(text, max = 120) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
  }

  function notifyDesktop(channelId, message) {
    playMessageSound();
    if (!getDesktopNotificationsEnabled()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const channelName = channelNameById.current.get(channelId) || "canal";
    const origin = serverName ? `#${channelName} · ${serverName}` : `#${channelName}`;
    const preview = summarize(attachmentSummary(message));
    try {
      const notification = new Notification(message.authorUsername, {
        body: `${origin}\n${preview}`,
        icon: message.authorAvatarUrl || `${import.meta.env.BASE_URL}icon-192.png`,
        badge: `${import.meta.env.BASE_URL}icon-192.png`,
        tag: `chat-${channelId}`,
        silent: true,
      });
      notification.onclick = () => {
        window.focus();
        onNotificationClick?.(channelId);
        notification.close();
      };
    } catch {
    }
  }

  return { unreadCounts, mentionedChannels, markRead };
}
