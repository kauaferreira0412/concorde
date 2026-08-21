import { useEffect, useState } from "react";
import api from "../api/client";
import { subscribeToMusicQueue } from "../ws/chatSocket";
import { TrashIcon } from "./icons.jsx";

/** "125" -> "2:05", "3725" -> "1:02:05". null (duracao desconhecida, ex: live) -> "?". */
function formatDuration(sec) {
  if (sec == null) return "?";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Cartao ao vivo da fila de musica (ver /fila em ChatWindow.jsx) - carrega o estado atual na
 * hora que abre (GET) e depois so' ouve o WebSocket (ver subscribeToMusicQueue), que o bot
 * atualiza sozinho toda vez que algo muda (musica trocou, alguem adicionou/removeu - ver
 * music-bot/index.js broadcastQueue). channelId aqui e' o canal de VOZ onde o bot toca, nao o
 * canal de texto onde essa mensagem apareceu (podem ser diferentes).
 *
 * A fila e' PUBLICA (pedido explicito do usuario) - qualquer membro conectado nessa call pode
 * tirar qualquer musica dela, sem exigir nenhuma permissao de moderacao.
 */
export default function MusicQueueCard({ channelId, stompClient, stompConnected }) {
  const [state, setState] = useState(null); // { nowPlaying, queue } | null (ainda carregando)
  const [removingIndex, setRemovingIndex] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/channels/${channelId}/music/queue`)
      .then(({ data }) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState({ nowPlaying: null, queue: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!stompClient || !stompConnected) return undefined;
    const sub = subscribeToMusicQueue(stompClient, channelId, (data) => setState(data));
    return () => sub.unsubscribe();
  }, [stompClient, stompConnected, channelId]);

  async function removeAt(index) {
    setError("");
    setRemovingIndex(index);
    try {
      await api.post(`/api/channels/${channelId}/music/queue/remove`, { index });
      // Nao precisa atualizar o state na mao - o bot avisa a remocao de volta pelo WebSocket
      // (ver subscribeToMusicQueue acima), essa chamada so' dispara a acao.
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível remover essa música");
    } finally {
      setRemovingIndex(null);
    }
  }

  if (!state) {
    return <div className="music-queue-card music-queue-loading">🎵 Carregando fila…</div>;
  }

  const { nowPlaying, queue } = state;

  return (
    <div className="music-queue-card">
      <p className="music-queue-title">🎵 Fila de música</p>

      {nowPlaying ? (
        <div className="music-queue-now-playing">
          <span className="music-queue-now-label">Tocando agora</span>
          <span className="music-queue-now-title">{nowPlaying.title}</span>
          <span className="music-queue-duration">{formatDuration(nowPlaying.durationSec)}</span>
        </div>
      ) : (
        <p className="music-queue-empty">Nada tocando no momento.</p>
      )}

      {queue.length > 0 && (
        <ol className="music-queue-list">
          {queue.map((item, i) => (
            <li key={i} className="music-queue-item">
              <span className="music-queue-position">{i + 1}</span>
              <span className="music-queue-item-title">{item.title}</span>
              <span className="music-queue-duration">{formatDuration(item.durationSec)}</span>
              <button
                type="button"
                className="music-queue-remove-btn"
                title="Remover da fila"
                disabled={removingIndex === i}
                onClick={() => removeAt(i)}
              >
                <TrashIcon size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="music-queue-error">{error}</p>}
    </div>
  );
}
