import { useEffect, useState } from "react";

/**
 * FPS de VERDADE (o que o proprio WebRTC esta medindo, "framesPerSecond" das stats do
 * Chromium) de um LocalVideoTrack/RemoteVideoTrack do LiveKit - nao e' um contador que a gente
 * calcula na mao contando frames renderizados, e' o valor que o navegador ja' expoe pronto,
 * tanto pra quem esta TRANSMITINDO ("outbound-rtp") quanto pra quem esta ASSISTINDO
 * ("inbound-rtp"). Usado no contador de fps do quadrado de transmissao de tela (ver
 * ScreenShareTile em VoiceChannel.jsx, pedido explicito do usuario).
 */
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
        // Track ja' foi desanexado/fechado bem no meio da leitura - so' ignora essa rodada,
        // a proxima tentativa (1s depois) resolve sozinha se o track ainda existir.
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
