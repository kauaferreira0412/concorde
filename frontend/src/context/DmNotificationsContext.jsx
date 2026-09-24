import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext.jsx";
import { createChatClient, subscribeToDm, subscribeToFriends } from "../ws/chatSocket";
import { getDesktopNotificationsEnabled } from "../utils/notificationSettings";
import { playMessageSound } from "../utils/soundEffects";
import { attachmentSummary } from "../utils/attachmentSummary";

const DmNotificationsContext = createContext(null);

const LAST_READ_PREFIX = "dmLastRead_";
function loadLastRead(channelId) {
  const raw = localStorage.getItem(LAST_READ_PREFIX + channelId);
  return raw ? Number(raw) : 0;
}
function saveLastRead(channelId, messageId) {
  localStorage.setItem(LAST_READ_PREFIX + channelId, String(messageId));
}

export function DmNotificationsProvider({ children }) {
  const { user, token, isAuthenticated } = useAuth();
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [channels, setChannels] = useState([]);
  const [unreadIds, setUnreadIds] = useState(new Set());
  const [latestMessages, setLatestMessages] = useState({});
  const activeChannelIdRef = useRef(null);
  const subsRef = useRef(new Map());

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const client = createChatClient(token);
    client.onConnect = () => setStompConnected(true);
    client.onDisconnect = () => setStompConnected(false);
    client.activate();
    setStompClient(client);
    return () => {
      client.deactivate();
      setStompConnected(false);
    };
  }, [isAuthenticated, token]);

  const reloadChannels = useCallback(() => {
    if (!isAuthenticated) return;
    api.get("/api/dm/channels").then(({ data }) => setChannels(data));
  }, [isAuthenticated]);

  useEffect(() => {
    reloadChannels();
  }, [reloadChannels]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToFriends(stompClient, () => reloadChannels());
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected, reloadChannels]);

  useEffect(() => {
    setLatestMessages((prev) => {
      const next = { ...prev };
      let changed = false;
      channels.forEach((c) => {
        if (!c.lastMessage) return;
        const existing = next[c.channelId];
        if (!existing || c.lastMessage.id > existing.id) {
          next[c.channelId] = c.lastMessage;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [channels]);

  useEffect(() => {
    setUnreadIds((prev) => {
      const next = new Set(prev);
      channels.forEach((c) => {
        if (!c.lastMessage || c.lastMessage.authorId === user?.id) {
          next.delete(c.channelId);
          return;
        }
        if (c.lastMessage.id > loadLastRead(c.channelId)) next.add(c.channelId);
        else next.delete(c.channelId);
      });
      return next;
    });
  }, [channels, user?.id]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const subs = subsRef.current;
    const currentIds = new Set(channels.map((c) => c.channelId));

    channels.forEach((c) => {
      if (subs.has(c.channelId)) return;
      const sub = subscribeToDm(stompClient, c.channelId, (event) => {
        if (event.type !== "CREATED") return;
        const msg = event.message;
        setLatestMessages((prev) => {
          const existing = prev[c.channelId];
          if (existing && existing.id >= msg.id) return prev;
          return { ...prev, [c.channelId]: msg };
        });
        const isMine = msg.authorId === user?.id;
        const isViewingNow = c.channelId === activeChannelIdRef.current && document.visibilityState === "visible";
        if (isMine || isViewingNow) {
          saveLastRead(c.channelId, msg.id);
          setUnreadIds((prev) => {
            if (!prev.has(c.channelId)) return prev;
            const next = new Set(prev);
            next.delete(c.channelId);
            return next;
          });
          return;
        }
        setUnreadIds((prev) => (prev.has(c.channelId) ? prev : new Set(prev).add(c.channelId)));
        notifyDesktop(msg);
      });
      subs.set(c.channelId, sub);
    });

    [...subs.keys()].forEach((id) => {
      if (!currentIds.has(id)) {
        subs.get(id).unsubscribe();
        subs.delete(id);
      }
    });
  }, [channels, stompClient, stompConnected, user?.id]);

  useEffect(
    () => () => {
      subsRef.current.forEach((s) => s.unsubscribe());
      subsRef.current.clear();
    },
    []
  );

  function notifyDesktop(message) {
    playMessageSound();
    if (!getDesktopNotificationsEnabled()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const notification = new Notification(message.authorUsername, {
        body: `Mensagem direta\n${attachmentSummary(message).slice(0, 120)}`,
        icon: message.authorAvatarUrl || `${import.meta.env.BASE_URL}icon-192.png`,
        badge: `${import.meta.env.BASE_URL}icon-192.png`,
        tag: `dm-${message.channelId}`,
        silent: true,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
    }
  }

  function markDmRead(channelId, messageId) {
    activeChannelIdRef.current = channelId;
    if (messageId) saveLastRead(channelId, messageId);
    setUnreadIds((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
  }

  function setActiveDmChannel(channelId) {
    activeChannelIdRef.current = channelId;
  }

  return (
    <DmNotificationsContext.Provider
      value={{
        unreadDmIds: unreadIds,
        hasUnreadDm: unreadIds.size > 0,
        latestDmMessages: latestMessages,
        markDmRead,
        setActiveDmChannel,
      }}
    >
      {children}
    </DmNotificationsContext.Provider>
  );
}

const FALLBACK = {
  unreadDmIds: new Set(),
  hasUnreadDm: false,
  latestDmMessages: {},
  markDmRead: () => {},
  setActiveDmChannel: () => {},
};

export function useDmNotifications() {
  return useContext(DmNotificationsContext) || FALLBACK;
}
