import { useEffect, useState } from "react";
import api from "../api/client";

/** Jogo da Steam que cada usuário está jogando agora ({ [userId]: { name, gameId, headerUrl, storeUrl } }). */
export function useSteamPlaying(userIds) {
  const key = [...new Set((userIds || []).filter((id) => id != null))].sort((a, b) => a - b).join(",");
  const [playing, setPlaying] = useState({});

  useEffect(() => {
    if (!key) {
      setPlaying({});
      return;
    }
    let cancelled = false;
    function poll() {
      api
        .post("/api/steam/playing/batch", { userIds: key.split(",").map(Number) })
        .then(({ data }) => {
          if (!cancelled) setPlaying(data || {});
        })
        .catch(() => {});
    }
    poll();
    // o backend guarda o resultado por 30s - consultar mais rápido que isso não adianta
    const interval = setInterval(poll, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return playing;
}
