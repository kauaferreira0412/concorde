/**
 * Markdown "estilo Discord" pras mensagens do chat - so' o subconjunto comum (negrito, italico,
 * sublinhado, tachado, codigo, blocos de codigo, citacao, listas, titulos, links) - nao e' um
 * CommonMark completo de proposito, e' so' o que faz sentido numa mensagem de chat curta.
 *
 * SEMPRE renderiza pra nos React (nunca HTML cru/dangerouslySetInnerHTML) - o texto de um
 * participante nunca vira HTML de verdade, so' elementos React comuns, que o proprio React ja
 * escapa. Isso e' o que torna isso seguro contra XSS sem precisar de nenhuma biblioteca de
 * sanitizacao por cima.
 */

/** Quebra o conteudo em blocos (paragrafo, lista, citacao, bloco de codigo, titulo). */
export function parseMarkdownBlocks(content) {
  const lines = (content || "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // pula o ``` de fechamento (se existir - mensagem pode ter esquecido de fechar)
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "h" + heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: quoteLines.join("\n") });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragrafo: junta linhas seguidas ate' bater numa linha em branco ou num bloco especial.
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^```|^#{1,3}\s|^>\s?|^[-*]\s+|^\d+\.\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join("\n") });
  }
  return blocks;
}

// Uma unica regex com alternativas (grupos nomeados) pra achar o PROXIMO token inline, da
// esquerda pra direita - ordem importa (code antes de bold, etc) pra nao um "engolir" o outro.
const INLINE_RE =
  /`(?<code>[^`\n]+)`|\*\*(?<bold>[^*\n]+)\*\*|__(?<underline>[^_\n]+)__|~~(?<strike>[^~\n]+)~~|\*(?<italic1>[^*\n]+)\*|_(?<italic2>[^_\n]+)_|\[(?<linktext>[^\]\n]+)\]\((?<linkurl>https?:\/\/[^\s)]+)\)|(?<autolink>https?:\/\/[^\s<]+)|@(?<mention>\w+)/g;

/**
 * Formatacao inline (dentro de um paragrafo/item de lista/citacao) - negrito, italico,
 * sublinhado, tachado, codigo, links e @mencoes, tudo na mesma passada. `\n` simples vira
 * quebra de linha (<br/>).
 */
export function renderInline(text, { memberUsernames = [], myUsername, members = [], openProfile } = {}, keyPrefix = "") {
  const knownMembers = new Set(memberUsernames.map((u) => u.toLowerCase()));
  const lines = (text || "").split("\n");
  const out = [];

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) out.push(<br key={`${keyPrefix}-br-${lineIdx}`} />);

    let lastIndex = 0;
    let match;
    let tokenIdx = 0;
    INLINE_RE.lastIndex = 0;
    while ((match = INLINE_RE.exec(line))) {
      if (match.index > lastIndex) out.push(line.slice(lastIndex, match.index));
      const key = `${keyPrefix}-${lineIdx}-${tokenIdx++}`;
      const g = match.groups;
      if (g.code) out.push(<code key={key} className="chat-inline-code">{g.code}</code>);
      else if (g.bold) out.push(<strong key={key}>{renderInline(g.bold, { memberUsernames, myUsername, members, openProfile }, key)}</strong>);
      else if (g.underline) out.push(<u key={key}>{renderInline(g.underline, { memberUsernames, myUsername, members, openProfile }, key)}</u>);
      else if (g.strike) out.push(<s key={key}>{renderInline(g.strike, { memberUsernames, myUsername, members, openProfile }, key)}</s>);
      else if (g.italic1 || g.italic2) out.push(<em key={key}>{g.italic1 || g.italic2}</em>);
      else if (g.linktext) {
        out.push(
          <a key={key} href={g.linkurl} target="_blank" rel="noreferrer noopener">
            {g.linktext}
          </a>
        );
      } else if (g.autolink) {
        out.push(
          <a key={key} href={g.autolink} target="_blank" rel="noreferrer noopener">
            {g.autolink}
          </a>
        );
      } else if (g.mention) {
        const isKnown = knownMembers.has(g.mention.toLowerCase());
        if (!isKnown) {
          out.push(`@${g.mention}`);
        } else {
          const mentionedMember = members.find((m) => m.username.toLowerCase() === g.mention.toLowerCase());
          out.push(
            <button
              key={key}
              type="button"
              className={"chat-mention" + (g.mention.toLowerCase() === myUsername?.toLowerCase() ? " me" : "")}
              onClick={() => mentionedMember && openProfile?.(mentionedMember.userId)}
              disabled={!mentionedMember}
            >
              @{g.mention}
            </button>
          );
        }
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) out.push(line.slice(lastIndex));
  });

  return out;
}
