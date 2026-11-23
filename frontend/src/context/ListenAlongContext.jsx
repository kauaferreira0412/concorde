import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "./AuthContext.jsx";
import { useAlert } from "./AlertContext.jsx";
import { HeadphonesIcon, MusicNoteIcon, XIcon } from "../components/icons.jsx";

const ListenAlongContext = createContext(null);

// a cada quanto tempo confere se o seu Spotify ainda está igual ao de quem você está ouvindo
const SYNC_INTERVAL_MS = 5000;

/**
 * "Ouvir junto" no Spotify: enquanto a sessão está ativa, pede pro backend sincronizar
 * o seu player com o de outra pessoa a cada poucos segundos e mostra uma barrinha de status.
 */
export function ListenAlongProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { showAlert } = useAlert();
  const [session, setSession] = useState(null);
  const [starting, setStarting] = useState(null);
  const syncingRef = useRef(false);
  // showAlert muda a cada render do AlertProvider - via ref pra nao reiniciar o intervalo de sync
  const alertRef = useRef(showAlert);
  alertRef.current = showAlert;

  const handleState = useCallback(
    (data) => {
      if (data?.active) {
        setSession(data);
      } else {
        setSession(null);
        if (data?.message) alertRef.current(data.message, "Ouvir junto");
      }
    },
    []
  );

  // volta a sessão que já existia no backend (ex: recarregou a página)
  useEffect(() => {
    if (!isAuthenticated) {
      setSession(null);
      return;
    }
    api
      .get("/api/spotify/listen-along")
      .then(({ data }) => {
        if (data?.active) setSession(data);
      })
      .catch(() => {});
  }, [isAuthenticated]);

  const active = !!session?.active;
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      api
        .post("/api/spotify/listen-along/sync")
        .then(({ data }) => handleState(data))
        .catch(() => {})
        .finally(() => {
          syncingRef.current = false;
        });
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [active, handleState]);

  const start = useCallback(
    async (hostId) => {
      setStarting(hostId);
      try {
        const { data } = await api.post(`/api/spotify/listen-along/${hostId}`);
        handleState(data);
        return true;
      } catch (err) {
        alertRef.current(err.response?.data?.error || "Não foi possível começar a ouvir junto", "Ouvir junto");
        return false;
      } finally {
        setStarting(null);
      }
    },
    [handleState]
  );

  const stop = useCallback(async () => {
    setSession(null);
    try {
      await api.delete("/api/spotify/listen-along");
    } catch {
      // sem problema: a sessão some sozinha quando o servidor reinicia
    }
  }, []);

  return (
    <ListenAlongContext.Provider value={{ session, starting, start, stop }}>
      {children}
      {active && <ListenAlongBar session={session} onStop={stop} />}
    </ListenAlongContext.Provider>
  );
}

export function useListenAlong() {
  return useContext(ListenAlongContext);
}

function ListenAlongBar({ session, onStop }) {
  const paused = session.status === "HOST_PAUSED";
  return (
    <div className="listen-along-bar" role="status">
      {session.albumArtUrl ? (
        <img src={session.albumArtUrl} alt="" className="listen-along-art" />
      ) : (
        <span className="listen-along-art listen-along-art-empty" aria-hidden="true">
          <MusicNoteIcon size={16} />
        </span>
      )}
      <div className="listen-along-info">
        <span className="listen-along-label">
          <HeadphonesIcon size={11} />
          {paused ? `${session.hostName} pausou` : `Ouvindo junto com ${session.hostName}`}
        </span>
        <span className="listen-along-track">
          <strong>{session.trackName || "..."}</strong>
          {session.artistNames && <span> · {session.artistNames}</span>}
        </span>
      </div>
      {!paused && (
        <span className="listen-along-eq" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )}
      <button type="button" className="icon-btn" title="Parar de ouvir junto" aria-label="Parar de ouvir junto" onClick={onStop}>
        <XIcon size={15} />
      </button>
    </div>
  );
}
