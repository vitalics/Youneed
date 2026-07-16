// ── @youneed/i18n — tiny, typed translation core ────────────────────────────
//
// A locale-aware translator built from a plain `resources` object. The keys you
// pass to `t(...)` are TYPE-CHECKED and AUTOCOMPLETED — they are inferred from
// the shape of your resources as a union of dotted paths, so a typo or a key
// that only exists in one locale is a compile error.
//
//   const i18n = createI18n({
//     resources: {
//       en: { greeting: "Hello {name}", nav: { home: "Home" } },
//       de: { greeting: "Hallo {name}", nav: { home: "Startseite" } },
//     },
//     locale: "en",
//   });
//
//   i18n("greeting", { name: "Ada" }); // "Hello Ada"   ← autocompletes "greeting" | "nav.home"
//   i18n.setLocale("de");
//   i18n("nav.home");                   // "Startseite"
//
// The instance is BOTH callable (`i18n(key)`) and an object with methods
// (`i18n.setLocale`, `i18n.subscribe`, …) — the same shape `@youneed/logger`'s
// `format` API uses. Companion packages (`@youneed/dom-provider-i18n`,
// `@youneed/logger-plugin-i18n`, `@youneed/server-middleware-accept-language`)
// build on the loose {@link I18n} contract; `createI18n` hands back the typed
// {@link Translator}.

// ── resources / key inference ────────────────────────────────────────────────

/** CLDR plural categories — the buckets `Intl.PluralRules` maps a count into.
 *  Which ones a locale actually uses varies (English: `one`/`other`; Russian:
 *  `one`/`few`/`many`/`other`; …) — so only `other` is required. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** A pluralized message: one template per plural category. `t(key, { count })`
 *  picks the right one via `Intl.PluralRules` for the active locale (falling back
 *  to `other`). `{ one: "{count} item", other: "{count} items" }`. */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  /** Required — the fallback for any category a locale doesn't define. */
  other: string;
}

/** A nested tree of messages: leaves are strings (or {@link PluralForms}),
 *  branches are sub-trees. */
export interface Messages {
  [key: string]: string | PluralForms | Messages;
}

// True iff `T`'s keys are all plural categories AND it has `other` — i.e. it's a
// {@link PluralForms} leaf, not a nested branch. Lets FlattenKeys stop at a
// plural object instead of descending into `key.one`, `key.other`, …
type IsPluralForms<T> = [Exclude<keyof T, PluralCategory>] extends [never]
  ? T extends { other: unknown }
    ? true
    : false
  : false;

/** Flatten a message tree to the union of its dotted leaf paths. String leaves
 *  and {@link PluralForms} leaves both yield a single key.
 *  `{ a: "x", b: { c: "y" }, n: { one, other } }` → `"a" | "b.c" | "n"`. */
export type FlattenKeys<T, Prefix extends string = ""> = {
  [K in Extract<keyof T, string>]: T[K] extends string
    ? `${Prefix}${K}`
    : IsPluralForms<T[K]> extends true
      ? `${Prefix}${K}`
      : FlattenKeys<T[K], `${Prefix}${K}.`>;
}[Extract<keyof T, string>];

/** Interpolation values substituted into `{placeholder}` slots. */
export type TParams = Record<string, string | number | boolean>;

// ── per-key parameter inference (from the template's `{placeholders}`) ──────────
//
// A message template is always a string with `{paramName}` slots. These types
// read those slots straight off the resource's *literal* string type (captured
// via `createI18n`'s `const` type parameter) and turn them into a typed params
// object per key — so `t("Hello {name}")` requires `{ name }`, and a key with no
// slots takes no params at all.

/** The value type at a flat or dotted `key` in a message tree. Distributes over
 *  a union of locale trees, yielding each locale's template for that key. */
export type ValueAt<T, K extends string> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : K extends `${infer Head}.${infer Rest}`
      ? Head extends keyof T
        ? ValueAt<T[Head], Rest>
        : never
      : never
  : never;

/** The `{placeholder}` names in a template string (union; `never` if none).
 *  `"Hi {name}, you have {n}"` → `"name" | "n"`. */
export type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

// Every form template of a PluralForms value (for placeholder extraction).
type PluralTemplates<V> = V extends PluralForms ? NonNullable<V[PluralCategory]> : never;

/** The params object inferred for a message value: a required entry per
 *  `{placeholder}`, plus `count` (+ optional `ordinal`) when it's pluralized. */
export type ParamsFor<V> = V extends PluralForms
  ? { count: number; ordinal?: boolean } & {
      [K in Exclude<Placeholders<PluralTemplates<V>>, "count">]: string | number | boolean;
    }
  : { [K in Placeholders<V>]: string | number | boolean };

// The trailing args of `t(key, …)`, derived from the key's params object:
//   • no params at all → `[]` (a 2nd arg is rejected — note `{}` would WRONGLY
//     accept any object, so an empty params object must mean "no arg");
//   • some required    → `[params]` (the 2nd arg is mandatory);
//   • all optional     → `[params?]`.
type ParamsArg<V> = [keyof ParamsFor<V>] extends [never]
  ? []
  : {} extends ParamsFor<V>
    ? [params?: ParamsFor<V>]
    : [params: ParamsFor<V>];

// ── public contract ──────────────────────────────────────────────────────────

/** The loose, key-untyped contract companion packages depend on. */
export interface I18n<L extends string = string> {
  /** Stable per-instance id — correlates devtools translation events. */
  readonly id: number;
  /** The active locale. */
  readonly locale: L;
  /** Every locale present in `resources`. */
  readonly locales: readonly L[];
  /** Translate `key` for the active locale, interpolating `params`. */
  t(key: string, params?: TParams): string;
  /** Whether `key` resolves (in the active locale or the fallback). */
  has(key: string): boolean;
  /** Switch the active locale and notify subscribers. No-op for an unknown one. */
  setLocale(locale: L): void;
  /** Run `listener` on every locale change. Returns an unsubscribe. */
  subscribe(listener: (locale: L) => void): () => void;
}

/** The key-typed translator `createI18n` returns: callable, with `t`/`has`
 *  narrowed to the inferred key union AND the params object inferred per key from
 *  the template's `{placeholders}`. Parameterized by `M` — the union of locale
 *  message trees (`resources[locale]`). Assignable to the loose {@link I18n}
 *  (its methods are bivariant), so it slots into any `I18n`-typed parameter. */
export interface Translator<M, L extends string> extends I18n<L> {
  /** Translate `key` for the active locale. `params` is required (and shaped)
   *  exactly when the key's template has `{placeholders}` / is pluralized. */
  <K extends FlattenKeys<M> & string>(key: K, ...params: ParamsArg<ValueAt<M, K>>): string;
  t<K extends FlattenKeys<M> & string>(key: K, ...params: ParamsArg<ValueAt<M, K>>): string;
  has(key: string): key is FlattenKeys<M> & string;
}

export interface I18nOptions<R extends Record<string, Messages>> {
  /** `{ [locale]: messageTree }`. Keys are inferred from the union of leaves. */
  resources: R;
  /** Initial active locale (must be a key of `resources`). */
  locale: keyof R & string;
  /** Locale consulted when a key is missing in the active one. Default: `locale`. */
  fallbackLocale?: keyof R & string;
  /** Called when a key resolves in NO locale. Default: returns the key itself. */
  missing?: (key: string, locale: string) => string;
}

// ── implementation ─────────────────────────────────────────────────────────────

const INTERP = /\{(\w+)\}/g;

/** Substitute `{name}` slots from `params`; an absent slot is left verbatim. */
function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(INTERP, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

const PLURAL_KEYS: ReadonlySet<string> = new Set(["zero", "one", "two", "few", "many", "other"]);

/** Whether `v` is a {@link PluralForms} object (all keys are plural categories
 *  and `other` is a string) — vs. a plain string or a nested branch. */
export function isPluralForms(v: unknown): v is PluralForms {
  if (!v || typeof v !== "object") return false;
  const keys = Object.keys(v);
  return (
    keys.length > 0 &&
    keys.every((k) => PLURAL_KEYS.has(k)) &&
    typeof (v as Record<string, unknown>).other === "string"
  );
}

type Entry = string | PluralForms;

/** Resolve a dotted `key` against a message tree to its leaf (a string or a
 *  {@link PluralForms}). A literal flat key wins first (so `{ "a.b": … }`
 *  resolves), then the dotted path is walked as nested branches. */
function resolveEntry(tree: Messages | undefined, key: string): Entry | undefined {
  if (!tree) return undefined;
  const flat = tree[key];
  if (typeof flat === "string" || isPluralForms(flat)) return flat;
  let cur: string | PluralForms | Messages | undefined = tree;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Messages)[part];
  }
  return typeof cur === "string" || isPluralForms(cur) ? cur : undefined;
}

// ── plural selection (Intl.PluralRules — no shipped CLDR data) ───────────────────
const pluralCache = new Map<string, Intl.PluralRules>();

/** The CLDR plural category for `count` in `locale` (cardinal, or ordinal when
 *  `ordinal` is set). Degrades to `one`/`other` where `Intl.PluralRules` is absent. */
function pluralCategory(locale: string, count: number, ordinal: boolean): PluralCategory {
  if (typeof Intl === "undefined" || typeof Intl.PluralRules !== "function") {
    return count === 1 && !ordinal ? "one" : "other";
  }
  const cacheKey = `${ordinal ? "o" : "c"}:${locale}`;
  let rules = pluralCache.get(cacheKey);
  if (!rules) {
    rules = new Intl.PluralRules(locale, { type: ordinal ? "ordinal" : "cardinal" });
    pluralCache.set(cacheKey, rules);
  }
  return rules.select(count) as PluralCategory;
}

/** Pick the template from `forms` for `params.count` in `locale` (→ `other` when
 *  no count is given or the matched category is undefined). */
function selectForm(forms: PluralForms, locale: string, params?: TParams): string {
  const count = params?.count;
  if (typeof count !== "number") return forms.other;
  const category = pluralCategory(locale, count, params?.ordinal === true);
  return forms[category] ?? forms.other;
}

// ── devtools hook ──────────────────────────────────────────────────────────────
// A single, module-local sink that every translator emits each `t()` call to —
// the basis for `@youneed/dom-provider-i18n/devtools` (a live usage log + missing-key
// warnings). No-op (one branch) until a tool installs a hook via
// `setI18nDevtoolsHook`. Kept module-local (not on `globalThis`) so it's an
// explicit cross-package import, not ambient state.

/** One translation call, as seen by a devtools hook. */
export interface I18nTranslateEvent {
  /** Identifies the translator instance (see {@link I18n.id}). */
  id: number;
  /** Active locale at call time. */
  locale: string;
  /** The requested key. */
  key: string;
  /** Interpolation params passed to `t()`, if any. */
  params?: TParams;
  /** The rendered string returned to the caller. */
  result: string;
  /** Whether the key resolved (false = fell back to the `missing` handler). */
  resolved: boolean;
}

/** A devtools sink for translation events. */
export interface I18nDevtoolsHook {
  send(event: I18nTranslateEvent): void;
}

let devtoolsHook: I18nDevtoolsHook | undefined;

/** Install (or, with `undefined`, remove) the sink every translator reports each
 *  `t()` call to. `@youneed/dom-provider-i18n/devtools` calls this; apps rarely do directly. */
export function setI18nDevtoolsHook(hook: I18nDevtoolsHook | undefined): void {
  devtoolsHook = hook;
}

let nextId = 0;

/**
 * Build a typed translator from a `resources` map. The returned value is callable
 * (`i18n(key, params)`) and carries `id`, `locale`, `locales`, `t`, `has`,
 * `setLocale` and `subscribe`.
 */
export function createI18n<const R extends Record<string, Messages>>(
  opts: I18nOptions<R>,
): Translator<R[keyof R], keyof R & string> {
  type L = keyof R & string;
  const id = nextId++;
  const locales = Object.keys(opts.resources) as L[];
  const fallback = opts.fallbackLocale ?? opts.locale;
  const onMissing = opts.missing ?? ((key) => key);
  const listeners = new Set<(locale: L) => void>();
  let current: L = opts.locale;

  const t = (key: string, params?: TParams): string => {
    const entry =
      resolveEntry(opts.resources[current], key) ??
      (fallback === current ? undefined : resolveEntry(opts.resources[fallback], key));
    // A plural entry selects its form (by `params.count`) before interpolation.
    const template = typeof entry === "object" ? selectForm(entry, current, params) : entry;
    const result = template === undefined ? onMissing(key, current) : interpolate(template, params);
    if (devtoolsHook) devtoolsHook.send({ id, locale: current, key, params, result, resolved: entry !== undefined });
    return result;
  };

  const api = {
    id,
    t,
    has(key: string): boolean {
      return (
        resolveEntry(opts.resources[current], key) !== undefined ||
        resolveEntry(opts.resources[fallback], key) !== undefined
      );
    },
    get locale(): L {
      return current;
    },
    get locales(): readonly L[] {
      return locales;
    },
    setLocale(locale: L): void {
      if (locale === current || !locales.includes(locale)) return;
      current = locale;
      for (const fn of [...listeners]) fn(current);
    },
    subscribe(listener: (locale: L) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };

  // Make the translator callable AND carry the methods/getters above. Getters
  // can't survive a plain `Object.assign`, so copy descriptors.
  const callable = ((key: string, params?: TParams) => t(key, params)) as unknown as Translator<
    R[keyof R],
    L
  >;
  Object.defineProperties(callable, Object.getOwnPropertyDescriptors(api));
  return callable;
}
