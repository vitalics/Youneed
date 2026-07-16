// @youneed/cli — the run-time half: parse flag/name strings into specs, and
// parse a token list against those specs. These derivations mirror the
// compile-time ones in types.ts (OptionKey/TakesValue/PositionalArgs), so the
// inferred types and the actual parse stay in lockstep.

import type { CliMiddleware } from "./middleware.ts";
import type {
  CoercibleSchema,
  InlineOption,
  OptionConfig,
  OptionEntry,
  StandardSchemaV1,
  ValueConstructor,
} from "./types.ts";

/** Spec metadata stashed on a class produced by `Command()`. */
export const SPEC = Symbol.for("@youneed/cli.command");
/** Spec metadata stashed on a class produced by `Option()`. */
export const OPT_SPEC = Symbol.for("@youneed/cli.option");

/** kebab-case → camelCase (runtime twin of the `Camel` type). */
export function camel(name: string): string {
  return name.replace(/-([a-z0-9])/gi, (_, c: string) => c.toUpperCase());
}

/** Coerces a raw string value, or reports why it can't. */
export type ValueCoercer = (raw: string) => { value: unknown } | { error: string };

/** A parsed, normalized option. */
export interface OptionSpec {
  /** The flag string exactly as written, used as the left column in help. */
  raw: string;
  /** The `this.options` key (camelCased long name). */
  key: string;
  /** Long name without leading dashes, e.g. `separator`. */
  long?: string;
  /** Short alias without the dash, e.g. `s`. */
  short?: string;
  /** Whether the option consumes a value. */
  takesValue: boolean;
  /** Whether the value placeholder used `[...]` (optional) rather than `<...>`. */
  optionalValue: boolean;
  /** Whether the value placeholder used `...` (collects into an array). */
  variadic: boolean;
  /** A `--no-x` style negation flag (boolean defaulting to true). */
  negate: boolean;
  /** Placeholder name inside the `<...>`/`[...]`, for help output. */
  valueName?: string;
  description?: string;
  default?: unknown;
  required: boolean;
  /** JS constructor the value is coerced to (`Number`/`Boolean`/`String`). */
  type?: ValueConstructor;
  /** Schema validating & coercing the value (mutually exclusive with `type`). */
  schema?: StandardSchemaV1 | CoercibleSchema;
  /** Derived from `type`: turns a raw string into the typed value. */
  coerce?: ValueCoercer;
}

/** Build the coercer for a JS `type` constructor. */
function coercerFor(type?: ValueConstructor): ValueCoercer | undefined {
  if (type === Number)
    return (raw) => {
      const n = Number(raw);
      return Number.isNaN(n) ? { error: `expected a number, got '${raw}'` } : { value: n };
    };
  if (type === Boolean)
    return (raw) => {
      const v = raw.toLowerCase();
      if (["true", "1", "yes", "on"].includes(v)) return { value: true };
      if (["false", "0", "no", "off"].includes(v)) return { value: false };
      return { error: `expected a boolean, got '${raw}'` };
    };
  if (type === String) return (raw) => ({ value: raw });
  return undefined;
}

/** A parsed positional argument declared in a command `name`. */
export interface ArgSpec {
  name: string;
  required: boolean;
  variadic: boolean;
}

/** A fully-resolved command definition. */
export interface CommandSpec {
  /** The command word, e.g. `split`. */
  name: string;
  /** The original `name` string, e.g. `split <string>`. */
  raw: string;
  description?: string;
  aliases: string[];
  hidden: boolean;
  args: ArgSpec[];
  options: OptionSpec[];
  /** Middleware that augment the command instance for each run. */
  middleware: CliMiddleware[];
}

/** Parse a flag string (`-s, --separator <char>`) plus config into an OptionSpec. */
export function buildOptionSpec(flag: string, config?: OptionConfig): OptionSpec {
  if (config?.type && config?.schema) {
    throw new Error("@youneed/cli: `type` and `schema` are mutually exclusive");
  }
  const spec: OptionSpec = {
    raw: flag,
    key: "",
    takesValue: false,
    optionalValue: false,
    variadic: false,
    negate: false,
    required: config?.required ?? false,
    description: config?.description,
    default: config?.default,
    type: config?.type,
    schema: config?.schema,
    coerce: coercerFor(config?.type),
  };

  // Pull out the value placeholder, if any: <name>, [name], <name...>, [name...].
  const value = flag.match(/[<[]([^>\]]+)[>\]]/);
  if (value) {
    spec.takesValue = true;
    spec.optionalValue = flag.includes("[");
    spec.variadic = value[1]!.includes("...");
    spec.valueName = value[1]!.replace("...", "");
  }

  // The remaining tokens are the flags themselves: -s, --separator
  const flagsPart = flag.replace(/\s*[<[][^>\]]+[>\]]/, "");
  for (const token of flagsPart.split(/[\s,]+/).filter(Boolean)) {
    if (token.startsWith("--")) {
      let long = token.slice(2);
      if (long.startsWith("no-")) {
        spec.negate = true;
        long = long.slice(3);
      }
      spec.long = long;
    } else if (token.startsWith("-")) {
      spec.short = token.slice(1);
    }
  }

  // `type` (other than Boolean) and `schema` imply the option carries a value,
  // even without an explicit `<...>`/`[...]` placeholder in the flag string.
  if (!spec.takesValue && ((config?.type && config.type !== Boolean) || config?.schema)) {
    spec.takesValue = true;
  }

  // `short` may be given with or without a leading dash ("-f" or "f").
  if (config?.short) spec.short = config.short.replace(/^-+/, "");
  spec.key = camel(spec.long ?? spec.short ?? "");
  return spec;
}

/** Resolve a single option entry (an `Option()` class or inline spec) to a spec. */
export function resolveEntry(entry: OptionEntry): OptionSpec {
  if (typeof entry === "function") {
    const stored = (entry as { [OPT_SPEC]?: OptionSpec })[OPT_SPEC];
    if (!stored) throw new Error("@youneed/cli: option class was not produced by Option()");
    return stored;
  }
  const inline = entry as InlineOption;
  return buildOptionSpec(inline.name, inline);
}

/** Resolve a whole `options` array. */
export function resolveEntries(entries: readonly OptionEntry[]): OptionSpec[] {
  return entries.map(resolveEntry);
}

/** Parse a command `name` string (`copy <src> [dest...]`) into name + arg specs. */
export function parseCommandName(name: string): { word: string; args: ArgSpec[] } {
  const tokens = name.trim().split(/\s+/);
  const word = tokens.shift() ?? "";
  const args: ArgSpec[] = tokens.map((token) => {
    const required = token.startsWith("<");
    const inner = token.slice(1, -1);
    return { name: inner.replace("...", ""), required, variadic: inner.includes("...") };
  });
  return { word, args };
}

/** Outcome of matching a token list against a set of option specs. */
export interface ParseResult {
  options: Record<string, unknown>;
  positionals: string[];
  errors: string[];
}

function findByLong(specs: OptionSpec[], body: string): OptionSpec | undefined {
  const key = camel(body);
  return specs.find((s) => s.long === body || s.key === key);
}

/**
 * Parse `tokens` against `specs`, returning the option object, leftover
 * positionals, and any errors (unknown options, missing values). Defaults and
 * required-checks are applied here so the runner only has to dispatch.
 */
export function parseArgs(specs: OptionSpec[], tokens: string[]): ParseResult {
  const options: Record<string, unknown> = {};
  const positionals: string[] = [];
  const errors: string[] = [];
  const byShort = new Map(specs.filter((s) => s.short).map((s) => [s.short!, s]));

  // Seed defaults: explicit default wins; booleans start false; `--no-x` true.
  for (const s of specs) {
    if (s.default !== undefined) options[s.key] = s.default;
    else if (s.negate) options[s.key] = true;
    else if (!s.takesValue) options[s.key] = false;
    if (s.variadic && options[s.key] === undefined) options[s.key] = [];
  }

  const setValue = (spec: OptionSpec, raw: string): void => {
    let value: unknown = raw;
    if (spec.schema && "~standard" in spec.schema) {
      // Standard Schema (zod, valibot, …).
      const result = spec.schema["~standard"].validate(raw);
      if (result instanceof Promise) {
        errors.push(`option '${spec.raw}' uses an async schema, which is unsupported`);
        return;
      }
      if (result.issues) {
        errors.push(`option '${spec.raw}': ${result.issues.map((i) => i.message).join(", ")}`);
        return;
      }
      value = result.value;
    } else if (spec.schema) {
      // Coercible schema (@youneed/schema t.*()): coerce then validate.
      try {
        const coerced = (spec.schema as CoercibleSchema).coerce(raw);
        (spec.schema as CoercibleSchema).validate?.(coerced);
        value = coerced;
      } catch (err) {
        errors.push(`option '${spec.raw}': ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    } else if (spec.coerce) {
      const result = spec.coerce(raw);
      if ("error" in result) {
        errors.push(`option '${spec.raw}': ${result.error}`);
        return;
      }
      value = result.value;
    }
    if (spec.variadic) {
      const arr = (options[spec.key] as unknown[] | undefined) ?? [];
      arr.push(value);
      options[spec.key] = arr;
    } else {
      options[spec.key] = value;
    }
  };

  // Keys explicitly provided on the command line — `required` checks this, not
  // the presence of a (possibly seeded default) value.
  const seen = new Set<string>();

  let onlyPositional = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (onlyPositional) {
      positionals.push(token);
      continue;
    }

    // Apply a value-bearing option, consuming the next token when appropriate.
    // A required value (`<x>`) always consumes the next token (even a dashed one,
    // so `-s -` works); an optional value (`[x]`) only consumes a non-dashed
    // token, and otherwise falls back to its default (or `true`).
    const applyValueOption = (spec: OptionSpec, label: string, inlineVal?: string): void => {
      let val = inlineVal;
      if (val === undefined) {
        const next = tokens[i + 1];
        const consume = spec.optionalValue ? next !== undefined && !next.startsWith("-") : next !== undefined;
        if (consume) {
          val = next;
          i++;
        }
      }
      if (val === undefined) {
        if (spec.optionalValue) options[spec.key] = spec.default ?? true;
        else {
          errors.push(`option '${label}' requires a value`);
          return;
        }
      } else {
        setValue(spec, val);
      }
      seen.add(spec.key);
    };

    if (token === "--") {
      onlyPositional = true;
    } else if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const body = eq === -1 ? token.slice(2) : token.slice(2, eq);
      const inlineVal = eq === -1 ? undefined : token.slice(eq + 1);

      if (body.startsWith("no-")) {
        const spec = findByLong(specs, body.slice(3));
        if (spec) {
          options[spec.key] = false;
          seen.add(spec.key);
        } else errors.push(`unknown option '${token}'`);
        continue;
      }
      const spec = findByLong(specs, body);
      if (!spec) {
        errors.push(`unknown option '${token}'`);
      } else if (spec.takesValue) {
        applyValueOption(spec, `--${spec.long}`, inlineVal);
      } else {
        options[spec.key] = true;
        seen.add(spec.key);
      }
    } else if (token.length > 1 && token.startsWith("-")) {
      const short = token[1]!;
      const spec = byShort.get(short);
      if (!spec) {
        errors.push(`unknown option '${token}'`);
      } else if (spec.takesValue) {
        // -sVALUE / -s=VALUE inline, else consume the next token.
        const inlineVal = token.length > 2 ? (token[2] === "=" ? token.slice(3) : token.slice(2)) : undefined;
        applyValueOption(spec, `-${short}`, inlineVal);
      } else {
        options[spec.key] = true;
        seen.add(spec.key);
      }
    } else {
      positionals.push(token);
    }
  }

  for (const s of specs) {
    if (s.required && !seen.has(s.key)) {
      errors.push(`required option '${s.raw}' not specified`);
    }
  }

  return { options, positionals, errors };
}

/** Levenshtein edit distance between two strings (for "did you mean" hints). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

/**
 * The closest candidate to `target` within a sensible edit-distance threshold,
 * or `undefined` if nothing is close enough — used to suggest a real command
 * name when an unknown one is typed.
 */
export function nearestCommand(target: string, candidates: readonly string[]): string | undefined {
  const threshold = Math.max(2, Math.floor(target.length / 2));
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(target, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= threshold ? best : undefined;
}
