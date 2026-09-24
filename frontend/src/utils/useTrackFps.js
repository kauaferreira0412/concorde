import { useEffect, useState } from "react";

export function useTrackFps(track) {
  const [fps, setFps] = useState(null);

  useEffect(() => {
    if (!track) {
      setFps(null);
      return;
    }
    let cancelled = false;

    async function poll() {
      try {
        const report = await track.getRTCStatsReport();
        if (cancelled || !report) return;
        let value = null;
        report.forEach((stat) => {
          if (
            (stat.type === "outbound-rtp" || stat.type === "inbound-rtp") &&
            stat.kind === "video" &&
            typeof stat.framesPerSecond === "number"
          ) {
            value = Math.round(stat.framesPerSecond);
          }
        });
        if (!cancelled) setFps(value);
      } catch {
      }
    }

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [track]);

  return fps;
}
