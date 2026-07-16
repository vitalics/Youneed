// @youneed/cli-middleware-color — terminal styling for @youneed/cli commands.
//
//   class Build extends Command({ name: "build", middleware: [color()] }) {
//     execute() {
//       console.log(this.color.green("done"), this.color.bold(this.color.cyan("✓")));
//     }
//   }
//
// `this.color` is a set of chalk-style chainable-by-nesting style functions.
// Each uses its own ANSI close code (not a blanket reset), so nesting composes:
// `color.bold(color.red("x"))` stays bold *and* red. When colour is disabled
// (NO_COLOR, `--no-color`, or a non-TTY stdout) every style is the identity
// function, so call sites never branch on support.

import { contribute, type CliMiddleware, type MiddlewareContext } from "@youneed/cli";

/** A single style: wraps text in ANSI codes (or returns it unchanged). */
export type Style = (text: string) => string;

/** The eight basic colours, as styles. Used for foreground and background. */
export interface ColorPalette {
  readonly black: Style;
  readonly red: Style;
  readonly green: Style;
  readonly yellow: Style;
  readonly blue: Style;
  readonly magenta: Style;
  readonly cyan: Style;
  readonly white: Style;
}

/** The `this.color` surface contributed by this middleware. */
export interface Color extends ColorPalette {
  /** Whether styling is actually emitted (false ⇒ every style is identity). */
  readonly enabled: boolean;
  // Modifiers
  readonly reset: Style;
  readonly bold: Style;
  readonly dim: Style;
  readonly italic: Style;
  readonly underline: Style;
  readonly inverse: Style;
  readonly strikethrough: Style;
  // Foreground greys (in addition to the palette inherited above)
  readonly gray: Style;
  readonly grey: Style;
  /** Background colours: `this.color.background.magenta("…")`. */
  readonly background: ColorPalette;
}

/** Options for {@link color}. */
export interface ColorOptions {
  /**
   * Force colour on/off. When omitted, detection is used: `--no-color` →
   * `NO_COLOR` env → `FORCE_COLOR` env → `process.stdout.isTTY`.
   */
  enabled?: boolean;
  /** The option key inspected for an explicit toggle. Default `color`. */
  optionKey?: string;
}

// [open, close] ANSI code pairs. Distinct close codes make nesting composable.
// Foreground colours + greys close with 39; background colours with 49.
const FOREGROUND: Record<string, [number, number]> = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  inverse: [7, 27],
  strikethrough: [9, 29],
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
  grey: [90, 39],
};

const BACKGROUND: Record<keyof ColorPalette, [number, number]> = {
  black: [40, 49],
  red: [41, 49],
  green: [42, 49],
  yellow: [43, 49],
  blue: [44, 49],
  magenta: [45, 49],
  cyan: [46, 49],
  white: [47, 49],
};

const identity: Style = (text) => text;

/** A style that wraps text in the given ANSI codes, or the identity when off. */
function makeStyle(enabled: boolean, [open, close]: [number, number]): Style {
  if (!enabled) return identity;
  const openSeq = `\x1b[${open}m`;
  const closeSeq = `\x1b[${close}m`;
  return (text) => openSeq + text + closeSeq;
}

/** Build a style record from a code table. */
function buildStyles(enabled: boolean, table: Record<string, [number, number]>): Record<string, Style> {
  const out: Record<string, Style> = {};
  for (const name of Object.keys(table)) out[name] = makeStyle(enabled, table[name]!);
  return out;
}

/** Build a {@link Color} surface for a known enabled/disabled state. */
export function createColor(enabled: boolean): Color {
  return {
    enabled,
    ...buildStyles(enabled, FOREGROUND),
    background: buildStyles(enabled, BACKGROUND),
  } as unknown as Color;
}

/** Resolve whether colour should be enabled, given options + the run context. */
function shouldEnable(opts: ColorOptions, ctx: MiddlewareContext): boolean {
  if (opts.enabled !== undefined) return opts.enabled;
  const toggle = ctx.options[opts.optionKey ?? "color"];
  if (toggle === false) return false;
  if (toggle === true) return true;
  const env = typeof process !== "undefined" ? process.env : {};
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
  return Boolean(typeof process !== "undefined" && process.stdout?.isTTY);
}

/**
 * Color middleware. Adds `this.color`, honouring `--no-color`/`--color` (if the
 * command declares it), the `NO_COLOR`/`FORCE_COLOR` env vars, and TTY detection.
 */
export function color(options: ColorOptions = {}): CliMiddleware<{ readonly color: Color }> {
  return {
    name: "color",
    install(ctx) {
      contribute(ctx.command, "color", createColor(shouldEnable(options, ctx)));
    },
  };
}
