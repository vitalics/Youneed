// Critical-CSS extractor for compiled Tailwind. Given the full CSS once, it
// builds an index so SSR can inline ONLY the utilities a given shadow root uses
// (plus the always-needed prerequisites), instead of the whole sheet. No <link>,
// no FOUC, no duplicating unused rules across shadow roots.

interface ClassRule {
  classes: Set<string>;
  css: string;
}
interface MediaBlock {
  head: string; // e.g. "@media (min-width:640px)"
  always: string[];
  rules: ClassRule[];
}

/** Split CSS into top-level constructs (brace-aware): rules, @media{…}, etc. */
function topLevel(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (--depth === 0) {
        out.push(css.slice(start, i + 1));
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      out.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  const tail = css.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

const STOP = new Set([":", ".", "#", ">", "+", "~", ",", "(", ")", "[", "]", " ", "\t", "\n"]);

/** Extract the HTML class names a selector targets (un-escaping Tailwind's `\:`,
 *  `\/`, `\[`, …). `.hover\:bg-primary:hover` → ["hover:bg-primary"]. */
function selectorClasses(sel: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] !== "." || sel[i - 1] === "\\") continue;
    let name = "";
    let j = i + 1;
    while (j < sel.length) {
      const ch = sel[j];
      if (ch === "\\") {
        name += sel[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (STOP.has(ch)) break;
      name += ch;
      j++;
    }
    if (name) out.push(name);
    i = j - 1;
  }
  return out;
}

const headOf = (rule: string): string => {
  const i = rule.indexOf("{");
  return (i === -1 ? rule : rule.slice(0, i)).trim();
};
const bodyOf = (rule: string): string => rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));

// At-rules that are global prerequisites (always kept) vs. conditional groups.
const ALWAYS_AT = /^@(keyframes|property|font-face|page|charset|import|namespace)\b/;
const GROUP_AT = /^@(media|supports|container|layer)\b/;

/**
 * Build a `(usedClasses) => css` function: returns the prerequisites plus only
 * the rules whose selector targets a used class.
 */
export function buildCriticalCss(css: string): (used: Set<string>) => string {
  const always: string[] = [];
  const rules: ClassRule[] = [];
  const media: MediaBlock[] = [];

  const classify = (segments: string[], sink: { always: string[]; rules: ClassRule[] }) => {
    for (const rule of segments) {
      if (!rule.includes("{")) {
        sink.always.push(rule);
        continue;
      }
      const head = headOf(rule);
      if (ALWAYS_AT.test(head)) {
        sink.always.push(rule);
        continue;
      }
      const classes = selectorClasses(head);
      if (classes.length === 0) sink.always.push(rule); // :root/:host vars, base reset
      else sink.rules.push({ classes: new Set(classes), css: rule });
    }
  };

  for (const rule of topLevel(css)) {
    const head = headOf(rule);
    if (rule.includes("{") && GROUP_AT.test(head)) {
      const block: MediaBlock = { head, always: [], rules: [] };
      classify(topLevel(bodyOf(rule)), block);
      media.push(block);
    } else {
      classify([rule], { always, rules });
    }
  }

  const matches = (cr: ClassRule, used: Set<string>) => {
    for (const c of cr.classes) if (used.has(c)) return true;
    return false;
  };

  return (used) => {
    let out = always.join("");
    for (const cr of rules) if (matches(cr, used)) out += cr.css;
    for (const m of media) {
      let inner = m.always.join("");
      for (const cr of m.rules) if (matches(cr, used)) inner += cr.css;
      if (inner) out += `${m.head}{${inner}}`;
    }
    return out;
  };
}
