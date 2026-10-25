// @menções: extração no servidor e realce no texto (sem "server-only": usado nos dois lados).

/** Mesmo formato dos nomes de usuário: 3 a 30 de a-z, 0-9 e _. */
export const MENTION_RE = /(^|[^\w@])@([a-z0-9_]{3,30})\b/gi;

/** Usuários mencionados (minúsculos, sem repetir). */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) found.add(m[2].toLowerCase());
  return [...found].slice(0, 10);
}

/** Quebra o texto em pedaços de texto comum e menções, para virar links na tela. */
export function splitMentions(text: string): ({ type: "text"; value: string } | { type: "mention"; username: string })[] {
  const parts: ({ type: "text"; value: string } | { type: "mention"; username: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    parts.push({ type: "mention", username: m[2].toLowerCase() });
    last = start + m[2].length + 1;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
