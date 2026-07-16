import type { ParseResult } from "./core.ts";
type Coerce<T> = (raw: string) => T;
type Validator = (value: unknown) => void;
type Kind = "string" | "number" | "int" | "boolean" | "port" | "url" | "enum" | "json";
interface SchemaDef<T> {
    kind: Kind;
    coerce: Coerce<T>;
    validators: Validator[];
    optional: boolean;
    hasDefault: boolean;
    default?: T;
    secret: boolean;
    description?: string;
}
/** A single env field: knows how to coerce a raw string into `T`, validate it,
 *  and carries the optional/default/secret flags the loader reads. Immutable —
 *  every modifier returns a new schema. */
export declare class Schema<T> {
    #private;
    private readonly def;
    /** @internal */
    constructor(def: SchemaDef<T>);
    get kind(): Kind;
    get isOptional(): boolean;
    get hasDefault(): boolean;
    get defaultValue(): T | undefined;
    get isSecret(): boolean;
    get description(): string | undefined;
    /** Coerce a present raw string into `T` (throws `Error` with a reason; the
     *  message never echoes the raw value, so it's safe to surface for secrets). */
    coerce(raw: string): T;
    /** Run every validator against an already-coerced (or default) value. */
    validate(value: T): void;
    /**
     * Validate an arbitrary input against this schema and return a result object
     * instead of throwing — the complement to {@link coerce}/{@link validate}:
     *
     *   const r = t.int().min(0).parse(42);
     *   if (r.success) use(r.value); else report(r.error);
     *
     * A STRING input is coerced (env-style — every env value arrives as a string);
     * an already-typed input (e.g. a number decoded from JSON) is accepted as-is
     * after a runtime type check against the schema `kind`. `undefined`/`null`
     * resolves to the default, to `undefined` for `.optional()`, or fails.
     */
    parse(input: unknown): ParseResult<T>;
    private clone;
    /** Allow the key to be absent — widens the inferred type to `T | undefined`. */
    optional(): Schema<T | undefined>;
    /** Value used when the key is missing/empty (already the coerced type). */
    default(value: NonNullable<T>): Schema<NonNullable<T>>;
    /** Never echo this value; masked by `describeEnv`. */
    secret(): Schema<T>;
    /** Human description for tooling/docs. */
    describe(text: string): Schema<T>;
    /** Inclusive lower bound — string length, or numeric value. */
    min(n: number): Schema<T>;
    /** Inclusive upper bound — string length, or numeric value. */
    max(n: number): Schema<T>;
    /** Arbitrary check; throws the given message on failure. */
    refine(test: (value: T) => boolean, message: string): Schema<T>;
}
/** The functional schema builder. Reserved-word keys (`enum`) are fine as
 *  property names. */
export declare const t: {
    string: () => Schema<string>;
    number: () => Schema<number>;
    int: () => Schema<number>;
    boolean: () => Schema<boolean>;
    port: () => Schema<number>;
    url: () => Schema<string>;
    enum: <const V extends readonly string[]>(values: V) => Schema<V[number]>;
    json: <T = unknown>() => Schema<T>;
};
/** The resolved type of a schema. `.optional()` widens to `| undefined`. */
export type Infer<S> = S extends Schema<infer T> ? T : never;
/** The shape of a record of schemas (an env spec). */
export type EnvSchema = Record<string, Schema<unknown>>;
/** The validated env object inferred from a spec. */
export type EnvOf<Sc extends EnvSchema> = {
    [K in keyof Sc]: Infer<Sc[K]>;
};
/** A raw string source — `process.env`, `import.meta.env`, a `.env` map, etc. */
export interface EnvSource {
    [key: string]: string | undefined;
}
export interface EnvIssue {
    key: string;
    message: string;
}
/** Aggregates every invalid/missing variable into a single boot-time error. */
export declare class EnvError extends Error {
    readonly issues: EnvIssue[];
    constructor(issues: EnvIssue[]);
}
/** Coerce + validate every field of `schema` against `source`. Pure: returns the
 *  values plus the collected issues (never throws), so each platform package can
 *  decide how to surface them. Defaults fill in for missing/empty keys; optional
 *  keys without a default resolve to `undefined`. */
export declare function parseEnv<Sc extends EnvSchema>(source: EnvSource, schema: Sc): {
    values: EnvOf<Sc>;
    issues: EnvIssue[];
};
/** A safe-to-log view of a validated env, masking every `.secret()` key. */
export declare function describeEnv<Sc extends EnvSchema>(values: EnvOf<Sc>, schema: Sc): Record<string, unknown>;
export {};
