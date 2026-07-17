// Tiny TypeScript-ish highlighter for docs code blocks authored as plain text.
// Blocks opt in with `data-hl`; older blocks keep their hand-authored spans.
// Palette matches the hand-authored one: tk-d keywords/decorators · tk-s strings
// · tk-m comments.

const KEYWORDS =
  "import|from|export|class|extends|implements|const|let|var|function|return|await|async|new|this|if|else|throw|true|false|null|undefined|typeof|interface|type";

const TOKEN = new RegExp(
  [
    String.raw`(\/\/[^\n]*)`, // 1 comment
    String.raw`("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\]|\\.)*\`)`, // 2 string
    String.raw`(@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)`, // 3 decorator
    String.raw`\b(${KEYWORDS})\b`, // 4 keyword
  ].join("|"),
  "g",
);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function highlight(source: string): string {
  let out = "";
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    out += escapeHtml(source.slice(last, idx));
    const [full, comment, str, deco, kw] = m;
    if (comment) out += `<span class="tk-m">${escapeHtml(comment)}</span>`;
    else if (str) out += `<span class="tk-s">${escapeHtml(str)}</span>`;
    else if (deco || kw) out += `<span class="tk-d">${escapeHtml(full)}</span>`;
    else out += escapeHtml(full);
    last = idx + full.length;
  }
  out += escapeHtml(source.slice(last));
  return out;
}

/** Highlight every `pre.code[data-hl] > code` block on the page. */
export function highlightAll(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("pre.code[data-hl] > code").forEach((code) => {
    code.innerHTML = highlight(code.textContent ?? "");
  });
}
