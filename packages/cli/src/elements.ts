// @youneed/cli — presentational elements: ready-made TUI primitives that render
// to strings. These are the pure VIEW layer — given data and state, each returns
// the text to draw. They do no I/O and read no keys, so they're trivially
// testable and composable inside a `render()`. The interactive prompts in
// @youneed/cli-middleware-prompt are the CONTROLLER layer built on top: they own
// the key loop and call these renderers each frame.
//
//   render() {
//     return text`${stepper(["Plan", "Build", "Ship"], { current: 1 })}\n${box("hello", { title: "Hi" })}`;
//   }

// Tiny ANSI helpers — inlined so the core needs no colour dependency.
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;
const green = (s: string): string => `\x1b[32m${s}\x1b[39m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[39m`;

const ANSI = /\x1b\[[0-9;]*m/g;
/** Visible width of a string, ignoring ANSI colour codes. */
export function visibleWidth(s: string): number {
  return s.replace(ANSI, "").length;
}

// ── box ──────────────────────────────────────────────────────────────────────

/** Options for {@link box}. */
export interface BoxOptions {
  /** Title rendered into the top border. */
  title?: string;
  /** Spaces of padding either side of the content. Default `1`. */
  padding?: number;
}

/** Frame content in a box-drawing border (ANSI-aware width). */
export function box(content: string | readonly string[], opts: BoxOptions = {}): string {
  const lines = Array.isArray(content) ? [...content] : String(content).split("\n");
  const pad = opts.padding ?? 1;
  const inner = Math.max(opts.title ? visibleWidth(opts.title) + 2 : 0, ...lines.map(visibleWidth));
  const space = " ".repeat(pad);
  const rule = (l: string, r: string): string => l + "─".repeat(inner + pad * 2) + r;
  const top = opts.title
    ? "┌─ " + opts.title + " " + "─".repeat(Math.max(0, inner + pad * 2 - visibleWidth(opts.title) - 3)) + "┐"
    : rule("┌", "┐");
  const body = lines.map((l) => "│" + space + l + " ".repeat(inner - visibleWidth(l)) + space + "│");
  return [top, ...body, rule("└", "┘")].join("\n");
}

// ── table (re-exported for grouping) ──────────────────────────────────────────

export { table, type TableOptions, type Align } from "./template.ts";

// ── stepper (a progress header) ───────────────────────────────────────────────

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

/** Options for {@link stepper}. */
export interface StepperOptions {
  /** Index of the active step (0-based). Earlier steps render as done. */
  current: number;
  /** Separator between steps. Default ` → `. */
  separator?: string;
}

/**
 * A horizontal step header: done steps green, the current one bold cyan, the
 * rest dim — `① Plan → ② Build → ③ Ship`.
 */
export function stepper(steps: readonly string[], opts: StepperOptions): string {
  const sep = dim(opts.separator ?? " → ");
  return steps
    .map((step, i) => {
      const label = `${CIRCLED[i] ?? i + 1} ${step}`;
      if (i < opts.current) return green(label);
      if (i === opts.current) return bold(cyan(label));
      return dim(label);
    })
    .join(sep);
}

// ── select (single / multiple) ────────────────────────────────────────────────

/** A selectable item; a bare string is used as both label and value. */
export interface ChoiceItem<T> {
  label: string;
  value: T;
  hint?: string;
}

/** State passed to a custom row renderer. */
export interface ItemState {
  active: boolean;
  selected: boolean;
  index: number;
}
/** Render one row of a {@link select}. Return the full line. */
export type ItemFormatter = (item: ChoiceItem<unknown>, state: ItemState) => string;

/** State for the {@link select} view. */
export interface SelectState {
  message: string;
  items: readonly ChoiceItem<unknown>[];
  /** Highlighted row. */
  cursor: number;
  /** Present ⇒ multi-select (checkboxes); the picked row indices. */
  selected?: ReadonlySet<number>;
  /** Custom per-row renderer. */
  format?: ItemFormatter;
  /** Render in the resolved/answered state. */
  done?: boolean;
}

/**
 * A single- or multi-select list. With `selected` it renders checkboxes
 * (multiple); without, a radio-style cursor (single). `format` overrides the
 * per-row look.
 */
export function select(state: SelectState): string {
  const { message, items, cursor, selected, format, done } = state;
  const multi = selected !== undefined;
  const summary = done
    ? " " +
      dim("›") +
      " " +
      (multi
        ? [...selected!].sort((a, b) => a - b).map((i) => items[i]!.label).join(", ") || "none"
        : (items[cursor]?.label ?? ""))
    : "";
  const head = `${done ? green("✓") : cyan("?")} ${message}${summary}`;
  const rows = items.map((it, i) => {
    const active = i === cursor;
    const isSelected = multi ? selected!.has(i) : active;
    if (format) return format(it, { active, selected: isSelected, index: i });
    const pointer = active ? cyan("❯") : " ";
    const label = active ? cyan(it.label) : it.label;
    if (multi) return `${pointer} ${selected!.has(i) ? green("◉") : "◯"} ${label}`;
    return `${pointer} ${label}${it.hint ? "  " + dim(it.hint) : ""}`;
  });
  return [head, ...rows].join("\n");
}

// ── input ─────────────────────────────────────────────────────────────────────

/** State for the {@link input} view. */
export interface InputState {
  message: string;
  value: string;
  /** Frame the field in a box; a string sets the title (default: the message). */
  box?: boolean | string;
  done?: boolean;
}

/** A text-input field, optionally framed in a box. */
export function input(state: InputState): string {
  const caret = state.done ? "" : dim("▏");
  if (state.box) {
    const title = typeof state.box === "string" ? state.box : state.message;
    return box(`${state.value}${caret}`, { title });
  }
  return `${state.done ? green("✓") : cyan("?")} ${state.message} ${state.value}${caret}`;
}

// ── alert ─────────────────────────────────────────────────────────────────────

/** A message awaiting acknowledgement. */
export function alert(message: string, opts: { hint?: string } = {}): string {
  return `${message}  ${dim(opts.hint ?? "↵")}`;
}

// ── spinner (one frame) ───────────────────────────────────────────────────────

/** Default braille spinner frames. */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Options for {@link spinner}. */
export interface SpinnerState {
  /** Which animation frame to show (mod the frame count). Default 0. */
  frame?: number;
  /** Animation frames. Default {@link SPINNER_FRAMES}. */
  frames?: readonly string[];
  /** Terminal state: spinning, succeeded (✓) or failed (✗). */
  state?: "spinning" | "success" | "fail";
}

/** Render one spinner frame (or the success/fail end state). */
export function spinner(label: string, opts: SpinnerState = {}): string {
  if (opts.state === "success") return `${green("✓")} ${label}`;
  if (opts.state === "fail") return `${red("✗")} ${label}`;
  const frames = opts.frames ?? SPINNER_FRAMES;
  return `${cyan(frames[(opts.frame ?? 0) % frames.length]!)} ${label}`;
}
