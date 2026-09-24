import { useCallback, useRef, useState } from "react";

export function useMicLevel() {
  const [level, setLevel] = useState(0);
  const stateRef = useRef({ audioContext: null, rafId: null });

  const stop = useCallback(() => {
    if (stateRef.current.rafId) cancelAnimationFrame(stateRef.current.rafId);
    if (stateRef.current.audioContext) stateRef.current.audioContext.close().catch(() => {});
    stateRef.current = { audioContext: null, rafId: null };
    setLevel(0);
  }, []);

  const start = useCallback(
    (mediaStreamTrack) => {
      stop();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      function tick() {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        setLevel(Math.min(100, Math.round(rms * 300)));
        stateRef.current.rafId = requestAnimationFrame(tick);
      }
      tick();
      stateRef.current.audioContext = audioContext;
    },
    [stop]
  );

  return { level, start, stop };
}
