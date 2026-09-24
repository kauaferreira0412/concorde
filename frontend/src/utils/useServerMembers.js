import { useEffect, useState } from "react";
import api from "../api/client";
import { subscribeToPresence } from "../ws/chatSocket";

export function useServerMembers(serverId, stompClient, stompConnected) {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    api.get(`/api/servers/${serverId}/members`).then(({ data }) => {
      if (!cancelled) setMembers(data);
    });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToPresence(stompClient, ({ userId, status }) => {
      setMembers((prev) => {
        if (!prev.some((m) => m.userId === userId)) return prev;
        return prev
          .map((m) => (m.userId === userId ? { ...m, status } : m))
          .sort((a, b) => {
            const aOffline = a.status === "OFFLINE";
            const bOffline = b.status === "OFFLINE";
            if (aOffline !== bOffline) return aOffline ? 1 : -1;
            return a.username.localeCompare(b.username);
          });
      });
    });
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected]);

  return members;
}
