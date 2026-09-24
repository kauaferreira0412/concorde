export function getMentionQuery(text, caret) {
  const upToCaret = text.slice(0, caret);
  const match = upToCaret.match(/(?:^|\s)@(\w*)$/);
  return match ? match[1] : null;
}

export function applyMention(text, caret, username) {
  const upToCaret = text.slice(0, caret);
  const replaced = upToCaret.replace(/@(\w*)$/, `@${username} `);
  return { text: replaced + text.slice(caret), caret: replaced.length };
}

export function mentionsUser(content, username) {
  if (!content || !username) return false;
  const re = new RegExp(`@${escapeRegExp(username)}\\b`, "i");
  return re.test(content);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
