// @youneed/schema core — the rule model, the constructor-keyed rule registry,
// and the `validate` engine. The decorators that register rules live in
// `./decorators.ts`; Standard Schema interop lives in `./standard.ts`.
//
// How the metadata is collected: TS/esbuild only attach `Symbol.metadata` to a
// class when it ALSO has a class decorator — fields-only DTOs would lose it. So,
// like the rest of @youneed/*, each field decorator registers its rules through
// `context.addInitializer` into a constructor-keyed WeakMap (the rules land the
// first time the class is constructed). `validate(Class, …)` constructs a
// throwaway instance once to trigger that, then checks the plain object.

import { isStandardSchema, standardToErrors, standardToErrorsAsync, type StandardSchemaV1 } from "./standard.ts";

// ── Rule model ─────────────────────────────────────────────────────────────────

/** A single constraint on a field. */
export interface Rule {
  /** Constraint id, e.g. "isEmail" — the key in `ValidationError.constraints`. */
  name: string;
  /** Return true when `value` satisfies the constraint. */
  test: (value: unknown, object: unknown) => boolean;
  /** Human message for a failure (receives the property name). */
  message: (property: string) => string;
}

interface FieldRules {
  rules: Rule[];
  /** `@IsOptional()` — skip the other rules when the value is null/undefined. */
  optional: boolean;
}

/** A field that failed, in the class-validator shape. */
export interface ValidationError {
  property: string;
  value: unknown;
  /** `{ constraintName: message }` for every failed rule on this field. */
  constraints: Record<string, string>;
}

/** Per-decorator options shared by every constraint. */
export interface ConstraintOptions {
  /** Override the default failure message. */
  message?: string;
}

// ── Registry (constructor → field → rules) ──────────────────────────────────────

const registry = new WeakMap<Function, Map<string, FieldRules>>();
const probed = new WeakSet<Function>(); // classes we've instantiated to collect rules

function fieldRulesOf(ctor: Function): Map<string, FieldRules> {
  let map = registry.get(ctor);
  if (!map) registry.set(ctor, (map = new Map()));
  return map;
}

/** Internal: the rule slot for `field` on `ctor` (used by the decorators). */
export function ruleSlot(ctor: Function, field: string): FieldRules {
  const map = fieldRulesOf(ctor);
  let fr = map.get(field);
  if (!fr) map.set(field, (fr = { rules: [], optional: false }));
  return fr;
}

/** Internal: build the field decorator that registers `rule` on first construction. */
export function constraint(r: Rule) {
  return function (_value: undefined, ctx: ClassFieldDecoratorContext): void {
    if (ctx.kind !== "field") throw new Error(`@${r.name} can only decorate a field`);
    const field = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      const slot = ruleSlot((this as object).constructor, field);
      // addInitializer fires on every construction — dedupe by rule identity.
      if (!slot.rules.includes(r)) slot.rules.push(r);
    });
  };
}

/** Internal: assemble a `Rule` from a test + default message, honoring `message`. */
export function rule(
  name: string,
  test: Rule["test"],
  defaultMessage: (property: string) => string,
  opts?: ConstraintOptions,
): Rule {
  return { name, test, message: opts?.message ? () => opts.message! : defaultMessage };
}

/** Internal: shared null/undefined check. */
export const isNil = (v: unknown): boolean => v === undefined || v === null;

// ── validate / validateOrThrow ──────────────────────────────────────────────────

/** Construct a throwaway instance so field initializers register their rules. */
function ensureCollected(ctor: Function): void {
  if (registry.has(ctor) || probed.has(ctor)) return;
  probed.add(ctor);
  try {
    new (ctor as new () => unknown)();
  } catch {
    /* constructor needs args — rules from plain fields still registered best-effort */
  }
}

/** Run the decorator-registered rules of a DTO class/instance against `object`. */
function validateDto(ctor: Function, object: Record<string, unknown>): ValidationError[] {
  const fields = registry.get(ctor);
  if (!fields) return [];
  const errors: ValidationError[] = [];
  for (const [property, fr] of fields) {
    const value = object[property];
    if (fr.optional && isNil(value)) continue;
    const constraints: Record<string, string> = {};
    for (const r of fr.rules) {
      if (!r.test(value, object)) constraints[r.name] = r.message(property);
    }
    if (Object.keys(constraints).length > 0) errors.push({ property, value, constraints });
  }
  return errors;
}

/**
 * Validate a DTO. Accepts any of:
 *   • a CLASS plus a plain object — `validate(CreateUserDTO, req.body)`
 *   • an INSTANCE — `validate(dto)`
 *   • any [Standard Schema](https://standardschema.dev) (zod, valibot, arktype, …)
 *     plus the input — `validate(zodSchema, req.body)` — so validators are
 *     interchangeable. (Use {@link validateAsync} for async Standard Schemas.)
 * Returns the failed fields; an empty array means valid.
 */
export function validate(target: Function | object | StandardSchemaV1, plain?: object): ValidationError[] {
  if (isStandardSchema(target)) return standardToErrors(target, plain);

  if (typeof target === "function") {
    ensureCollected(target);
    return validateDto(target, (plain ?? {}) as Record<string, unknown>);
  }
  return validateDto((target as object).constructor, target as Record<string, unknown>);
}

/** Like {@link validate} but awaits a Standard Schema that validates asynchronously. */
export async function validateAsync(
  target: Function | object | StandardSchemaV1,
  plain?: object,
): Promise<ValidationError[]> {
  if (isStandardSchema(target)) return standardToErrorsAsync(target, plain);
  return validate(target, plain);
}

/** True when the target passes validation. */
export function isValid(target: Function | object | StandardSchemaV1, plain?: object): boolean {
  return validate(target, plain).length === 0;
}

/** Thrown by `validateOrThrow`; carries the `ValidationError[]`. */
export class SchemaError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super(
      `Validation failed: ${errors
        .map((e) => `${e.property} (${Object.values(e.constraints).join(", ")})`)
        .join("; ")}`,
    );
    this.name = "SchemaError";
  }
}

/** Validate; throw `SchemaError` on any failure (use in a handler/guard). */
export function validateOrThrow(target: Function | object | StandardSchemaV1, plain?: object): void {
  const errors = validate(target, plain);
  if (errors.length > 0) throw new SchemaError(errors);
}

/** The result of a non-throwing parse: the value on success, an `Error` otherwise.
 *  Shared by both the DTO/Standard-Schema {@link parse} below and the functional
 *  `t` schema's `.parse` (see `./env.ts`). */
export type ParseResult<T> = { success: true; value: T } | { success: false; error: Error };

/**
 * Validate without throwing and return a {@link ParseResult}. The success value
 * is the (already-typed) plain input for a class/Standard Schema, or the instance
 * itself when called as `parse(instance)`. A failure carries a {@link SchemaError}.
 *
 *   const r = parse(CreateUserDTO, req.body);
 *   if (r.success) save(r.value); else respond(422, r.error.errors);
 */
export function parse<T = unknown>(
  target: Function | object | StandardSchemaV1,
  plain?: object,
): ParseResult<T> {
  const errors = validate(target, plain);
  if (errors.length > 0) return { success: false, error: new SchemaError(errors) };
  const value = typeof target === "function" || isStandardSchema(target) ? plain : target;
  return { success: true, value: value as T };
}

/** Build a class instance from a plain object (`Object.assign`), for instance-style use. */
export function plainToInstance<T extends object>(Class: new () => T, plain: Partial<T>): T {
  return Object.assign(new Class(), plain);
}
