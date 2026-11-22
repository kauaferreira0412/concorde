import { useMemo } from "react";
import { useUiPrefs } from "../utils/uiPrefs";

const FLAKE_COUNT = 45;

function makeFlakes() {
  return Array.from({ length: FLAKE_COUNT }, () => ({
    left: Math.random() * 100,
    size: 3 + Math.random() * 7,
    duration: 9 + Math.random() * 12,
    delay: -Math.random() * 20,
    drift: -50 + Math.random() * 100,
    opacity: 0.3 + Math.random() * 0.55,
  }));
}

/** Nevando + enfeite de Natal no canto - puramente decorativo, não intercepta clique nenhum. */
export default function SnowEffect() {
  const { snowEffect } = useUiPrefs();
  const flakes = useMemo(() => makeFlakes(), []);

  if (!snowEffect) return null;

  return (
    <div className="snow-overlay" aria-hidden="true">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={{
            left: `${f.left}%`,
            width: f.size,
            height: f.size,
            opacity: f.opacity,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            "--drift": `${f.drift}px`,
          }}
        />
      ))}

      <svg className="xmas-corner" viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg">
        {/* fita pendurada no canto */}
        <path d="M60 0 L60 34" stroke="#7A1F1F" strokeWidth="4" />
        {/* bola de natal */}
        <rect x="52" y="30" width="16" height="10" rx="3" fill="#B08A3E" stroke="#6E5522" strokeWidth="2" />
        <circle cx="60" cy="78" r="38" fill="#D63B3B" stroke="#7A1F1F" strokeWidth="3" />
        <path d="M27 70 A38 38 0 0 1 93 70" fill="none" stroke="#F0C96B" strokeWidth="6" strokeLinecap="round" />
        <circle cx="60" cy="78" r="38" fill="none" stroke="#F0C96B" strokeWidth="2" strokeDasharray="3 6" />
        {/* folhas de azevinho */}
        <path d="M18 108 Q4 96 14 82 Q26 90 24 104 Q22 112 18 108 Z" fill="#2E7D4F" stroke="#184F2C" strokeWidth="2" />
        <path d="M34 118 Q20 110 24 94 Q38 98 40 112 Q40 120 34 118 Z" fill="#2E7D4F" stroke="#184F2C" strokeWidth="2" />
        <circle cx="16" cy="112" r="5" fill="#A3273A" stroke="#6E1424" strokeWidth="1.5" />
        <circle cx="28" cy="120" r="5" fill="#A3273A" stroke="#6E1424" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
