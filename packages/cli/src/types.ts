// @youneed/cli — the type-level half of the framework.
//
// Commander's ergonomics come from one trick: you write the option/argument
// grammar as a STRING ("split <string>", "-s, --separator <char>") and expect
// `this.options.separator` and `execute(arg)` to be typed from it. Everything in
// this file is the compile-time machinery that turns those literal strings into
// real types — there is no runtime code here. The runtime half (in parse.ts)
// re-derives the same facts at run time; the two must agree.

import type { CliTemplateResult } from "./template.ts";

/** A value that may or may not be awaited. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * What a command's `render` may produce, drawn to stdout. The CLI counterpart
 * of a dom/ssr render result: where those return markup, a command renders
 * lines of text. A `string` is written as-is; an array or (async) iterable is
 * written chunk by chunk — so a command can stream output as it computes it.
 *
 * This is the forward-looking, declarative alternative to the imperative
 * `execute` (which writes to the console itself); both are supported.
 */
export type Renderable =
  | string
  | CliTemplateResult
  | readonly string[]
  | Iterable<string>
  | AsyncIterable<string>
  | null
  | undefined
  | void;

/** Collapse a union of object types into a single intersected object. */
export type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

/** Flatten an intersection so editors show one clean object on hover. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** kebab-case → camelCase, so `--dry-run` becomes the key `dryRun`. */
export type Camel<S extends string> = S extends `${infer A}-${infer B}`
  ? `${A}${Capitalize<Camel<B>>}`
  : S;

// ── Flag-string parsing ──────────────────────────────────────────────────────
// A flag string is "[-x, ]--long[ <value>|[value]]". We peel it apart in stages.

/** Drop a trailing ` <value>` / ` [value]` placeholder. */
type StripValue<S extends string> = S extends `${infer H} <${string}`
  ? H
  : S extends `${infer H} [${string}`
    ? H
    : S;

/** Reduce "[-x, ]--long" (value already stripped) to just the `--long` token. */
type LongToken<S extends string> =
  StripValue<S> extends `${infer _Short}, ${infer Long}`
    ? Long
    : StripValue<S> extends `${infer _Short} --${infer Long}`
      ? `--${Long}`
      : StripValue<S>;

/** The bare flag name: `--separator` → `separator`, lone `-f` → `f`. */
type FlagBare<S extends string> =
  LongToken<S> extends `--${infer N}`
    ? N
    : LongToken<S> extends `-${infer C}`
      ? C
      : LongToken<S>;

/** The property key a flag string contributes to `this.options`. */
export type OptionKey<S extends string> = Camel<FlagBare<S>>;

/** Whether a flag string carries a value (`<x>` or `[x]`) vs. being a boolean. */
export type TakesValue<S extends string> = S extends `${string} <${string}`
  ? true
  : S extends `${string} [${string}`
    ? true
    : false;

// ── Option config & value resolution ─────────────────────────────────────────

/** A JS constructor usable as an option `type` (coerces the parsed value). */
export type ValueConstructor = StringConstructor | NumberConstructor | BooleanConstructor;

/**
 * A schema that coerces a raw string and (optionally) validates the result —
 * the shape of a `@youneed/schema` `t.*()`. Accepted structurally so the core
 * needn't depend on the schema's concrete class.
 */
export interface CoercibleSchema<T = unknown> {
  /** Parse the raw flag value; may throw on a bad value. */
  coerce(raw: string): T;
  /** Validate the coerced value; may throw on a constraint violation. */
  validate?(value: T): void;
}

/**
 * The minimal [Standard Schema](https://standardschema.dev) surface — the
 * interface zod (≥3.24), valibot, arktype and others all implement. Accepting
 * it lets `schema:` infer the option's value type from any of them without a
 * direct dependency.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

/** The synchronous result shape a Standard Schema `validate` returns. */
export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> };

/** Options accepted by `Option()` and by an inline option spec. */
export interface OptionConfig {
  /** Single-character alias, e.g. `f` for `--first` (overrides any in the flag). */
  short?: string;
  /** One-line description shown in `--help`. */
  description?: string;
  /** Value used when the flag is absent — also narrows the type to non-`undefined`. */
  default?: unknown;
  /** Fail if the option is missing. */
  required?: boolean;
  /**
   * Coerce the value to a JS type. `Number`/`Boolean`/`String`. Anything other
   * than `Boolean` implies the option takes a value. Mutually exclusive with
   * {@link OptionConfig.schema}.
   */
  type?: ValueConstructor;
  /**
   * Validate & coerce the value through a schema — a Standard Schema (zod,
   * valibot, …) or a `@youneed/schema` `t.*()`. Implies the option takes a
   * value; its output type becomes the option type. Mutually exclusive with
   * {@link OptionConfig.type}.
   */
  schema?: StandardSchemaV1 | CoercibleSchema;
}

/** Narrow `V` to non-`undefined` when the config guarantees a value. */
type Optionalize<O, V> = O extends { default: infer D }
  ? D extends undefined
    ? V | undefined
    : V
  : O extends { required: true }
    ? V
    : V | undefined;

/** The value type a JS `type` constructor yields. */
type CtorValue<T> = T extends NumberConstructor
  ? number
  : T extends BooleanConstructor
    ? boolean
    : T extends StringConstructor
      ? string
      : unknown;

/** The output type of a schema (Standard Schema or a coercible `t.*()`). */
type InferSchema<S> = S extends { "~standard": { types?: { output: infer O } } }
  ? O
  : S extends { coerce: (raw: string) => infer O }
    ? O
    : unknown;

/** Value type once a flag carries no explicit `type`/`schema`. */
type FromFlag<F extends string, O> = TakesValue<F> extends true
  ? Optionalize<O, string>
  : boolean;

/** Value type from an explicit `type` constructor (or fall back to the flag). */
type FromType<F extends string, O> = O extends { type: infer T }
  ? T extends undefined
    ? FromFlag<F, O>
    : T extends BooleanConstructor
      ? boolean
      : Optionalize<O, CtorValue<T>>
  : FromFlag<F, O>;

/**
 * The resolved value type of a flag string `F` with config `O`. Precedence:
 * `schema` → `type` → the flag's own `<value>`/boolean shape.
 */
export type OptionValue<F extends string, O> = O extends { schema: infer S }
  ? S extends undefined
    ? FromType<F, O>
    : Optionalize<O, InferSchema<S>>
  : FromType<F, O>;

// ── Mapping option entries to the `options` object shape ──────────────────────

/** An inline option: a spec object that carries its flag string in `name`. */
export interface InlineOption extends OptionConfig {
  name: string;
}

/** A class produced by `Option()` (carries phantom `__key`/`__value` statics). */
export type OptionCtor = abstract new (...args: any[]) => unknown;

/** Anything accepted in a `Command`/`Application` `options` array. */
export type OptionEntry = OptionCtor | InlineOption;

/** The `{ key: value }` an inline spec contributes. */
type InlineProp<E, S extends string> = { [P in OptionKey<S>]: OptionValue<S, E> };

/** The `{ key: value }` a single option entry contributes to `this.options`. */
export type EntryToProp<E> = E extends { __key: infer K extends string; __value: infer V }
  ? { [P in K]: V }
  : E extends { name: infer S extends string }
    ? InlineProp<E, S>
    : {};

/** The fully-typed `this.options` shape for a tuple of option entries. */
export type OptionsShape<T extends readonly unknown[]> = T extends readonly []
  ? {}
  : Simplify<UnionToIntersection<{ [I in keyof T]: EntryToProp<T[I]> }[number]>>;

// ── Positional-argument parsing (from a command `name`) ───────────────────────
// "split <string>" → command word "split", one required string argument.

/** Split a space-separated grammar string into its tokens. */
type Tokens<S extends string> = S extends `${infer H} ${infer R}` ? [H, ...Tokens<R>] : [S];

/** Drop the leading command-word token, leaving only argument tokens. */
type DropFirst<T extends readonly unknown[]> = T extends readonly [unknown, ...infer R] ? R : [];

/** Turn argument tokens into the tuple `execute` receives. */
type BuildArgs<T extends readonly string[]> = T extends [
  infer H extends string,
  ...infer R extends string[],
]
  ? H extends `<${string}...>`
    ? string[]
    : H extends `[${string}...]`
      ? string[]
      : H extends `<${string}>`
        ? [string, ...BuildArgs<R>]
        : H extends `[${string}]`
          ? [(string | undefined)?, ...BuildArgs<R>]
          : BuildArgs<R>
  : [];

/** The positional-argument tuple a command `name` string declares. */
export type PositionalArgs<S extends string> = BuildArgs<DropFirst<Tokens<S>>>;
