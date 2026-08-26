import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import { subscribeToChannel } from "../ws/chatSocket";
import { getDesktopNotificationsEnabled } from "./notificationSettings";
import { mentionsUser } from "./mentions";
import { playMessageSound } from "./soundEffects";

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
 * mensagem no canal que voce ja esta olhando, ou escrita por voce mesmo. serverName so' e'
 * usado pra dar contexto na notificacao (ver notifyDesktop).
 */
export function useUnreadMessages(textChannels, selectedChannelId, stompClient, stompConnected, currentUsername, onNotificationClick, serverName) {
  const [unreadCounts, setUnreadCounts] = useState({}); // channelId -> quantidade
  // channelId -> true se alguma mensagem NAO LIDA daquele canal menciona voce (@seu_username) -
  // mostra um "@" destacado do lado do numerozinho de nao lidas (ver ChannelSidebar.jsx), pedido
  // explicito do usuario pra ficar mais em destaque que uma mencao normal em meio a outras
  // mensagens nao lidas.
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

  // Assim que a lista de canais aparece, calcula o nao-lido inicial comparando o historico
  // (ultimas 50 mensagens) com o que ja foi marcado como lido antes.
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
        if (mentionsUser(event.message.content, currentUsername)) {
          setMentionedChannels((prev) => ({ ...prev, [c.id]: true }));
        }
        notifyDesktop(c.id, event.message);
      })
    );
    return () => subs.forEach((s) => s.unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textChannels.map((c) => c.id).join(","), stompClient, stompConnected, currentUsername]);

  /** Resume o texto igual o Discord faz na propria notificacao/preview - corta com "…" em vez
   *  de deixar a notificacao gigante (o SO ja trunca sozinho, mas de um jeito feio, no meio de
   *  qualquer palavra e sem aviso nenhum). */
  function summarize(text, max = 120) {
    const clean = text.replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
  }

  function notifyDesktop(channelId, message) {
    if (!getDesktopNotificationsEnabled()) return;
    // O som toca mesmo sem permissao de notificacao do navegador concedida (o popup visual
    // precisa dela, o audio nao) - senao quem nunca autorizou o popup tambem nunca ouve nada.
    playMessageSound();
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const channelName = channelNameById.current.get(channelId) || "canal";
    // Linha 1 = de ONDE vem (canal + servidor), linha 2 = a mensagem resumida - igual
    // Discord/Slack/Telegram mostram remetente + canal + preview do texto, nao so' o texto cru.
    const origin = serverName ? `#${channelName} · ${serverName}` : `#${channelName}`;
    const preview = summarize(message.content || (message.imageUrl ? "🖼️ Imagem" : ""));
    try {
      const notification = new Notification(message.authorUsername, {
        body: `${origin}\n${preview}`,
        // import.meta.env.BASE_URL: "/" no site, "./" no app desktop (ver vite.config.js) -
        // caminho absoluto puro nao acha o icone dentro do pacote Electron (file://). O avatar
        // de quem mandou vira o icone GRANDE (igual Discord/Telegram) - o icone PEQUENO/"dono
        // da notificacao" (o logo do Concorde de verdade) e' o app.setAppUserModelId no Windows
        // (ver main.cjs), que o SO usa sozinho, sem precisar passar nada aqui.
        icon: message.authorAvatarUrl || `${import.meta.env.BASE_URL}icon-192.png`,
        badge: `${import.meta.env.BASE_URL}icon-192.png`,
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

  return { unreadCounts, mentionedChannels, markRead };
}
