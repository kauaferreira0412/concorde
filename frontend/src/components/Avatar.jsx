export default function Avatar({ name, url, className = "voice-avatar" }) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  if (url) {
    return <img src={url} alt={name || "avatar"} className={className} />;
  }
  return <span className={className}>{initials}</span>;
}
