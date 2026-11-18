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
