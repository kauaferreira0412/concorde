/**
 * Menções são so' texto (@username dentro do content) - sem tabela nova no backend nem
 * notificação por enquanto. O cliente reconhece "@algumUsername" comparando com os membros
 * do servidor e destaca visualmente, inclusive quando é você mesmo (ver ChatWindow.jsx).
 */

/** Acha o "@parcial" sendo digitado bem antes do cursor, se houver (pra abrir o autocomplete). */
export function getMentionQuery(text, caret) {
  const upToCaret = text.slice(0, caret);
  const match = upToCaret.match(/(?:^|\s)@(\w*)$/);
  return match ? match[1] : null;
}

/** Substitui o "@parcial" que estava sendo digitado pelo username escolhido + espaço. */
export function applyMention(text, caret, username) {
  const upToCaret = text.slice(0, caret);
  const replaced = upToCaret.replace(/@(\w*)$/, `@${username} `);
  return { text: replaced + text.slice(caret), caret: replaced.length };
}

/** true se o texto menciona esse username (case-insensitive, @ seguido da palavra toda). */
export function mentionsUser(content, username) {
  if (!content || !username) return false;
  const re = new RegExp(`@${escapeRegExp(username)}\\b`, "i");
  return re.test(content);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
