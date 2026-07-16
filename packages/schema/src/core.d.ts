import { type StandardSchemaV1 } from "./standard.ts";
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
/** Internal: the rule slot for `field` on `ctor` (used by the decorators). */
export declare function ruleSlot(ctor: Function, field: string): FieldRules;
/** Internal: build the field decorator that registers `rule` on first construction. */
export declare function constraint(r: Rule): (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
/** Internal: assemble a `Rule` from a test + default message, honoring `message`. */
export declare function rule(name: string, test: Rule["test"], defaultMessage: (property: string) => string, opts?: ConstraintOptions): Rule;
/** Internal: shared null/undefined check. */
export declare const isNil: (v: unknown) => boolean;
/**
 * Validate a DTO. Accepts any of:
 *   • a CLASS plus a plain object — `validate(CreateUserDTO, req.body)`
 *   • an INSTANCE — `validate(dto)`
 *   • any [Standard Schema](https://standardschema.dev) (zod, valibot, arktype, …)
 *     plus the input — `validate(zodSchema, req.body)` — so validators are
 *     interchangeable. (Use {@link validateAsync} for async Standard Schemas.)
 * Returns the failed fields; an empty array means valid.
 */
export declare function validate(target: Function | object | StandardSchemaV1, plain?: object): ValidationError[];
/** Like {@link validate} but awaits a Standard Schema that validates asynchronously. */
export declare function validateAsync(target: Function | object | StandardSchemaV1, plain?: object): Promise<ValidationError[]>;
/** True when the target passes validation. */
export declare function isValid(target: Function | object | StandardSchemaV1, plain?: object): boolean;
/** Thrown by `validateOrThrow`; carries the `ValidationError[]`. */
export declare class SchemaError extends Error {
    readonly errors: ValidationError[];
    constructor(errors: ValidationError[]);
}
/** Validate; throw `SchemaError` on any failure (use in a handler/guard). */
export declare function validateOrThrow(target: Function | object | StandardSchemaV1, plain?: object): void;
/** The result of a non-throwing parse: the value on success, an `Error` otherwise.
 *  Shared by both the DTO/Standard-Schema {@link parse} below and the functional
 *  `t` schema's `.parse` (see `./env.ts`). */
export type ParseResult<T> = {
    success: true;
    value: T;
} | {
    success: false;
    error: Error;
};
/**
 * Validate without throwing and return a {@link ParseResult}. The success value
 * is the (already-typed) plain input for a class/Standard Schema, or the instance
 * itself when called as `parse(instance)`. A failure carries a {@link SchemaError}.
 *
 *   const r = parse(CreateUserDTO, req.body);
 *   if (r.success) save(r.value); else respond(422, r.error.errors);
 */
export declare function parse<T = unknown>(target: Function | object | StandardSchemaV1, plain?: object): ParseResult<T>;
/** Build a class instance from a plain object (`Object.assign`), for instance-style use. */
export declare function plainToInstance<T extends object>(Class: new () => T, plain: Partial<T>): T;
export {};
