import { useEffect, useState } from "react";
import api from "../api/client";
import { subscribeToMusicQueue } from "../ws/chatSocket";
import { TrashIcon, PlusIcon, XIcon, ChevronsRightIcon } from "./icons.jsx";

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
 * adicionar, tirar ou apagar a fila inteira, sem exigir nenhuma permissao de moderacao. So'
 * pode ter UMA fila aberta por canal - "active:false" (ver bot) significa que essa foi apagada
 * (ou nunca foi aberta) e precisa de um /fila novo pra abrir outra.
 */
export default function MusicQueueCard({ channelId, stompClient, stompConnected }) {
  const [state, setState] = useState(null); // { active, nowPlaying, queue } | null (carregando)
  const [removingIndex, setRemovingIndex] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/channels/${channelId}/music/queue`)
      .then(({ data }) => {
        if (!cancelled) setState(data);
      })
      .catch(() => {
        if (!cancelled) setState({ active: false, name: null, nowPlaying: null, queue: [] });
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

  async function deleteQueue() {
    setError("");
    setDeleting(true);
    try {
      await api.post(`/api/channels/${channelId}/music/queue/delete`);
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível apagar a fila");
    } finally {
      setDeleting(false);
    }
  }

  async function skipSong() {
    setError("");
    setSkipping(true);
    try {
      await api.post(`/api/channels/${channelId}/music/skip`);
      // Estado (nowPlaying/queue) atualiza sozinho pelo WebSocket, igual as outras acoes.
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível pular essa música");
    } finally {
      setSkipping(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    const query = addQuery.trim();
    if (!query) return;
    setError("");
    setAdding(true);
    try {
      await api.post(`/api/channels/${channelId}/music/play`, { query });
      setAddQuery("");
    } catch (err) {
      setError(err.response?.data?.error || "Não foi possível adicionar essa música");
    } finally {
      setAdding(false);
    }
  }

  if (!state) {
    return <div className="music-queue-card music-queue-loading">🎵 Carregando fila…</div>;
  }

  const { active, name, nowPlaying, queue } = state;
  const title = name ? `🎵 ${name}` : "🎵 Fila de música";

  if (!active) {
    return (
      <div className="music-queue-card music-queue-closed">
        <p className="music-queue-title">{title}</p>
        <p className="music-queue-empty">Essa fila foi apagada. Use /fila pra abrir uma nova.</p>
      </div>
    );
  }

  return (
    <div className="music-queue-card">
      <div className="music-queue-header">
        <p className="music-queue-title">{title}</p>
        <button type="button" className="music-queue-delete-btn" title="Apagar fila" disabled={deleting} onClick={deleteQueue}>
          <XIcon size={13} /> Apagar fila
        </button>
      </div>

      {nowPlaying ? (
        <div className="music-queue-now-playing">
          <span className="music-queue-now-label">Tocando agora</span>
          <span className="music-queue-now-title">{nowPlaying.title}</span>
          <span className="music-queue-duration">{formatDuration(nowPlaying.durationSec)}</span>
          <button
            type="button"
            className="music-queue-skip-btn"
            title="Pular pra próxima música"
            disabled={skipping}
            onClick={skipSong}
          >
            <ChevronsRightIcon size={14} /> Pular
          </button>
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

      <form className="music-queue-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="Link ou nome da música..."
          value={addQuery}
          onChange={(e) => setAddQuery(e.target.value)}
          disabled={adding}
        />
        <button type="submit" className="music-queue-add-btn" disabled={adding || !addQuery.trim()} title="Adicionar à fila">
          {adding ? <span className="music-queue-spinner" /> : <PlusIcon size={14} />}
        </button>
      </form>

      {error && <p className="music-queue-error">{error}</p>}
    </div>
  );
}
