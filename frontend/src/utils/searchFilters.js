// Filtros da busca de mensagens, no estilo do Discord:
//   de:fulano   tem:imagem|arquivo|link|gif   antes:2025-05-01   depois:01/05/2025
// O resto do texto é buscado normalmente.

export const HAS_KINDS = ["imagem", "arquivo", "link", "gif"];

const TOKEN_RE = /(^|\s)(de|tem|antes|depois):(\S*)/gi;

function toIsoDay(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return null;
}

/**
 * people: [{ userId, username, nickname }] — quem pode ser usado no "de:".
 * Devolve { params, chips, errors, empty }.
 */
export function parseSearch(query, people = [], meId = null) {
  const errors = [];
  const chips = [];
  const params = {};
  const has = new Set();
  const text = query.replace(TOKEN_RE, (full, lead, key, rawValue) => {
    const k = key.toLowerCase();
    const value = rawValue.trim();
    if (!value) return lead;
    if (k === "de") {
      const v = value.replace(/^@/, "").toLowerCase();
      const person =
        v === "eu" && meId != null
          ? people.find((p) => String(p.userId) === String(meId))
          : people.find((p) => p.username?.toLowerCase() === v || p.nickname?.toLowerCase() === v) ||
            people.find((p) => p.username?.toLowerCase().startsWith(v) || p.nickname?.toLowerCase().startsWith(v));
      if (person) {
        params.authorId = person.userId;
        chips.push({ key: "de", label: `de: ${person.nickname || person.username}` });
      } else errors.push(`Ninguém chamado "${value}" aqui`);
    } else if (k === "tem") {
      const v = value.toLowerCase();
      const kind = HAS_KINDS.find((h) => h.startsWith(v));
      if (kind) {
        has.add(kind);
        chips.push({ key: `tem-${kind}`, label: `tem: ${kind}` });
      } else errors.push(`"tem:" aceita ${HAS_KINDS.join(", ")}`);
    } else {
      const day = toIsoDay(value);
      if (day) {
        params[k === "antes" ? "before" : "after"] = day;
        chips.push({ key: k, label: `${k}: ${value}` });
      } else errors.push(`Data inválida em ${k}: (use 2025-05-01 ou 01/05/2025)`);
    }
    return lead;
  });
  if (has.size) params.has = [...has].join(",");
  const q = text.replace(/\s+/g, " ").trim();
  if (q) params.q = q;
  return { params, chips, errors, empty: Object.keys(params).length === 0 };
}

export const FILTER_HINTS = [
  { insert: "de:", label: "de:", hint: "mensagens de alguém" },
  { insert: "tem:imagem ", label: "tem:imagem", hint: "com imagem" },
  { insert: "tem:arquivo ", label: "tem:arquivo", hint: "com arquivo" },
  { insert: "tem:link ", label: "tem:link", hint: "com link" },
  { insert: "tem:gif ", label: "tem:gif", hint: "com GIF" },
  { insert: "depois:", label: "depois:", hint: "a partir de uma data" },
  { insert: "antes:", label: "antes:", hint: "antes de uma data" },
];
