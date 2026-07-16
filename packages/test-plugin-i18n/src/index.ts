// ── @youneed/test-plugin-i18n — translation parity checks for @youneed/test ──
//
// Catch the classic i18n rot — a key added to `en` but forgotten in `de`, a
// stray key no other locale has, or a `{placeholder}` that drifted between
// languages — before it ships. Point it at your `resources` map and it diffs
// every locale against a base:
//
//   import { Test, TestApplication, expect } from "@youneed/test";
//   import { assertParity, parity, eachLocale } from "@youneed/test-plugin-i18n";
//   import { resources, i18n } from "./i18n.ts";
//
//   class I18n extends Test() {
//     @Test.it("every locale is complete") complete() {
//       assertParity(resources); // throws an AssertionError listing the gaps
//     }
//
//     @Test.it("greeting renders in every language") greet() {
//       eachLocale(i18n, () => expect(i18n("greeting", { name: "x" })).toContain("x"));
//     }
//   }
//
// Or guard the WHOLE suite up front with the plugin form — `i18nParityPlugin`
// runs the same check in `setup`, failing the run before any test if a locale is
// incomplete:
//
//   TestApplication().addTests(I18n).use(i18nParityPlugin(resources)).run();

import { AssertionError, type TestPlugin } from "@youneed/test";
import { isPluralForms, type I18n, type Messages } from "@youneed/i18n";

export type Resources = Record<string, Messages>;

export interface ParityOptions {
  /** Locale every other is compared against (default: the first key of `resources`). */
  base?: string;
  /** Treat interpolation-placeholder differences as failures (default `true`). */
  checkPlaceholders?: boolean;
}

/** A placeholder set differs between the base and a locale for the same key. */
export interface PlaceholderMismatch {
  key: string;
  base: string[];
  got: string[];
}

/** What's wrong with one locale relative to the base. */
export interface LocaleIssue {
  locale: string;
  /** Keys present in the base but missing here. */
  missing: string[];
  /** Keys present here but not in the base. */
  extra: string[];
  /** Keys whose `{placeholders}` don't match the base. */
  placeholderMismatches: PlaceholderMismatch[];
}

export interface ParityReport {
  base: string;
  locales: string[];
  complete: boolean;
  issues: LocaleIssue[];
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Flatten a message tree into `dotted.key → template` pairs. A plural entry is
 *  a single leaf (its `other` form represents it for placeholder comparison) —
 *  locales legitimately differ in which plural categories they use, so we never
 *  descend into `key.one` / `key.many`. */
function flatten(tree: Messages, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const k of Object.keys(tree)) {
    const v = tree[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (isPluralForms(v)) out.set(key, v.other);
    else flatten(v, key, out);
  }
  return out;
}

/** The sorted set of `{placeholder}` names referenced by a template. */
function placeholders(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) names.add(m[1]);
  return [...names].sort();
}

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Diff every locale in `resources` against the base. The report is `complete`
 * when no locale has missing/extra keys (or placeholder mismatches, unless
 * `checkPlaceholders: false`).
 */
export function parity(resources: Resources, opts: ParityOptions = {}): ParityReport {
  const locales = Object.keys(resources);
  const base = opts.base ?? locales[0];
  const checkPlaceholders = opts.checkPlaceholders !== false;
  const baseFlat = flatten(resources[base] ?? {});
  const baseKeys = new Set(baseFlat.keys());

  const issues: LocaleIssue[] = [];
  for (const locale of locales) {
    if (locale === base) continue;
    const flat = flatten(resources[locale]);
    const keys = new Set(flat.keys());
    const missing = [...baseKeys].filter((k) => !keys.has(k)).sort();
    const extra = [...keys].filter((k) => !baseKeys.has(k)).sort();
    const placeholderMismatches: PlaceholderMismatch[] = [];
    if (checkPlaceholders) {
      for (const [key, template] of flat) {
        const baseTpl = baseFlat.get(key);
        if (baseTpl === undefined) continue; // an `extra` key — already reported
        const a = placeholders(baseTpl);
        const b = placeholders(template);
        if (!sameList(a, b)) placeholderMismatches.push({ key, base: a, got: b });
      }
    }
    if (missing.length || extra.length || placeholderMismatches.length)
      issues.push({ locale, missing, extra, placeholderMismatches });
  }

  return { base, locales, complete: issues.length === 0, issues };
}

/** Render a {@link ParityReport} as a human-readable, multi-line string. */
export function formatReport(report: ParityReport): string {
  if (report.complete) return `i18n parity OK (base "${report.base}", ${report.locales.length} locales)`;
  const lines = [`i18n parity failed (base "${report.base}"):`];
  for (const issue of report.issues) {
    lines.push(`  [${issue.locale}]`);
    if (issue.missing.length) lines.push(`    missing: ${issue.missing.join(", ")}`);
    if (issue.extra.length) lines.push(`    extra:   ${issue.extra.join(", ")}`);
    for (const pm of issue.placeholderMismatches)
      lines.push(`    placeholders @ ${pm.key}: base {${pm.base.join(",")}} vs {${pm.got.join(",")}}`);
  }
  return lines.join("\n");
}

/** Assert that every locale is complete; throws an `AssertionError` listing the
 *  gaps otherwise. Use inside a `@Test.it`. */
export function assertParity(resources: Resources, opts: ParityOptions = {}): void {
  const report = parity(resources, opts);
  if (!report.complete) throw new AssertionError(formatReport(report));
}

/**
 * Run `fn(locale)` once per locale, switching the translator to each in turn and
 * restoring the original afterwards (even if `fn` throws). For data-driven
 * assertions that must hold in every language.
 */
export function eachLocale<L extends string>(i18n: I18n<L>, fn: (locale: L) => void): void {
  const original = i18n.locale;
  try {
    for (const locale of i18n.locales) {
      i18n.setLocale(locale);
      fn(locale);
    }
  } finally {
    i18n.setLocale(original);
  }
}

/**
 * Plugin form: assert parity in `setup`, so an incomplete locale fails the run
 * before any test executes. Compose it with `TestApplication().use(...)`.
 */
export function i18nParityPlugin(resources: Resources, opts: ParityOptions = {}): TestPlugin {
  return {
    name: "i18n-parity",
    setup() {
      assertParity(resources, opts);
    },
  };
}
