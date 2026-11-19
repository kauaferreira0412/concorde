import { useEffect, useRef, useState } from "react";

const TONES = ["a", "b", "c"];

/** Tom estável (roxo, menta ou laranja) pra um nome — usado no fundo do avatar e na cor do nome no chat. */
export function toneFor(name) {
  const s = (name || "?").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

export default function Avatar({ name, url, className = "voice-avatar" }) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  if (url) {
    return <img src={url} alt={name || "avatar"} className={className} data-tone={toneFor(name)} />;
  }
  return (
    <span className={className} data-tone={toneFor(name)}>
      {initials}
    </span>
  );
}

/**
 * Avatar que pode ficar parado: com animate=false mostra só o primeiro quadro do GIF (desenhado num canvas);
 * com animate=true volta a ser a imagem normal, animando.
 */
export function FreezableAvatar({ name, url, className = "voice-avatar", animate = true }) {
  const canvasRef = useRef(null);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    setFrameReady(false);
    if (!url || animate) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!alive || !canvas) return;
      const side = Math.min(img.naturalWidth, img.naturalHeight) || 1;
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      // recorte quadrado central, igual ao object-fit: cover da imagem
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, side, side);
      setFrameReady(true);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url, animate]);

  if (!url || animate) return <Avatar name={name} url={url} className={className} />;
  return (
    <>
      <canvas
        ref={canvasRef}
        className={className + " avatar-frozen"}
        data-tone={toneFor(name)}
        role="img"
        aria-label={name || "avatar"}
        style={frameReady ? undefined : { display: "none" }}
      />
      {!frameReady && (
        <span className={className} data-tone={toneFor(name)}>
          {(name || "?").slice(0, 2).toUpperCase()}
        </span>
      )}
    </>
  );
}
