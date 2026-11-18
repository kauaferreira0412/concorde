import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { subscribeToPresence } from "../ws/chatSocket";

const REFRESH_MS = 60000;

function sortMembers(list) {
  return [...list].sort((a, b) => {
    const aOffline = a.status === "OFFLINE";
    const bOffline = b.status === "OFFLINE";
    if (aOffline !== bOffline) return aOffline ? 1 : -1;
    return a.username.localeCompare(b.username);
  });
}

export function useServerMembers(serverId, stompClient, stompConnected) {
  const [members, setMembers] = useState([]);
  const serverIdRef = useRef(serverId);
  serverIdRef.current = serverId;

  const refresh = useCallback(() => {
    const id = serverIdRef.current;
    if (!id) return;
    api
      .get(`/api/servers/${id}/members`)
      .then(({ data }) => {
        if (serverIdRef.current === id) setMembers(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMembers([]);
    refresh();
  }, [serverId, refresh]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return undefined;
    const sub = subscribeToPresence(stompClient, (event) => {
      const { userId, status } = event;
      setMembers((prev) => {
        if (!prev.some((m) => String(m.userId) === String(userId))) return prev;
        return sortMembers(
          prev.map((m) =>
            String(m.userId) === String(userId)
              ? { ...m, status, ...("customStatus" in event ? { customStatus: event.customStatus } : {}) }
              : m
          )
        );
      });
    });
    // Recarrega depois de assinar: cobre eventos perdidos enquanto estava desconectado/reconectando.
    refresh();
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected, refresh]);

  // Rede de segurança: ao voltar pro app e a cada minuto, confere a lista com o servidor.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  return members;
}
