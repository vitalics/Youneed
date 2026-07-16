import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type ValidationError } from "./core.ts";
export type { StandardSchemaV1 } from "@standard-schema/spec";
/** The result a Standard Schema `validate` returns (alias of the spec type). */
export type StandardResult<Output> = StandardSchemaV1.Result<Output>;
/** One Standard Schema failure (alias of the spec type). `path` locates the value. */
export type StandardIssue = StandardSchemaV1.Issue;
/** Structural test for a Standard Schema (has the `~standard` marker). */
export declare function isStandardSchema(x: unknown): x is StandardSchemaV1;
/**
 * Wrap a @youneed DTO class as a Standard Schema so any standard-aware library
 * can validate with it. On success the (unchanged) input becomes the output
 * value; on failure each constraint message is emitted as an issue keyed by its
 * property path.
 */
export declare function toStandardSchema<T extends object>(Class: new () => T, vendor?: string): StandardSchemaV1<unknown, T>;
/** Run a Standard Schema synchronously → our `ValidationError[]`. Throws if the
 *  schema validates asynchronously (use {@link standardToErrorsAsync}). */
export declare function standardToErrors(schema: StandardSchemaV1, input: unknown): ValidationError[];
/** Run a Standard Schema (sync or async) → our `ValidationError[]`. */
export declare function standardToErrorsAsync(schema: StandardSchemaV1, input: unknown): Promise<ValidationError[]>;
