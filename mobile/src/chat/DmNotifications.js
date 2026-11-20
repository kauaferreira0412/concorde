import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api, { getToken } from "../api";
import { createChatClient } from "../socket";
import { playSound } from "../voice/sounds";

const KEY = "concorde:dm-last-read";
const Ctx = createContext({ unread: new Set(), lastMessages: {}, setActive: () => {}, reload: () => {} });

/**
 * DMs não lidas (igual ao site): guarda no aparelho o id da última mensagem lida de cada conversa
 * e escuta todas as conversas pra marcar as novas.
 */
export function DmNotificationsProvider({ user, children }) {
  const [channels, setChannels] = useState([]);
  const [lastRead, setLastRead] = useState(null);
  const [lastMessages, setLastMessages] = useState({});
  const activeRef = useRef(null);
  const clientRef = useRef(null);
  const subsRef = useRef(new Map());
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => setLastRead(raw ? JSON.parse(raw) : {}))
      .catch(() => setLastRead({}));
  }, []);

  const saveRead = useCallback((channelId, messageId) => {
    if (!channelId || !messageId) return;
    setLastRead((prev) => {
      if (!prev || (prev[channelId] || 0) >= messageId) return prev;
      const next = { ...prev, [channelId]: messageId };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reload = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const { data } = await api.get("/api/dm/channels");
      setChannels(data);
      setLastMessages((prev) => {
        const next = { ...prev };
        for (const c of data) {
          if (c.lastMessage && (!next[c.channelId] || next[c.channelId].id < c.lastMessage.id)) next[c.channelId] = c.lastMessage;
        }
        return next;
      });
    } catch {
      // tenta de novo no próximo foco
    }
  }, []);

  // conexão própria, que escuta todas as conversas
  useEffect(() => {
    if (!user) return;
    reload();
    const client = createChatClient(getToken());
    clientRef.current = client;
    client.onConnect = () => {
      subsRef.current = new Map();
      client.subscribe("/user/queue/friends", () => reload());
      setChannels((c) => [...c]); // força reassinar as conversas
    };
    client.activate();
    const appSub = AppState.addEventListener("change", (s) => s === "active" && reload());
    return () => {
      appSub.remove();
      client.deactivate();
      clientRef.current = null;
      subsRef.current = new Map();
    };
  }, [user, reload]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client?.connected) return;
    for (const c of channels) {
      if (subsRef.current.has(c.channelId)) continue;
      const sub = client.subscribe(`/topic/dm.${c.channelId}`, (frame) => {
        let ev;
        try {
          ev = JSON.parse(frame.body);
        } catch {
          return;
        }
        if (ev.type !== "CREATED" || !ev.message) return;
        const msg = ev.message;
        setLastMessages((prev) => (prev[c.channelId]?.id >= msg.id ? prev : { ...prev, [c.channelId]: msg }));
        const mine = msg.authorId === userRef.current?.id;
        if (mine || activeRef.current === c.channelId) {
          saveRead(c.channelId, msg.id);
        } else {
          playSound("message");
        }
      });
      subsRef.current.set(c.channelId, sub);
    }
  }, [channels, saveRead]);

  /** A conversa aberta agora (marca como lida e não toca som). null ao sair. */
  const setActive = useCallback(
    (channelId) => {
      activeRef.current = channelId;
      if (channelId) {
        const last = lastMessages[channelId];
        if (last) saveRead(channelId, last.id);
      }
    },
    [lastMessages, saveRead]
  );

  const unread = useMemo(() => {
    const set = new Set();
    if (!lastRead) return set;
    for (const [id, msg] of Object.entries(lastMessages)) {
      const channelId = Number(id);
      if (msg.authorId !== user?.id && msg.id > (lastRead[channelId] || 0) && activeRef.current !== channelId) set.add(channelId);
    }
    return set;
  }, [lastMessages, lastRead, user?.id]);

  const value = useMemo(() => ({ unread, lastMessages, setActive, reload }), [unread, lastMessages, setActive, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDmNotifications() {
  return useContext(Ctx);
}
