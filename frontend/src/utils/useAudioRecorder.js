import { useEffect, useRef, useState } from "react";

const LEVEL_HISTORY = 48;
const LEVEL_SAMPLE_MS = 90;

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  // Histórico curto do volume (0-1) pra desenhar a onda ao vivo enquanto grava.
  const [levels, setLevels] = useState([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const meterRef = useRef(null);

  function stopMeter() {
    const meter = meterRef.current;
    meterRef.current = null;
    if (!meter) return;
    clearInterval(meter.interval);
    meter.ctx.close().catch(() => {});
  }

  function startMeter(stream) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const interval = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        setLevels((prev) => [...prev.slice(-(LEVEL_HISTORY - 1)), level]);
      }, LEVEL_SAMPLE_MS);
      meterRef.current = { ctx, interval };
    } catch {
      // sem Web Audio: a barra mostra só o timer
    }
  }

  useEffect(() => () => {
    stopMeter();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    mediaRecorderRef.current = recorder;
    setLevels([]);
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    startMeter(stream);
  }

  function stop() {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        stopMeter();
        setRecording(false);
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      recorder.stop();
    });
  }

  function cancel() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timerRef.current);
    stopMeter();
    setRecording(false);
    setSeconds(0);
    setLevels([]);
    chunksRef.current = [];
  }

  return { recording, seconds, levels, start, stop, cancel };
}
