function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isNewDay(prev, current) {
  if (!current?.createdAt) return false;
  if (!prev?.createdAt) return true;
  return startOfDay(prev.createdAt) !== startOfDay(current.createdAt);
}

const GROUP_WINDOW_MS = 7 * 60 * 1000;

/** Mensagem seguida do mesmo autor (mesmo dia, até 7 min depois, sem ser resposta): esconde avatar e nome. */
export function isGroupedWith(prev, current) {
  if (!prev || !current || prev.authorId !== current.authorId) return false;
  if (current.replyToId || isNewDay(prev, current)) return false;
  return new Date(current.createdAt) - new Date(prev.createdAt) < GROUP_WINDOW_MS;
}

function dayLabel(value) {
  const day = startOfDay(value);
  const today = startOfDay(Date.now());
  if (day === today) return "HOJE";
  if (day === today - 86400000) return "ONTEM";
  const d = new Date(value);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
    .replace(/\./g, "")
    .toUpperCase();
}

export default function DaySeparator({ date }) {
  return (
    <div className="chat-day-sep" role="separator">
      <span>{dayLabel(date)}</span>
    </div>
  );
}
