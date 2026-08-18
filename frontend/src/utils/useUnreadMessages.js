import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { subscribeToChannel } from "../ws/chatSocket";
import { getDesktopNotificationsEnabled } from "./notificationSettings";

const LAST_READ_PREFIX = "chatLastRead_";

function loadLastRead(channelId) {
  const raw = localStorage.getItem(LAST_READ_PREFIX + channelId);
  return raw ? Number(raw) : 0;
}
function saveLastRead(channelId, messageId) {
  localStorage.setItem(LAST_READ_PREFIX + channelId, String(messageId));
}

/**
 * Contagem de mensagens nao lidas por canal de texto + notificacao no PC quando chega uma
 * nova (se o usuario tiver ligado isso em Configuracoes). "Nao lido" e' rastreado so' no
 * navegador (localStorage por canal) - nao existe conceito disso no backend, entao nao
 * sincroniza entre dispositivos diferentes, mas evita precisar de infra nova pra isso.
 *
 * onSelectChannel e currentUsername vem de fora pra decidir o que NAO deve contar/notificar:
 * mensagem no canal que voce ja esta olhando, ou escrita por voce mesmo.
 */
export function useUnreadMessages(textChannels, selectedChannelId, stompClient, stompConnected, currentUsername, onNotificationClick) {
  const [unreadCounts, setUnreadCounts] = useState({}); // channelId -> quantidade

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
  }

  // Assim que a lista de canais aparece, calcula o nao-lido inicial comparando o historico
  // (ultimas 50 mensagens) com o que ja foi marcado como lido antes.
  useEffect(() => {
    let cancelled = false;
    textChannels.forEach((c) => {
      api.get(`/api/channels/${c.id}/messages`).then(({ data }) => {
        if (cancelled) return;
        const lastRead = loadLastRead(c.id);
        const unread = data.filter((m) => m.id > lastRead && m.authorUsername !== currentUsername).length;
        setUnreadCounts((prev) => ({ ...prev, [c.id]: unread }));
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textChannels.map((c) => c.id).join(","), currentUsername]);

  // Zera na hora ao abrir um canal (nao espera a proxima mensagem chegar pra sumir o numero)
  // E salva no localStorage ate' onde voce leu - sem isso o numero soh sumia da tela por
  // enquanto (estado em memoria), mas voltava do mesmo jeito no proximo login/F5, porque o
  // "ultimo lido" salvo nunca tinha sido atualizado de verdade.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId]);

  // Um WebSocket por canal de texto - assim sabe de mensagem nova mesmo em canal que voce
  // nao esta olhando agora (precisa pra contar/notificar).
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
        notifyDesktop(c.id, event.message);
      })
    );
    return () => subs.forEach((s) => s.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textChannels.map((c) => c.id).join(","), stompClient, stompConnected, currentUsername]);

  function notifyDesktop(channelId, message) {
    if (!getDesktopNotificationsEnabled()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const channelName = channelNameById.current.get(channelId) || "canal";
    const body = message.content || (message.imageUrl ? "🖼️ Imagem" : "");
    try {
      const notification = new Notification(`${message.authorUsername} em #${channelName}`, {
        body,
        // import.meta.env.BASE_URL: "/" no site, "./" no app desktop (ver vite.config.js) -
        // caminho absoluto puro nao acha o icone dentro do pacote Electron (file://).
        icon: message.authorAvatarUrl || `${import.meta.env.BASE_URL}icon-192.png`,
        tag: `chat-${channelId}`, // agrupa notificacoes do mesmo canal em vez de empilhar
      });
      notification.onclick = () => {
        window.focus();
        onNotificationClick?.(channelId);
        notification.close();
      };
    } catch {
      // alguns navegadores/SO bloqueiam silenciosamente - nao ha o que fazer alem de ignorar
    }
  }

  return { unreadCounts, markRead };
}
