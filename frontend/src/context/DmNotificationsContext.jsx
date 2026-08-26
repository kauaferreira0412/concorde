import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext.jsx";
import { createChatClient, subscribeToDm, subscribeToFriends } from "../ws/chatSocket";
import { getDesktopNotificationsEnabled } from "../utils/notificationSettings";
import { playMessageSound } from "../utils/soundEffects";

const DmNotificationsContext = createContext(null);

const LAST_READ_PREFIX = "dmLastRead_";
function loadLastRead(channelId) {
  const raw = localStorage.getItem(LAST_READ_PREFIX + channelId);
  return raw ? Number(raw) : 0;
}
function saveLastRead(channelId, messageId) {
  localStorage.setItem(LAST_READ_PREFIX + channelId, String(messageId));
}

/**
 * Rastreia mensagem privada NAO LIDA de TODAS as conversas do usuario, o tempo todo - inclusive
 * enquanto ele esta' navegando dentro de um servidor, nao so' na Home (ver pages/home). Por
 * isso vive aqui, num provider GLOBAL (montado uma vez em App.jsx, fora de /servers e /channels/
 * @me) e nao dentro do Container da Home: o pontinho de notificacao na logo do Concorde (ver
 * ServerSidebar.jsx) precisa continuar aparecendo mesmo com o usuario dentro de um servidor
 * (pedido explicito do usuario) - se isso vivesse so' dentro da Home, sairia da Home e o
 * rastreamento pararia de existir.
 *
 * Mesmo "ultimo lido" via localStorage por conversa que useUnreadMessages.js ja usa pros canais
 * de servidor - so' que aqui e' uma conexao STOMP PROPRIA (nao a mesma da pagina de servidor
 * nem a da Home), assinando "/topic/dm.<canal>" de toda conversa que o usuario tem.
 */
export function DmNotificationsProvider({ children }) {
  const { user, token, isAuthenticated } = useAuth();
  const [stompClient, setStompClient] = useState(null);
  const [stompConnected, setStompConnected] = useState(false);
  const [channels, setChannels] = useState([]);
  const [unreadIds, setUnreadIds] = useState(new Set());
  // Qual conversa esta' sendo VISTA agora (setado pela Home ao abrir uma DM) - mensagem nova
  // dessa conversa nao conta como nao lida, mesmo chegando por aqui.
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

  // Amizade aceita agora = conversa nova pra rastrear; recalcula a lista sempre que algo muda
  // do lado de amigos (ver FriendshipService.notify no backend).
  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const sub = subscribeToFriends(stompClient, () => reloadChannels());
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected, reloadChannels]);

  // Nao-lido inicial: compara a ultima mensagem de cada conversa (ja vem no /api/dm/channels)
  // com o "ultimo lido" salvo - cobre mensagem que chegou enquanto o app estava fechado.
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

  // Um WebSocket por conversa - assinaturas adicionadas/removidas incrementalmente conforme a
  // lista de conversas muda (sem re-assinar tudo do zero a cada render).
  useEffect(() => {
    if (!stompClient || !stompConnected) return;
    const subs = subsRef.current;
    const currentIds = new Set(channels.map((c) => c.channelId));

    channels.forEach((c) => {
      if (subs.has(c.channelId)) return;
      const sub = subscribeToDm(stompClient, c.channelId, (event) => {
        if (event.type !== "CREATED") return;
        const msg = event.message;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, stompClient, stompConnected, user?.id]);

  useEffect(
    () => () => {
      subsRef.current.forEach((s) => s.unsubscribe());
      subsRef.current.clear();
    },
    []
  );

  /** Notificacao de mensagem privada nova - mesmo padrao de useUnreadMessages.js (mensagem de
   *  canal de servidor): som (se "Tocar som..."/notificar estiver ligado) + popup do SO (se a
   *  permissao do navegador tiver sido concedida). */
  function notifyDesktop(message) {
    if (!getDesktopNotificationsEnabled()) return;
    playMessageSound();
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const notification = new Notification(message.authorUsername, {
        body: `Mensagem direta\n${(message.content || (message.imageUrl ? "🖼️ Imagem" : "")).slice(0, 120)}`,
        icon: message.authorAvatarUrl || `${import.meta.env.BASE_URL}icon-192.png`,
        badge: `${import.meta.env.BASE_URL}icon-192.png`,
        tag: `dm-${message.channelId}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // idem useUnreadMessages.js - navegador pode bloquear silenciosamente, sem problema
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
        markDmRead,
        setActiveDmChannel,
      }}
    >
      {children}
    </DmNotificationsContext.Provider>
  );
}

const FALLBACK = { unreadDmIds: new Set(), hasUnreadDm: false, markDmRead: () => {}, setActiveDmChannel: () => {} };

export function useDmNotifications() {
  return useContext(DmNotificationsContext) || FALLBACK;
}
