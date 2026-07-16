// ── @youneed/cli-plugin-devtools/ext — the RICH (shad) UI for the CLI domain ──
//
// `@youneed/devtools-protocol/extensions` ships a lightweight plain-HTML default
// for every domain. THIS module re-registers the `CLI` domain with shad
// components so a CLI's devtools UI matches the server's unified shell exactly —
// the registry is idempotent by domain (last wins), so importing this AFTER the
// defaults (see `web.ts`) upgrades the UI without touching the protocol. The
// panel is the command/option *builder*: pick a command, fill in args + options,
// watch the assembled command line, then Copy or Run it.
//
// A Run is INTERACTIVE: `<cli-terminal>` streams `CLI.output` live into a small
// VT100 emulator, captures keystrokes (arrows/enter/ctrl-c…) and forwards them as
// raw bytes to the child's stdin (`CLI.input`) — so prompts and menus behave like
// a real terminal — and a Stop button kills the run (`CLI.stop`).
//
// Browser-only — bundled into `dist/web/client.js` (build-web.mjs), never loaded
// in Node. Each panel talks to the `CLI` domain ONLY through the live client.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerExtension, type ExtensionContext, type View } from "@youneed/devtools-protocol/ui";
import { assembleCommand, toArgv, type Catalog, type CatalogCommand, type CommandValues } from "./catalog.ts";

interface OutputEvent {
  stream: "stdout" | "stderr";
  data: string;
}
/** The live CLI-domain bridge handed to the builder (bound to `ctx.client`). */
interface RunIO {
  /** Spawn `argv`; resolves `{ code }` at exit. Output arrives via {@link onOutput}. */
  start(argv: string[]): Promise<{ code: number | null }>;
  /** Subscribe to `CLI.output` chunks; returns an unsubscribe fn. */
  onOutput(cb: (p: OutputEvent) => void): () => void;
  /** Write raw bytes to the running child's stdin. */
  input(data: string): void;
  /** Kill the running child. */
  stop(): void;
}
interface BuilderData {
  catalog: Catalog;
  io: RunIO;
}

const NO_IO: RunIO = { start: async () => ({ code: null }), onOutput: () => () => {}, input: () => {}, stop: () => {} };
const EMPTY: BuilderData = { catalog: { name: "", options: [], commands: [] }, io: NO_IO };

// ── VT100-subset emulator ─────────────────────────────────────────────────────
// The youneed CLI TUIs render through `LiveRenderer` + a small ANSI vocabulary
// (cursor up/down/left/right, CR, erase-line/-display, SGR colours, alt-screen,
// cursor hide/show). Feeding the WHOLE output history to a fresh emulator each
// render reproduces the current screen deterministically — no incremental state.

interface Cell {
  ch: string;
  cls: string;
}
const SGR_FG: Record<number, string> = { 30: "#000", 31: "#e06c75", 32: "#98c379", 33: "#e5c07b", 34: "#61afef", 35: "#c678dd", 36: "#56b6c2", 37: "#abb2bf", 90: "#5c6370", 91: "#e06c75", 92: "#98c379", 93: "#e5c07b", 94: "#61afef", 95: "#c678dd", 96: "#56b6c2", 97: "#fff" };
const SGR_BG: Record<number, string> = { 40: "#000", 41: "#e06c75", 42: "#98c379", 43: "#e5c07b", 44: "#61afef", 45: "#c678dd", 46: "#56b6c2", 47: "#abb2bf" };

interface Style {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
}
function styleKey(s: Style): string {
  const parts: string[] = [];
  if (s.fg) parts.push(`color:${s.fg}`);
  if (s.bg) parts.push(`background:${s.bg}`);
  if (s.bold) parts.push("font-weight:700");
  if (s.dim) parts.push("opacity:.6");
  return parts.join(";");
}

/** Parse the raw ANSI stream into a grid of styled cells. Pure + stateless. */
function emulate(raw: string): Cell[][] {
  const grid: Cell[][] = [];
  let x = 0;
  let y = 0;
  let st: Style = {};
  const blank = (): Cell => ({ ch: " ", cls: "" });
  const rowAt = (r: number): Cell[] => (grid[r] ??= []);
  const put = (ch: string): void => {
    const row = rowAt(y);
    while (row.length < x) row.push(blank());
    row[x] = { ch, cls: styleKey(st) };
    x++;
  };
  const applySgr = (codes: number[]): void => {
    if (codes.length === 0) codes = [0];
    for (const c of codes) {
      if (c === 0) st = {};
      else if (c === 1) st = { ...st, bold: true };
      else if (c === 2) st = { ...st, dim: true };
      else if (c === 22) st = { ...st, bold: false, dim: false };
      else if (c === 39) st = { ...st, fg: undefined };
      else if (c === 49) st = { ...st, bg: undefined };
      else if (SGR_FG[c]) st = { ...st, fg: SGR_FG[c] };
      else if (SGR_BG[c]) st = { ...st, bg: SGR_BG[c] };
    }
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === "\x1b" && raw[i + 1] === "[") {
      // CSI: ESC [ params? intermediate? final
      let j = i + 2;
      let priv = "";
      if (raw[j] === "?") (priv = "?"), j++;
      let params = "";
      while (j < raw.length && /[0-9;]/.test(raw[j]!)) params += raw[j++]!;
      const final = raw[j];
      const nums = params.split(";").filter(Boolean).map(Number);
      const n = nums[0] ?? 0;
      i = j; // consume through the final byte
      if (priv === "?") {
        // ?25 cursor show/hide (ignore); ?1049 alt-screen → clear
        if (n === 1049 && (final === "h" || final === "l")) {
          grid.length = 0;
          x = 0;
          y = 0;
        }
        continue;
      }
      switch (final) {
        case "A": y = Math.max(0, y - (n || 1)); break;
        case "B": y += n || 1; break;
        case "C": x += n || 1; break;
        case "D": x = Math.max(0, x - (n || 1)); break;
        case "G": x = Math.max(0, (n || 1) - 1); break;
        case "H":
        case "f": y = Math.max(0, (nums[0] ?? 1) - 1); x = Math.max(0, (nums[1] ?? 1) - 1); break;
        case "K": {
          const row = rowAt(y);
          if (n === 0 || Number.isNaN(n)) row.length = x; // x..end
          else if (n === 1) for (let k = 0; k <= x && k < row.length; k++) row[k] = blank();
          else if (n === 2) row.length = 0; // whole line
          break;
        }
        case "J":
          if (n === 2 || n === 3) { grid.length = 0; x = 0; y = 0; }
          else grid.length = y + 1; // 0: cursor..end
          break;
        case "m": applySgr(nums); break;
        default: break;
      }
      continue;
    }
    if (ch === "\n") { y++; x = 0; continue; }
    if (ch === "\r") { x = 0; continue; }
    if (ch === "\x07") continue; // bell
    if (ch === "\x1b") continue; // lone ESC / unsupported
    put(ch);
  }
  return grid;
}

// ── the terminal display + keystroke capture ─────────────────────────────────

/** Map a browser `keydown` to the raw bytes a Node terminal expects. */
function keyToBytes(e: KeyboardEvent): string | null {
  if (e.ctrlKey && e.key.toLowerCase() === "c") return "\x03";
  switch (e.key) {
    case "ArrowUp": return "\x1b[A";
    case "ArrowDown": return "\x1b[B";
    case "ArrowRight": return "\x1b[C";
    case "ArrowLeft": return "\x1b[D";
    case "Enter": return "\r";
    case "Backspace": return "\x7f";
    case "Tab": return "\t";
    case "Escape": return "\x1b";
    case " ": return " ";
    default: return e.key.length === 1 ? e.key : null;
  }
}

@Component.define()
export class CliTerminal extends Component("cli-terminal") {
  static styles = [
    css`
      :host { display: block; }
      .screen {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.4;
        white-space: pre;
        background: #1e2127;
        color: #abb2bf;
        padding: 0.6rem 0.75rem;
        border-radius: 0.5rem;
        min-height: 8rem;
        max-height: 24rem;
        overflow: auto;
        outline: none;
        cursor: text;
      }
      .screen:focus { box-shadow: 0 0 0 2px hsl(var(--ring, 215 20% 65%)); }
    `,
  ];

  /** `{ raw }` — the whole accumulated output stream (one object: avoids the
   *  camelCase prop-binding gotcha). */
  @Component.prop() data: { raw: string } = { raw: "" };

  #onKey(e: KeyboardEvent): void {
    const bytes = keyToBytes(e);
    if (bytes == null) return;
    e.preventDefault();
    this.dispatchEvent(new CustomEvent("terminal-input", { detail: bytes, bubbles: true, composed: true }));
  }

  override render() {
    const grid = emulate(this.data.raw ?? "");
    return html`
      <div class="screen" tabindex="0" @keydown=${(e: KeyboardEvent) => this.#onKey(e)}>
        ${grid.length === 0
          ? html`<span style="opacity:.4">waiting for output… (click here, then type to interact)</span>`
          : grid.map((row, idx) => html`${this.#row(row)}${idx < grid.length - 1 ? "\n" : ""}`)}
      </div>
    `;
  }

  #row(cells: Cell[]): View {
    // Coalesce adjacent cells with the same style into one styled span.
    const spans: Array<{ cls: string; text: string }> = [];
    for (const c of cells) {
      const last = spans[spans.length - 1];
      if (last && last.cls === c.cls) last.text += c.ch;
      else spans.push({ cls: c.cls, text: c.ch });
    }
    return html`${spans.map((s) => (s.cls ? html`<span style=${s.cls}>${s.text}</span>` : html`${s.text}`))}`;
  }
}

// ── the command builder ───────────────────────────────────────────────────────

/** The interactive command builder — a self-contained component so its form state
 *  (selection, field values, run output) survives the shell's panel re-renders. */
@Component.define()
export class CliBuilder extends Component("cli-builder") {
  static styles = [
    css`
      :host {
        display: block;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    `,
  ];

  @Component.prop() data: BuilderData = EMPTY;

  #selected = this.signal<CatalogCommand | null>(null);
  #values = this.signal<CommandValues>({ args: {}, options: {} });
  #raw = this.signal<string>("");
  #copied = this.signal(false);
  #running = this.signal(false);
  #offOutput: (() => void) | undefined;

  #select(cmd: CatalogCommand): void {
    this.#selected.value = cmd;
    this.#values.value = { args: {}, options: {} };
    this.#raw.value = "";
  }
  #setArg(name: string, value: string): void {
    const cur = this.#values.value;
    this.#values.value = { ...cur, args: { ...cur.args, [name]: value } };
  }
  #setOpt(key: string, value: string | boolean): void {
    const cur = this.#values.value;
    this.#values.value = { ...cur, options: { ...cur.options, [key]: value } };
  }
  /** Merge the program-global options (e.g. `--help`/`--version` from
   *  `defaultOptions()`) into a command's own, deduped by key (the command's own
   *  win). So every command can select the global flags, exactly once. */
  #effective(cmd: CatalogCommand): CatalogCommand {
    const own = new Set(cmd.options.map((o) => o.key));
    const globals = (this.data.catalog.options ?? []).filter((o) => !own.has(o.key));
    return globals.length ? { ...cmd, options: [...cmd.options, ...globals] } : cmd;
  }
  get #line(): string {
    const cmd = this.#selected.value;
    return cmd ? assembleCommand(this.data.catalog.name, this.#effective(cmd), this.#values.value) : "";
  }
  async #copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.#line);
      this.#copied.value = true;
      setTimeout(() => (this.#copied.value = false), 1200);
    } catch {
      /* clipboard blocked — no-op */
    }
  }
  async #run(): Promise<void> {
    const cmd = this.#selected.value;
    if (!cmd || this.#running.value) return;
    this.#running.value = true;
    this.#raw.value = "";
    this.#offOutput?.();
    this.#offOutput = this.data.io.onOutput((p) => (this.#raw.value += p.data));
    try {
      const r = await this.data.io.start(toArgv(this.#effective(cmd), this.#values.value));
      this.#raw.value += `\n\x1b[2m[exit ${r.code}]\x1b[22m\n`;
    } catch (e) {
      this.#raw.value += `\n\x1b[31merror: ${String((e as Error)?.message ?? e)}\x1b[39m\n`;
    } finally {
      this.#offOutput?.();
      this.#offOutput = undefined;
      this.#running.value = false;
    }
  }
  #stop(): void {
    this.data.io.stop();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback?.();
    this.#offOutput?.();
    if (this.#running.value) this.data.io.stop();
  }

  override render() {
    const cat = this.data.catalog;
    const sel = this.#selected.value;
    return html`
      <div style="display:grid;grid-template-columns:220px 1fr;gap:1rem;align-items:start">
        <shad-card style="display:block;padding:.5rem">
          <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;opacity:.5;padding:.25rem .5rem">Commands</div>
          ${cat.commands.map(
            (c) => html`
              <shad-button
                variant=${sel?.name === c.name ? "secondary" : "ghost"}
                size="sm"
                style="display:block;width:100%;margin:2px 0;justify-content:flex-start"
                @click=${() => this.#select(c)}
                >${c.name}</shad-button
              >
            `,
          )}
        </shad-card>
        ${sel ? this.#panel(sel) : html`<div style="opacity:.5;padding:2rem">Select a command to build it.</div>`}
      </div>
    `;
  }

  #panel(cmd: CatalogCommand): View {
    const v = this.#values.value;
    const req = (on: boolean): View => (on ? html`<span style="color:hsl(var(--destructive))"> *</span>` : html``);
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="margin-bottom:.25rem"><strong><code>${this.data.catalog.name} ${cmd.name}</code></strong></div>
        ${cmd.description ? html`<p style="opacity:.6;margin:.25rem 0 .75rem">${cmd.description}</p>` : html``}
        ${cmd.middleware.length
          ? html`<div style="margin-bottom:.5rem;display:flex;gap:.25rem;flex-wrap:wrap">${cmd.middleware.map((m) => html`<shad-badge variant="outline">${m}</shad-badge>`)}</div>`
          : html``}
        ${repeat(
          cmd.args,
          (a) => `arg:${a.name}`,
          (a) => html`
            <div style="margin:.5rem 0">
              <label style="display:block;opacity:.8;margin-bottom:.25rem;font-size:.85rem"
                >${a.name}${req(a.required)}${a.variadic ? html`<span style="opacity:.5"> (variadic, space-separated)</span>` : html``}</label
              >
              <shad-input .value=${v.args[a.name] ?? ""} @input=${(e: Event) => this.#setArg(a.name, (e.target as HTMLInputElement).value)}></shad-input>
            </div>
          `,
        )}
        ${repeat(
          this.#effective(cmd).options,
          (o) => `opt:${o.key}`,
          (o) =>
            o.takesValue
              ? html`
                  <div style="margin:.5rem 0">
                    <label style="display:block;opacity:.8;margin-bottom:.25rem;font-size:.85rem"
                      ><code>${o.flags}</code>${req(o.required)}${o.description ? html`<span style="opacity:.5"> — ${o.description}</span>` : html``}</label
                    >
                    <shad-input
                      placeholder=${o.default != null ? String(o.default) : ""}
                      .value=${typeof v.options[o.key] === "string" ? (v.options[o.key] as string) : ""}
                      @input=${(e: Event) => this.#setOpt(o.key, (e.target as HTMLInputElement).value)}
                    ></shad-input>
                  </div>
                `
              : html`
                  <label style="display:flex;gap:.5rem;align-items:center;margin:.5rem 0;cursor:pointer">
                    <shad-checkbox .checked=${v.options[o.key] === true} @change=${(e: Event) => this.#setOpt(o.key, (e.target as { checked?: boolean }).checked === true)}></shad-checkbox>
                    <span><code>${o.flags}</code>${o.description ? html`<span style="opacity:.5"> — ${o.description}</span>` : html``}</span>
                  </label>
                `,
        )}
        <shad-separator style="margin:.75rem 0"></shad-separator>
        <code style="display:block;padding:.75rem;border-radius:.5rem;background:hsl(var(--muted));color:hsl(var(--primary));white-space:pre-wrap;word-break:break-all">${this.#line}</code>
        <div style="display:flex;gap:.5rem;margin-top:.75rem">
          <shad-button size="sm" variant="outline" @click=${() => this.#copy()}>${this.#copied.value ? "Copied!" : "Copy"}</shad-button>
          <shad-button size="sm" .disabled=${this.#running.value} @click=${() => this.#run()}>${this.#running.value ? "Running…" : "Run"}</shad-button>
          ${this.#running.value ? html`<shad-button size="sm" variant="destructive" @click=${() => this.#stop()}>Stop</shad-button>` : html``}
        </div>
        ${this.#raw.value !== "" || this.#running.value
          ? html`<div style="margin-top:.75rem"><cli-terminal .data=${{ raw: this.#raw.value }} @terminal-input=${(e: Event) => this.data.io.input((e as CustomEvent<string>).detail)}></cli-terminal></div>`
          : html``}
      </shad-card>
    `;
  }
}

// Replace the protocol's default plain-HTML CLI panel with the shad builder.
registerExtension({
  domain: "CLI",
  label: "CLI",
  order: 40,
  async panel(ctx: ExtensionContext): Promise<View> {
    const catalog = await ctx.client.command<Catalog>("CLI.getCatalog");
    const io: RunIO = {
      start: (argv) => ctx.client.command<{ code: number | null }>("CLI.start", { argv }),
      onOutput: (cb) => ctx.client.on("CLI.output", (p) => cb(p as OutputEvent)),
      input: (data) => void ctx.client.command("CLI.input", { data }),
      stop: () => void ctx.client.command("CLI.stop"),
    };
    return html`<cli-builder .data=${{ catalog, io }}></cli-builder>`;
  },
});
