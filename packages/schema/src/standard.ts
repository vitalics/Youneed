// @youneed/schema ⇄ Standard Schema interop (https://standardschema.dev).
//
// Standard Schema is the common interface zod (≥3.24), valibot, arktype and
// others implement: a `~standard` property carrying a `validate(value)` that
// returns either `{ value }` or `{ issues }`. Implementing it both ways makes
// validators interchangeable:
//
//   • EXPOSE  — `toStandardSchema(CreateUserDTO)` turns a @youneed DTO into a
//     Standard Schema any standard-aware tool can consume.
//   • CONSUME — `validate(zodSchema, input)` / `validateOrThrow(valibotSchema, …)`
//     run any Standard Schema through our engine (see ./core.ts), so a DTO and a
//     zod/valibot schema are drop-in swappable at the call site.

import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type ValidationError, validate } from "./core.ts";

// ── the Standard Schema surface ──────────────────────────────────────────────────
// Types come from the official `@standard-schema/spec` package (type-only). We
// re-export the interface + alias the result/issue shapes so consumers can keep
// importing them from `@youneed/schema`.

export type { StandardSchemaV1 } from "@standard-schema/spec";

/** The result a Standard Schema `validate` returns (alias of the spec type). */
export type StandardResult<Output> = StandardSchemaV1.Result<Output>;

/** One Standard Schema failure (alias of the spec type). `path` locates the value. */
export type StandardIssue = StandardSchemaV1.Issue;

/** Structural test for a Standard Schema (has the `~standard` marker). */
export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  return (typeof x === "object" || typeof x === "function") && x !== null && "~standard" in x;
}

// ── EXPOSE: @youneed DTO → Standard Schema ───────────────────────────────────────

/**
 * Wrap a @youneed DTO class as a Standard Schema so any standard-aware library
 * can validate with it. On success the (unchanged) input becomes the output
 * value; on failure each constraint message is emitted as an issue keyed by its
 * property path.
 */
export function toStandardSchema<T extends object>(
  Class: new () => T,
  vendor = "youneed/schema",
): StandardSchemaV1<unknown, T> {
  return {
    "~standard": {
      version: 1,
      vendor,
      validate(value: unknown): StandardResult<T> {
        const errors = validate(Class, value as object);
        if (errors.length === 0) return { value: value as T };
        const issues: StandardIssue[] = [];
        for (const e of errors)
          for (const message of Object.values(e.constraints)) issues.push({ message, path: [e.property] });
        return { issues };
      },
    },
  };
}

// ── CONSUME: Standard Schema → our ValidationError[] ─────────────────────────────

/** First path segment of an issue as a property name (`""` when unscoped). */
function propertyOf(issue: StandardIssue): string {
  const seg = issue.path?.[0];
  if (seg == null) return "";
  return typeof seg === "object" ? String(seg.key) : String(seg);
}

/** Group Standard Schema issues by property into our `ValidationError[]`. */
function resultToErrors(result: StandardResult<unknown>, input: unknown): ValidationError[] {
  if (!result.issues) return [];
  const byProp = new Map<string, Record<string, string>>();
  for (const issue of result.issues) {
    const property = propertyOf(issue);
    const constraints = byProp.get(property) ?? {};
    constraints[`standard.${Object.keys(constraints).length}`] = issue.message;
    byProp.set(property, constraints);
  }
  return [...byProp].map(([property, constraints]) => ({
    property,
    value: property && input && typeof input === "object" ? (input as Record<string, unknown>)[property] : input,
    constraints,
  }));
}

/** Run a Standard Schema synchronously → our `ValidationError[]`. Throws if the
 *  schema validates asynchronously (use {@link standardToErrorsAsync}). */
export function standardToErrors(schema: StandardSchemaV1, input: unknown): ValidationError[] {
  const result = schema["~standard"].validate(input);
  if (result instanceof Promise)
    throw new Error("Standard Schema validated asynchronously — use validateAsync().");
  return resultToErrors(result, input);
}

/** Run a Standard Schema (sync or async) → our `ValidationError[]`. */
export async function standardToErrorsAsync(schema: StandardSchemaV1, input: unknown): Promise<ValidationError[]> {
  const result = await schema["~standard"].validate(input);
  return resultToErrors(result, input);
}
