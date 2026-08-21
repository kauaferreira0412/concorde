import { useEffect, useState } from "react";

// Cores dos confetes - nada especial, so' uma paleta alegre que combina com o resto do app.
const COLORS = ["#ffb800", "#ff6b6b", "#4dd4ac", "#5b8def", "#c77dff", "#ffd166", "#ff8fab"];

function makePieces(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    duration: 3.2 + Math.random() * 2.6,
    delay: Math.random() * 1.4,
    round: Math.random() > 0.5,
  }));
}

/**
 * Confete leve pra celebrar o servidor (presente de aniversario do "Potato Mafia", ver
 * ServerPage.jsx - so' aparece nesse servidor especifico). De proposito NAO usa canvas nem
 * biblioteca nenhuma: e' so' um punhado de <span> com uma animacao CSS pura (@keyframes,
 * ver global.css) - o navegador anima isso no compositor (GPU), sem nenhum trabalho de JS
 * por frame, entao nao pesa nem trava nada mesmo com varias pessoas na call/tela cheia.
 * Dispara uma leva ao montar e depois de tempos em tempos (intervalMs) - nao fica caindo
 * confete o tempo todo, so' um "toque" ocasional.
 */
export default function PartyConfetti({ intervalMs = 180000, burstMs = 6000, pieceCount = 36 }) {
  const [pieces, setPieces] = useState(null);

  useEffect(() => {
    let hideTimer;
    function burst() {
      setPieces(makePieces(pieceCount));
      hideTimer = setTimeout(() => setPieces(null), burstMs);
    }
    burst();
    const intervalId = setInterval(burst, intervalMs);
    return () => {
      clearInterval(intervalId);
      clearTimeout(hideTimer);
    };
  }, [intervalMs, burstMs, pieceCount]);

  if (!pieces) return null;

  return (
    <div className="party-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            borderRadius: p.round ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}
