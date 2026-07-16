// @youneed/cli — text templates with "holes", the terminal analogue of
// @youneed/dom's html`` templates.
//
//   text`Loaded ${count} rows in ${ms}ms`
//
// A `${…}` is a *hole*: a dynamic span. When rendered for a live region the
// holes are wrapped in control characters (SOH `\x01` … STX `\x02`) so the
// renderer can locate each dynamic span by line and column and repaint only
// what changed — the same idea as dom's `<!--dh:i-->` markers, but using ASCII
// control codes because a terminal is a flat character stream, not a tree.
// `renderTemplate` strips the markers for the final, human-visible output.

import { isAwaitResult, resolveAwait } from "./flow.ts";

/** Brand for {@link CliTemplateResult}. */
const TEMPLATE: unique symbol = Symbol.for("@youneed/cli.template");

/** A captured `text\`…\`` template: its static strings and dynamic values. */
export interface CliTemplateResult {
  readonly [TEMPLATE]: true;
  readonly strings: TemplateStringsArray;
  readonly values: readonly unknown[];
}

/** True if `value` is a {@link CliTemplateResult}. */
export function isTemplate(value: unknown): value is CliTemplateResult {
  return typeof value === "object" && value !== null && (value as CliTemplateResult)[TEMPLATE] === true;
}

/**
 * Tagged template producing a {@link CliTemplateResult}.
 *
 * ```ts
 * render() {
 *   return text`Status: ${this.load.pending ? "loading…" : this.load.value}`;
 * }
 * ```
 */
export function text(strings: TemplateStringsArray, ...values: unknown[]): CliTemplateResult {
  return { [TEMPLATE]: true, strings, values };
}

/** Control character opening a hole's text in the marked form. */
export const HOLE_START = "\x01";
/** Control character closing a hole's text in the marked form. */
export const HOLE_END = "\x02";

/** Render one interpolated value to a string (recurses into nested templates). */
function stringifyValue(value: unknown): string {
  if (value == null || value === false || value === true) return "";
  if (isAwaitResult(value)) return stringifyValue(resolveAwait(value));
  if (isTemplate(value)) return renderMarked(value);
  if (Array.isArray(value)) return value.map(stringifyValue).join("");
  return String(value);
}

/**
 * Render a template to a string with each top-level hole wrapped in
 * {@link HOLE_START}/{@link HOLE_END}. Used internally to locate holes; see
 * {@link parseHoles}. Most callers want {@link renderTemplate}.
 */
export function renderMarked(result: CliTemplateResult): string {
  const { strings, values } = result;
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    out += HOLE_START + stringifyValue(values[i]) + HOLE_END + strings[i + 1]!;
  }
  return out;
}

/** Render a template to the final, marker-free string written to the terminal. */
export function renderTemplate(result: CliTemplateResult): string {
  return stripHoleMarkers(renderMarked(result));
}

/** Strip the hole control characters from a marked string. */
export function stripHoleMarkers(marked: string): string {
  return marked.replaceAll(HOLE_START, "").replaceAll(HOLE_END, "");
}

/** A located hole: where its dynamic text sits in the clean output. */
export interface Hole {
  /** Hole ordinal (0-based, in source order). */
  index: number;
  /** 0-based line of the hole's first character in the clean output. */
  line: number;
  /** 0-based column of the hole's first character on that line. */
  column: number;
  /** The hole's rendered text. */
  text: string;
}

/**
 * Walk a marked string and locate every hole — its line, column (both in clean
 * coordinates, ignoring the markers themselves), and rendered text. This is the
 * data a live renderer uses to patch a hole in place via cursor control codes.
 */
export function parseHoles(marked: string): Hole[] {
  const holes: Hole[] = [];
  let line = 0;
  let column = 0;
  let index = 0;
  let current: Hole | undefined;
  for (const ch of marked) {
    if (ch === HOLE_START) {
      current = { index: index++, line, column, text: "" };
      continue;
    }
    if (ch === HOLE_END) {
      if (current) holes.push(current);
      current = undefined;
      continue;
    }
    if (current) current.text += ch;
    if (ch === "\n") {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return holes;
}

// ── Table rendering ──────────────────────────────────────────────────────────

const ANSI = /\x1b\[[0-9;]*m/g;

/** Visible width of a string, ignoring ANSI colour codes. */
function visibleWidth(value: string): number {
  return value.replace(ANSI, "").length;
}

/** Per-column horizontal alignment. */
export type Align = "left" | "right" | "center";

/** Options for {@link table}. */
export interface TableOptions {
  /** Header cells; rendered above a separator rule. */
  head?: string[];
  /** Per-column alignment (single value applies to all). Default `left`. */
  align?: Align | Align[];
  /** Spaces of padding either side of each cell. Default `1`. */
  padding?: number;
}

/** Pad `value` to `width` visible columns under the given alignment. */
function padCell(value: string, width: number, align: Align): string {
  const gap = width - visibleWidth(value);
  if (gap <= 0) return value;
  if (align === "right") return " ".repeat(gap) + value;
  if (align === "center") {
    const left = gap >> 1;
    return " ".repeat(left) + value + " ".repeat(gap - left);
  }
  return value + " ".repeat(gap);
}

/**
 * Render a 2-D array of cells as a box-drawing table. Column widths fit the
 * widest cell (ANSI colour codes don't count toward width, so coloured cells
 * still align). Returns the multi-line string — feed it to `render`/stdout.
 *
 * ```ts
 * table([["alice", "12"], ["bob", "7"]], { head: ["name", "score"], align: ["left", "right"] });
 * ```
 */
export function table(rows: ReadonlyArray<ReadonlyArray<string>>, options: TableOptions = {}): string {
  const pad = options.padding ?? 1;
  const head = options.head;
  const body = head ? [head, ...rows] : [...rows];
  const cols = body.reduce((max, row) => Math.max(max, row.length), 0);
  const alignOf = (c: number): Align =>
    Array.isArray(options.align) ? (options.align[c] ?? "left") : (options.align ?? "left");

  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    widths[c] = body.reduce((max, row) => Math.max(max, visibleWidth(row[c] ?? "")), 0);
  }

  const space = " ".repeat(pad);
  const rule = (left: string, mid: string, right: string): string =>
    left + widths.map((w) => "─".repeat(w + pad * 2)).join(mid) + right;
  const renderRow = (row: ReadonlyArray<string>): string =>
    "│" + widths.map((w, c) => space + padCell(row[c] ?? "", w, alignOf(c)) + space).join("│") + "│";

  const lines: string[] = [rule("┌", "┬", "┐")];
  if (head) {
    lines.push(renderRow(head), rule("├", "┼", "┤"));
  }
  for (const row of rows) lines.push(renderRow(row));
  lines.push(rule("└", "┴", "┘"));
  return lines.join("\n");
}
