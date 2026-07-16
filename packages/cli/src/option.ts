// @youneed/cli — the `Option()` factory.
//
// Mirrors the @youneed factory-class pattern (Component/Controller): a config
// goes in, a base class comes out, and the user `extends` it. The metadata
// lives on the class via a Symbol-keyed static (inherited by the subclass), so
// the runner can read it back without a decorator. The phantom `__key`/`__value`
// statics carry no runtime value — they exist only so a tuple of Option classes
// can be mapped to a typed `this.options` object (see types.ts).

import { buildOptionSpec, OPT_SPEC, type OptionSpec } from "./parse.ts";
import type { OptionConfig, OptionKey, OptionValue } from "./types.ts";

/**
 * Define a reusable, named option. Both forms work — `Option()` returns a value
 * that doubles as a base class and as a ready-to-use option entry:
 *
 * ```ts
 * // As a class:
 * class FirstOption extends Option("--first", { short: "f" }) {}
 *
 * // Or inline, as a plain binding:
 * const separator = Option("-s, --separator <char>", { default: "," });
 *
 * options: [FirstOption, separator]
 * ```
 *
 * Its key (`first`/`separator`) and value type flow into the command's
 * `this.options`. By default a value flag is `string` and a bare flag is
 * `boolean`; `type:` coerces to a JS type and `schema:` validates through a
 * Standard Schema (zod/valibot), with the value type inferred from either:
 *
 * ```ts
 * Option("--max <n>", { type: Number });        // this.options.max: number
 * Option("--port <p>", { schema: z.coerce.number() });
 * ```
 */
export function Option<const F extends string, const O extends OptionConfig = {}>(
  flag: F,
  config?: O,
) {
  abstract class OptionImpl {
    static readonly [OPT_SPEC]: OptionSpec = buildOptionSpec(flag, config);
  }
  return OptionImpl as typeof OptionImpl & {
    /** Phantom: the `this.options` key this option contributes (type-only). */
    readonly __key: OptionKey<F>;
    /** Phantom: the value type this option contributes (type-only). */
    readonly __value: OptionValue<F, O>;
  };
}

/**
 * Define an option as a first-class descriptor — the preferred form. Like a
 * server guard, an option is a reusable value you drop into a command's
 * `options` array; `required: true` makes it a gate (the command errors if the
 * flag is absent). Its key and value type flow into `this.options`.
 *
 * ```ts
 * const first = option("--first [arg]", {
 *   short: "-f",          // leading dash optional
 *   required: true,        // the flag must be present
 *   schema: t.string(),    // coerce/validate via @youneed/schema (or a Standard Schema)
 *   default: "",
 * });
 *
 * class A extends Command("qwe", { options: [first, ...defaultOptions()] }) {}
 * ```
 */
export function option<const F extends string, const O extends OptionConfig = {}>(
  flag: F,
  config?: O,
): { readonly name: F } & O {
  return { ...(config as O), name: flag };
}
