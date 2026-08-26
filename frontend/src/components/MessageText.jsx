import { parseMarkdownBlocks, renderInline } from "../utils/markdown.jsx";

/** Renderiza o conteudo da mensagem com markdown "estilo Discord" (negrito/italico/sublinhado/
 *  tachado/codigo/citacao/listas/titulos/links, ver utils/markdown.jsx) + @mencoes clicaveis
 *  (mesmo pipeline - so' reconhece quem e' de verdade membro do servidor). Extraido de
 *  ChatWindow.jsx pra ser reaproveitado tambem no chat privado (ver DmChatWindow.jsx) - o
 *  markdown/emoji customizado funciona igual nos dois, so' que DM nunca tem "members"/
 *  "memberUsernames" (nao existe @mencao numa conversa 1:1, so' faz sentido em servidor).
 */
export default function MessageText({ content, memberUsernames, myUsername, members, openProfile, customEmojis }) {
  if (!content) return null;
  const ctx = { memberUsernames, myUsername, members, openProfile, customEmojis };
  return (
    <div className="chat-markdown">
      {parseMarkdownBlocks(content).map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "code":
            return (
              <pre key={key} className="chat-code-block">
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={key} className="chat-blockquote">
                {renderInline(block.text, ctx, key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, ctx, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item, ctx, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "h1":
          case "h2":
          case "h3": {
            const Tag = block.type;
            return (
              <Tag key={key} className="chat-heading">
                {renderInline(block.text, ctx, key)}
              </Tag>
            );
          }
          default:
            return <p key={key}>{renderInline(block.text, ctx, key)}</p>;
        }
      })}
    </div>
  );
}
