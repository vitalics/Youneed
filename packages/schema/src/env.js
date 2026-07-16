// @youneed/schema — functional value schema (`t`) + the environment-variable
// engine that the platform env packages (`@youneed/dom-provider-env`,
// `@youneed/server-plugin-env`) build on.
//
// The decorator API (IsString, MinLength, …) validates already-typed DTO fields.
// `t` is the complementary functional builder: it also *coerces* a raw string
// (every env value arrives as a string) into the target type, then validates it —
// a zod-style, chainable schema:
//
//   import { t } from "@youneed/schema";
//   const port = t.port().default(3000);
//   const mode = t.enum(["dev", "prod"] as const).default("dev");
//   const key  = t.string().min(16).secret();
//
// `defineEnvironmentVariables` itself lives in the platform packages (their
// defaults differ); here we expose the shared engine `parseEnv` + `EnvError` +
// `describeEnv` so both implementations stay identical where it matters.
/** A single env field: knows how to coerce a raw string into `T`, validate it,
 *  and carries the optional/default/secret flags the loader reads. Immutable —
 *  every modifier returns a new schema. */
export class Schema {
    def;
    /** @internal */
    constructor(def) {
        this.def = def;
    }
    // flags the loader reads (named to not clash with the modifier methods)
    get kind() {
        return this.def.kind;
    }
    get isOptional() {
        return this.def.optional;
    }
    get hasDefault() {
        return this.def.hasDefault;
    }
    get defaultValue() {
        return this.def.default;
    }
    get isSecret() {
        return this.def.secret;
    }
    get description() {
        return this.def.description;
    }
    /** Coerce a present raw string into `T` (throws `Error` with a reason; the
     *  message never echoes the raw value, so it's safe to surface for secrets). */
    coerce(raw) {
        return this.def.coerce(raw);
    }
    /** Run every validator against an already-coerced (or default) value. */
    validate(value) {
        for (const v of this.def.validators)
            v(value);
    }
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
    parse(input) {
        if (input === undefined || input === null) {
            if (this.def.hasDefault)
                return { success: true, value: this.def.default };
            if (this.def.optional)
                return { success: true, value: undefined };
            return { success: false, error: new Error("is required") };
        }
        try {
            const value = this.#accept(input);
            this.validate(value);
            return { success: true, value };
        }
        catch (e) {
            return { success: false, error: e instanceof Error ? e : new Error(String(e)) };
        }
    }
    /** Coerce a raw string, or accept an already-typed value whose JS type matches
     *  the schema `kind`. Throws when a structured value is the wrong type. */
    #accept(input) {
        if (typeof input === "string")
            return this.def.coerce(input);
        switch (this.def.kind) {
            case "number":
                if (typeof input === "number" && Number.isFinite(input))
                    return input;
                throw new Error("must be a finite number");
            case "int":
                if (typeof input === "number" && Number.isInteger(input))
                    return input;
                throw new Error("must be an integer");
            case "port":
                if (typeof input === "number" && Number.isInteger(input) && input >= 1 && input <= 65535)
                    return input;
                throw new Error("must be a port (1..65535)");
            case "boolean":
                if (typeof input === "boolean")
                    return input;
                throw new Error("must be a boolean");
            case "json":
                // Already-decoded structured value — nothing to coerce.
                return input;
            default:
                // string / url / enum only accept strings (handled above).
                throw new Error(`must be a ${this.def.kind}`);
        }
    }
    clone(patch) {
        return new Schema({ ...this.def, ...patch });
    }
    /** Allow the key to be absent — widens the inferred type to `T | undefined`. */
    optional() {
        return this.clone({ optional: true });
    }
    /** Value used when the key is missing/empty (already the coerced type). */
    default(value) {
        return this.clone({ hasDefault: true, default: value });
    }
    /** Never echo this value; masked by `describeEnv`. */
    secret() {
        return this.clone({ secret: true });
    }
    /** Human description for tooling/docs. */
    describe(text) {
        return this.clone({ description: text });
    }
    /** Inclusive lower bound — string length, or numeric value. */
    min(n) {
        return this.clone({ validators: [...this.def.validators, bound(this.def.kind, "min", n)] });
    }
    /** Inclusive upper bound — string length, or numeric value. */
    max(n) {
        return this.clone({ validators: [...this.def.validators, bound(this.def.kind, "max", n)] });
    }
    /** Arbitrary check; throws the given message on failure. */
    refine(test, message) {
        const v = (value) => {
            if (!test(value))
                throw new Error(message);
        };
        return this.clone({ validators: [...this.def.validators, v] });
    }
}
/** Inclusive bound validator — length for strings, value for everything numeric. */
function bound(kind, dir, n) {
    const isStr = kind === "string";
    return (value) => {
        const measure = isStr ? value.length : value;
        if (dir === "min" && measure < n)
            throw new Error(isStr ? `length must be >= ${n}` : `must be >= ${n}`);
        if (dir === "max" && measure > n)
            throw new Error(isStr ? `length must be <= ${n}` : `must be <= ${n}`);
    };
}
function make(kind, coerce, validators = []) {
    return new Schema({ kind, coerce, validators, optional: false, hasDefault: false, secret: false });
}
const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);
/** The functional schema builder. Reserved-word keys (`enum`) are fine as
 *  property names. */
export const t = {
    string: () => make("string", (raw) => raw),
    number: () => make("number", (raw) => {
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(n))
            throw new Error("must be a finite number");
        return n;
    }),
    int: () => make("int", (raw) => {
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isInteger(n))
            throw new Error("must be an integer");
        return n;
    }),
    boolean: () => make("boolean", (raw) => {
        const v = raw.trim().toLowerCase();
        if (TRUE.has(v))
            return true;
        if (FALSE.has(v))
            return false;
        throw new Error("must be a boolean (1/true/yes/on or 0/false/no/off)");
    }),
    port: () => make("port", (raw) => {
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isInteger(n) || n < 1 || n > 65535)
            throw new Error("must be a port (1..65535)");
        return n;
    }),
    url: () => make("url", (raw) => {
        try {
            new URL(raw);
        }
        catch {
            throw new Error("must be a valid URL");
        }
        return raw;
    }),
    enum: (values) => make("enum", (raw) => {
        if (!values.includes(raw))
            throw new Error(`must be one of: ${values.join(", ")}`);
        return raw;
    }),
    json: () => make("json", (raw) => {
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new Error("must be valid JSON");
        }
    }),
};
/** Aggregates every invalid/missing variable into a single boot-time error. */
export class EnvError extends Error {
    issues;
    constructor(issues) {
        super(`Invalid environment variables:\n${issues.map((i) => `  - ${i.message}`).join("\n")}`);
        this.name = "EnvError";
        this.issues = issues;
    }
}
/** Coerce + validate every field of `schema` against `source`. Pure: returns the
 *  values plus the collected issues (never throws), so each platform package can
 *  decide how to surface them. Defaults fill in for missing/empty keys; optional
 *  keys without a default resolve to `undefined`. */
export function parseEnv(source, schema) {
    const issues = [];
    const out = {};
    for (const key of Object.keys(schema)) {
        const s = schema[key];
        const raw = source[key];
        const present = raw !== undefined && raw !== "";
        if (!present) {
            if (s.hasDefault) {
                try {
                    s.validate(s.defaultValue);
                    out[key] = s.defaultValue;
                }
                catch (e) {
                    issues.push({ key, message: `${key}: ${reason(e)}` });
                }
            }
            else if (s.isOptional) {
                out[key] = undefined;
            }
            else {
                issues.push({ key, message: `${key} is required` });
            }
            continue;
        }
        try {
            const value = s.coerce(raw);
            s.validate(value);
            out[key] = value;
        }
        catch (e) {
            issues.push({ key, message: `${key}: ${reason(e)}` });
        }
    }
    return { values: out, issues };
}
/** A safe-to-log view of a validated env, masking every `.secret()` key. */
export function describeEnv(values, schema) {
    const out = {};
    for (const key of Object.keys(schema)) {
        out[key] = schema[key].isSecret ? "[REDACTED]" : values[key];
    }
    return out;
}
function reason(e) {
    return e instanceof Error ? e.message : String(e);
}
