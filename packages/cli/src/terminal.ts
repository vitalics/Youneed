// @youneed/cli — the terminal abstraction (raw keys + writes + size).
//
// Anything interactive — prompts, hotkeys, an alt-screen TUI, a pager — needs
// raw keystrokes and the terminal size, which a line-oriented stdout sink can't
// give. `Terminal` is that surface. `nodeTerminal()` wires it to stdin/stdout
// (raw mode + key decoding); `scriptedTerminal()` is a headless double for tests
// that feeds a canned key sequence and captures writes. It lives in core so
// every TUI package shares one input layer.

/** A decoded keypress. `name` is the logical key; `sequence` the raw bytes. */
export interface Key {
  /** "up"/"down"/"left"/"right"/"return"/"backspace"/"space"/"escape"/"tab", or the character. */
  name: string;
  /** Held Ctrl (e.g. Ctrl-C → `{ name: "c", ctrl: true }`). */
  ctrl?: boolean;
  /** The raw byte sequence that produced this key. */
  sequence: string;
}

/** Raw key capture + raw writes + width/height. */
export interface Terminal {
  /** Visible columns (defaults to 80 when unknown). */
  readonly columns: number;
  /** Visible rows (defaults to 24 when unknown). */
  readonly rows: number;
  /** Write a raw chunk (may contain ANSI control sequences). */
  write(chunk: string): void;
  /** Begin receiving keys; returns a stop function that restores the terminal. */
  capture(onKey: (key: Key) => void): () => void;
  /** Subscribe to resize; returns an unsubscribe fn. */
  onResize?(handler: () => void): () => void;
}

/** Decode a raw input string into the keys it represents. */
export function decodeKeys(input: string): Key[] {
  const keys: Key[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (c === "\x1b") {
      const intro = input[i + 1];
      if (intro === "[" || intro === "O") {
        const code = input[i + 2];
        const arrows: Record<string, string> = { A: "up", B: "down", C: "right", D: "left", H: "home", F: "end" };
        if (code && arrows[code]) {
          keys.push({ name: arrows[code]!, sequence: input.slice(i, i + 3) });
          i += 2;
          continue;
        }
      }
      keys.push({ name: "escape", sequence: "\x1b" });
      continue;
    }
    if (c === "\r" || c === "\n") keys.push({ name: "return", sequence: c });
    else if (c === "\x7f" || c === "\b") keys.push({ name: "backspace", sequence: c });
    else if (c === "\x03") keys.push({ name: "c", ctrl: true, sequence: c });
    else if (c === "\t") keys.push({ name: "tab", sequence: c });
    else if (c === " ") keys.push({ name: "space", sequence: " " });
    else keys.push({ name: c, sequence: c });
  }
  return keys;
}

/** Build a {@link Key} from a logical name (for scripts/tests). */
export function key(name: string): Key {
  switch (name) {
    case "up":
    case "down":
    case "left":
    case "right":
      return decodeKeys({ up: "\x1b[A", down: "\x1b[B", right: "\x1b[C", left: "\x1b[D" }[name]!)[0]!;
    case "enter":
    case "return":
      return { name: "return", sequence: "\r" };
    case "space":
      return { name: "space", sequence: " " };
    case "backspace":
      return { name: "backspace", sequence: "\x7f" };
    case "escape":
      return { name: "escape", sequence: "\x1b" };
    case "ctrl-c":
      return { name: "c", ctrl: true, sequence: "\x03" };
    default:
      return { name, sequence: name };
  }
}

/** A Node terminal backed by stdin/stdout (raw mode + UTF-8 key decoding). */
export function nodeTerminal(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Terminal {
  return {
    get columns() {
      return output.columns ?? 80;
    },
    get rows() {
      return output.rows ?? 24;
    },
    write: (chunk) => void output.write(chunk),
    capture(onKey) {
      const wasRaw = input.isRaw ?? false;
      input.setRawMode?.(true);
      input.resume();
      const onData = (buf: Buffer | string): void => {
        for (const k of decodeKeys(buf.toString())) onKey(k);
      };
      input.on("data", onData);
      return () => {
        input.off("data", onData);
        input.setRawMode?.(wasRaw);
        input.pause();
      };
    },
    onResize(handler) {
      output.on("resize", handler);
      return () => void output.off("resize", handler);
    },
  };
}

/** A headless terminal for tests: feed keys with `press`, read `output()`. */
export function scriptedTerminal(columns = 80, rows = 24): {
  terminal: Terminal;
  press(...items: Array<Key | string>): void;
  output(): string;
  resize(columns: number, rows: number): void;
} {
  let handler: ((k: Key) => void) | undefined;
  const resizeHandlers = new Set<() => void>();
  const writes: string[] = [];
  let cols = columns;
  let rws = rows;
  const terminal: Terminal = {
    get columns() {
      return cols;
    },
    get rows() {
      return rws;
    },
    write: (chunk) => void writes.push(chunk),
    capture(onKey) {
      handler = onKey;
      return () => {
        handler = undefined;
      };
    },
    onResize(h) {
      resizeHandlers.add(h);
      return () => void resizeHandlers.delete(h);
    },
  };
  const press = (...items: Array<Key | string>): void => {
    for (const item of items) {
      const k = typeof item !== "string" ? item : item.length === 1 ? decodeKeys(item)[0]! : key(item);
      handler?.(k);
    }
  };
  const resize = (c: number, r: number): void => {
    cols = c;
    rws = r;
    resizeHandlers.forEach((h) => h());
  };
  return { terminal, press, output: () => writes.join(""), resize };
}
