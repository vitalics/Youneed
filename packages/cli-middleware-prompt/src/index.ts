// @youneed/cli-middleware-prompt — interactive prompts for @youneed/cli.
//
//   class Setup extends Command("setup", { middleware: [prompts()] }) {
//     async execute() {
//       const name = await this.prompt.ask("Project name?", { default: "app" });
//       const env = await this.prompt.choice("Environment", ["dev", "staging", "prod"]);
//       const feats = await this.prompt.list("Features", ["ts", "lint", "tests"]);
//       if (await this.prompt.confirm(`Create ${name}?`)) await this.prompt.alert("Done!");
//     }
//   }
//
// Each prompt takes over the terminal (raw keys), draws with the core
// LiveRenderer (so updates patch in place), and resolves with the answer.
// `ask` (text), `confirm` (y/n), `choice` (single-select), `list` (multi-select)
// and `alert` (acknowledge) cover the common TUI building blocks. All accept a
// `terminal` for testing via `scriptedTerminal()`.

import {
  contribute,
  LiveRenderer,
  alert as alertView,
  input as inputView,
  select as selectView,
  spinner as spinnerView,
  type ChoiceItem,
  type CliMiddleware,
  type ItemFormatter,
} from "@youneed/cli";
import { nodeTerminal, type Key, type Terminal } from "./terminal.ts";

export { nodeTerminal, scriptedTerminal, decodeKeys, key, type Key, type Terminal } from "./terminal.ts";
// The presentational primitives live in core; re-export the ones prompts use.
export { box, type BoxOptions, type ChoiceItem, type ItemFormatter, type ItemState } from "@youneed/cli";

// Minimal styling for the confirm prompt (the others render via core elements).
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[39m`;

/** Shared options: which terminal to drive (defaults to the real one). */
export interface PromptOptions {
  terminal?: Terminal;
}
export interface AskOptions extends PromptOptions {
  default?: string;
  /** Frame the input in a box; a string sets the box title (default: the message). */
  box?: boolean | string;
}
export interface ConfirmOptions extends PromptOptions {
  default?: boolean;
}

export interface SelectOptions extends PromptOptions {
  initial?: number;
  /** Custom per-row renderer — the hook for a bespoke list look (see core `select`). */
  format?: ItemFormatter;
}

export interface SpinnerOptions extends PromptOptions {
  /** Animation frames (default: braille dots). */
  frames?: string[];
  /** Frame interval in ms (default 80). */
  interval?: number;
}
export interface AlertOptions extends PromptOptions {}

class Cancelled extends Error {
  constructor() {
    super("prompt cancelled");
    this.name = "PromptCancelled";
  }
}

function normalize<T>(items: ReadonlyArray<ChoiceItem<T> | string>): ChoiceItem<T>[] {
  return items.map((it) => (typeof it === "string" ? { label: it, value: it as unknown as T } : it));
}

/** Run an interactive loop: draw, handle keys, resolve/reject. */
function interact<T>(
  terminal: Terminal,
  draw: (live: LiveRenderer) => void,
  onKey: (key: Key, done: (value: T) => void, cancel: () => void) => void,
): Promise<T> {
  const live = new LiveRenderer((chunk) => terminal.write(chunk));
  return new Promise<T>((resolve, reject) => {
    draw(live);
    let stop = (): void => {};
    const done = (value: T): void => {
      stop();
      resolve(value);
    };
    const cancel = (): void => {
      stop();
      reject(new Cancelled());
    };
    stop = terminal.capture((k) => {
      if (k.ctrl && k.name === "c") return cancel();
      onKey(k, done, cancel);
    });
  });
}

/** Free-text input. Resolves with the typed string (or the default). */
export function ask(message: string, opts: AskOptions = {}): Promise<string> {
  const terminal = opts.terminal ?? nodeTerminal();
  let value = opts.default ?? "";
  const frame = (done = false): string => inputView({ message, value, box: opts.box, done });
  let redraw = (_done?: boolean): void => {};
  return interact<string>(
    terminal,
    (live) => {
      redraw = (done) => live.draw(frame(done));
      redraw(); // paint the initial frame immediately, before any key
    },
    (k, done) => {
      if (k.name === "return") {
        redraw(true);
        done(value);
      } else if (k.name === "backspace") {
        value = value.slice(0, -1);
        redraw();
      } else if (k.sequence.length === 1 && !k.ctrl && k.sequence >= " ") {
        value += k.sequence;
        redraw();
      }
    },
  );
}

/** Yes/no question. Resolves to a boolean. */
export function confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const terminal = opts.terminal ?? nodeTerminal();
  const def = opts.default ?? false;
  const frame = (done: boolean, answer?: boolean): string =>
    `${done ? green("✓") : cyan("?")} ${message} ${dim(def ? "(Y/n)" : "(y/N)")}${
      done ? " " + (answer ? "yes" : "no") : ""
    }`;
  let redraw = (_done: boolean, _a?: boolean): void => {};
  return interact<boolean>(
    terminal,
    (live) => {
      redraw = (done, a) => live.draw(frame(done, a));
      redraw(false);
    },
    (k, done) => {
      const answer = k.name === "y" ? true : k.name === "n" ? false : k.name === "return" ? def : undefined;
      if (answer !== undefined) {
        redraw(true, answer);
        done(answer);
      }
    },
  );
}

/** Single-select. Arrow keys move, Enter selects. */
export function choice(message: string, items: readonly string[], opts?: SelectOptions): Promise<string>;
export function choice<T>(message: string, items: readonly ChoiceItem<T>[], opts?: SelectOptions): Promise<T>;
export function choice<T>(
  message: string,
  items: ReadonlyArray<ChoiceItem<T> | string>,
  opts: SelectOptions = {},
): Promise<T> {
  const terminal = opts.terminal ?? nodeTerminal();
  const list = normalize<T>(items);
  let index = Math.min(Math.max(opts.initial ?? 0, 0), list.length - 1);
  const frame = (done: boolean): string =>
    selectView({ message, items: list as ChoiceItem<unknown>[], cursor: index, format: opts.format, done });
  let redraw = (_done: boolean): void => {};
  return interact<T>(
    terminal,
    (live) => {
      redraw = (done) => live.draw(frame(done));
      redraw(false);
    },
    (k, done) => {
      if (k.name === "up") index = (index - 1 + list.length) % list.length;
      else if (k.name === "down") index = (index + 1) % list.length;
      else if (k.name === "return") return void (redraw(true), done(list[index]!.value));
      redraw(false);
    },
  );
}

/** Multi-select. Arrow keys move, Space toggles, Enter confirms. */
export function list(message: string, items: readonly string[], opts?: SelectOptions): Promise<string[]>;
export function list<T>(message: string, items: readonly ChoiceItem<T>[], opts?: SelectOptions): Promise<T[]>;
export function list<T>(
  message: string,
  items: ReadonlyArray<ChoiceItem<T> | string>,
  opts: SelectOptions = {},
): Promise<T[]> {
  const terminal = opts.terminal ?? nodeTerminal();
  const choices = normalize<T>(items);
  let index = Math.min(Math.max(opts.initial ?? 0, 0), choices.length - 1);
  const picked = new Set<number>();
  const frame = (done: boolean): string =>
    selectView({
      message,
      items: choices as ChoiceItem<unknown>[],
      cursor: index,
      selected: picked,
      format: opts.format,
      done,
    });
  let redraw = (_done: boolean): void => {};
  return interact<T[]>(
    terminal,
    (live) => {
      redraw = (done) => live.draw(frame(done));
      redraw(false);
    },
    (k, done) => {
      if (k.name === "up") index = (index - 1 + choices.length) % choices.length;
      else if (k.name === "down") index = (index + 1) % choices.length;
      else if (k.name === "space") picked.has(index) ? picked.delete(index) : picked.add(index);
      else if (k.name === "return") {
        redraw(true);
        return done([...picked].sort((a, b) => a - b).map((i) => choices[i]!.value));
      }
      redraw(false);
    },
  );
}

/** Show a message and wait for acknowledgement (any key). */
export function alert(message: string, opts: AlertOptions = {}): Promise<void> {
  const terminal = opts.terminal ?? nodeTerminal();
  return interact<void>(
    terminal,
    (live) => live.draw(alertView(message)),
    (_k, done) => done(undefined),
  );
}

/**
 * Run `work` while showing an animated spinner with `label`, then mark it done
 * (✓) or failed (✗). Resolves/rejects with `work`'s outcome. Unlike the other
 * prompts it reads no keys — it just animates a live region until the promise
 * settles.
 */
export async function spinner<T>(
  label: string,
  work: () => Promise<T> | T,
  opts: SpinnerOptions = {},
): Promise<T> {
  const terminal = opts.terminal ?? nodeTerminal();
  const live = new LiveRenderer((chunk) => terminal.write(chunk));
  let i = 0;
  live.draw(spinnerView(label, { frame: i, frames: opts.frames }));
  const timer = setInterval(() => {
    live.draw(spinnerView(label, { frame: ++i, frames: opts.frames }));
  }, opts.interval ?? 80);
  (timer as { unref?: () => void }).unref?.(); // don't keep the process alive
  try {
    const result = await work();
    clearInterval(timer);
    live.draw(spinnerView(label, { state: "success" }));
    return result;
  } catch (err) {
    clearInterval(timer);
    live.draw(spinnerView(label, { state: "fail" }));
    throw err;
  }
}

/** The `this.prompt` surface contributed by {@link prompts}. */
export interface PromptApi {
  ask(message: string, opts?: AskOptions): Promise<string>;
  confirm(message: string, opts?: ConfirmOptions): Promise<boolean>;
  choice(message: string, items: readonly string[], opts?: SelectOptions): Promise<string>;
  choice<T>(message: string, items: readonly ChoiceItem<T>[], opts?: SelectOptions): Promise<T>;
  list(message: string, items: readonly string[], opts?: SelectOptions): Promise<string[]>;
  list<T>(message: string, items: readonly ChoiceItem<T>[], opts?: SelectOptions): Promise<T[]>;
  alert(message: string, opts?: AlertOptions): Promise<void>;
  spinner<T>(label: string, work: () => Promise<T> | T, opts?: SpinnerOptions): Promise<T>;
}

/** Options for {@link prompts}. */
export interface PromptsOptions {
  /** Terminal to drive (defaults to the real stdin/stdout). */
  terminal?: Terminal;
}

/**
 * Prompt middleware. Adds `this.prompt` with `ask`/`confirm`/`choice`/`list`/
 * `alert`, all bound to one terminal (the real one, or an injected double).
 */
export function prompts(options: PromptsOptions = {}): CliMiddleware<{ readonly prompt: PromptApi }> {
  return {
    name: "prompt",
    install(ctx) {
      const terminal = options.terminal ?? nodeTerminal();
      const withTerminal = <O extends PromptOptions>(opts?: O): O =>
        ({ ...(opts as O), terminal }) as O;
      const api: PromptApi = {
        ask: (m, o) => ask(m, withTerminal(o)),
        confirm: (m, o) => confirm(m, withTerminal(o)),
        choice: (m: string, items: readonly never[], o?: SelectOptions) => choice(m, items, withTerminal(o)),
        list: (m: string, items: readonly never[], o?: SelectOptions) => list(m, items, withTerminal(o)),
        alert: (m, o) => alert(m, withTerminal(o)),
        spinner: (l, w, o) => spinner(l, w, withTerminal(o)),
      } as PromptApi;
      contribute(ctx.command, "prompt", api);
    },
  };
}
