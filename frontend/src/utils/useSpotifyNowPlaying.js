import { useEffect, useState } from "react";
import api from "../api/client";

export function useSpotifyNowPlaying(userIds) {
  const key = [...new Set((userIds || []).filter((id) => id != null))].sort((a, b) => a - b).join(",");
  const [nowPlaying, setNowPlaying] = useState({});

  useEffect(() => {
    if (!key) {
      setNowPlaying({});
      return;
    }
    let cancelled = false;
    function poll() {
      api
        .post("/api/spotify/now-playing/batch", { userIds: key.split(",").map(Number) })
        .then(({ data }) => {
          if (!cancelled) setNowPlaying(data || {});
        })
        .catch(() => {
        });
    }
    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return nowPlaying;
}
