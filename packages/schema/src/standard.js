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
import { validate } from "./core.js";
/** Structural test for a Standard Schema (has the `~standard` marker). */
export function isStandardSchema(x) {
    return (typeof x === "object" || typeof x === "function") && x !== null && "~standard" in x;
}
// ── EXPOSE: @youneed DTO → Standard Schema ───────────────────────────────────────
/**
 * Wrap a @youneed DTO class as a Standard Schema so any standard-aware library
 * can validate with it. On success the (unchanged) input becomes the output
 * value; on failure each constraint message is emitted as an issue keyed by its
 * property path.
 */
export function toStandardSchema(Class, vendor = "youneed/schema") {
    return {
        "~standard": {
            version: 1,
            vendor,
            validate(value) {
                const errors = validate(Class, value);
                if (errors.length === 0)
                    return { value: value };
                const issues = [];
                for (const e of errors)
                    for (const message of Object.values(e.constraints))
                        issues.push({ message, path: [e.property] });
                return { issues };
            },
        },
    };
}
// ── CONSUME: Standard Schema → our ValidationError[] ─────────────────────────────
/** First path segment of an issue as a property name (`""` when unscoped). */
function propertyOf(issue) {
    const seg = issue.path?.[0];
    if (seg == null)
        return "";
    return typeof seg === "object" ? String(seg.key) : String(seg);
}
/** Group Standard Schema issues by property into our `ValidationError[]`. */
function resultToErrors(result, input) {
    if (!result.issues)
        return [];
    const byProp = new Map();
    for (const issue of result.issues) {
        const property = propertyOf(issue);
        const constraints = byProp.get(property) ?? {};
        constraints[`standard.${Object.keys(constraints).length}`] = issue.message;
        byProp.set(property, constraints);
    }
    return [...byProp].map(([property, constraints]) => ({
        property,
        value: property && input && typeof input === "object" ? input[property] : input,
        constraints,
    }));
}
/** Run a Standard Schema synchronously → our `ValidationError[]`. Throws if the
 *  schema validates asynchronously (use {@link standardToErrorsAsync}). */
export function standardToErrors(schema, input) {
    const result = schema["~standard"].validate(input);
    if (result instanceof Promise)
        throw new Error("Standard Schema validated asynchronously — use validateAsync().");
    return resultToErrors(result, input);
}
/** Run a Standard Schema (sync or async) → our `ValidationError[]`. */
export async function standardToErrorsAsync(schema, input) {
    const result = await schema["~standard"].validate(input);
    return resultToErrors(result, input);
}
