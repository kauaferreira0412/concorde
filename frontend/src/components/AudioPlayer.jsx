import { useEffect, useRef, useState } from "react";
import { MicIcon, MusicNoteIcon } from "./icons.jsx";

const BAR_COUNT = 42;
const SPEEDS = [1, 1.5, 2];
const peaksCache = new Map();
let currentlyPlaying = null;

/** Barras "falsas" mas estáveis pra quando não dá pra decodificar o arquivo. */
function seededPeaks(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const wave = 0.55 + 0.35 * Math.sin(i / 3.1);
    return Math.max(0.15, Math.min(1, wave * (0.5 + (h % 1000) / 1000)));
  });
}

/** Lê o áudio e calcula o pico de volume de cada fatia (vira a onda do player). */
async function loadPeaks(url) {
  if (peaksCache.has(url)) return peaksCache.get(url);
  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch");
    const buf = await res.arrayBuffer();
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / BAR_COUNT));
    const peaks = [];
    for (let b = 0; b < BAR_COUNT; b++) {
      let max = 0;
      for (let i = b * block; i < Math.min(data.length, (b + 1) * block); i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return { peaks: peaks.map((p) => Math.max(0.12, p / top)), duration: audio.duration };
  })();
  // Falha (ex.: storage sem CORS) fica em cache também: usa a onda de reserva sem tentar de novo.
  peaksCache.set(url, promise);
  promise.catch(() => {});
  return promise;
}

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Player de áudio no estilo adesivo: botão de play, onda clicável (pula pro ponto), tempo e velocidade.
 * Mensagens de voz (nome "Mensagem de voz…") ganham o selo de microfone.
 */
export default function AudioPlayer({ src, name, compact = false }) {
  const audioRef = useRef(null);
  const waveRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [peaks, setPeaks] = useState(() => seededPeaks(src || ""));
  const isVoice = !name || /^mensagem de voz/i.test(name);

  useEffect(() => {
    let cancelled = false;
    setPeaks(seededPeaks(src || ""));
    if (!src) return undefined;
    loadPeaks(src)
      .then((r) => {
        if (cancelled) return;
        setPeaks(r.peaks);
        if (Number.isFinite(r.duration)) setDuration((d) => (Number.isFinite(d) && d > 0 ? d : r.duration));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    function onMeta() {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    }
    function onTime() {
      setCurrent(el.currentTime);
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    }
    function onPlay() {
      if (currentlyPlaying && currentlyPlaying !== el) currentlyPlaying.pause();
      currentlyPlaying = el;
      setPlaying(true);
    }
    function onPause() {
      setPlaying(false);
    }
    function onEnded() {
      setPlaying(false);
      setCurrent(0);
      el.currentTime = 0;
    }
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      if (currentlyPlaying === el) currentlyPlaying = null;
    };
  }, []);

  // Atualiza o progresso suave enquanto toca (timeupdate só dispara ~4x por segundo).
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => {
      if (audioRef.current) setCurrent(audioRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  function seekFromEvent(e) {
    const el = audioRef.current;
    const rect = waveRef.current?.getBoundingClientRect();
    if (!el || !rect || !duration) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = frac * duration;
    setCurrent(el.currentTime);
  }

  function handleWaveKey(e) {
    const el = audioRef.current;
    if (!el || !duration) return;
    if (e.key === "ArrowRight") el.currentTime = Math.min(duration, el.currentTime + 5);
    else if (e.key === "ArrowLeft") el.currentTime = Math.max(0, el.currentTime - 5);
    else return;
    e.preventDefault();
    setCurrent(el.currentTime);
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const played = Math.round(progress * peaks.length);

  return (
    <div className={"audio-player" + (playing ? " playing" : "") + (compact ? " compact" : "")}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="audio-player-toggle"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Tocar"}
        title={playing ? "Pausar" : "Tocar"}
      >
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1.5" />
            <rect x="14" y="5" width="4" height="14" rx="1.5" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        )}
      </button>

      <div className="audio-player-main">
        <div
          ref={waveRef}
          className="audio-player-wave"
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(current)}
          onClick={seekFromEvent}
          onKeyDown={handleWaveKey}
        >
          {peaks.map((p, i) => (
            <span key={i} className={i < played ? "on" : ""} style={{ height: `${Math.round(p * 100)}%` }} />
          ))}
        </div>
        <div className="audio-player-meta">
          <span className="audio-player-time">
            {fmt(playing || current > 0 ? current : duration)}
            {(playing || current > 0) && duration > 0 ? ` / ${fmt(duration)}` : ""}
          </span>
          {!compact && (
            <span className="audio-player-name" title={name || "Mensagem de voz"}>
              {isVoice ? <MicIcon size={12} /> : <MusicNoteIcon size={12} />}
              {isVoice ? "mensagem de voz" : name}
            </span>
          )}
        </div>
      </div>

      <button type="button" className="audio-player-speed" onClick={cycleSpeed} title="Velocidade">
        {SPEEDS[speedIdx]}x
      </button>
    </div>
  );
}
