// @youneed/schema decorators — the class-validator-style field decorators
// (`@IsEmail`, `@IsArray`, `@MinLength`, …) built on STANDARD TC39 decorators
// (not the experimental TS ones). No `reflect-metadata`, no
// `emitDecoratorMetadata`, no `experimentalDecorators` — the exact same code
// runs in plain JS:
//
//   class CreateUserDTO {
//     @IsEmail() email!: string;
//     @IsNotEmpty() @MinLength(8) password!: string;
//     @IsOptional() @IsInt() @Min(18) age?: number;
//   }
//   const errors = validate(CreateUserDTO, req.body);   // ValidationError[]
//
// Each decorator registers its rule into the constructor-keyed registry in
// `./core.ts` via `context.addInitializer`.
import { constraint, isNil, rule, ruleSlot } from "./core.js";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Skip the other constraints on this field when the value is null/undefined. */
export function IsOptional() {
    return function (_value, ctx) {
        const field = String(ctx.name);
        ctx.addInitializer(function () {
            ruleSlot(this.constructor, field).optional = true;
        });
    };
}
export const IsDefined = (o) => constraint(rule("isDefined", (v) => !isNil(v), (p) => `${p} must be defined`, o));
export const IsNotEmpty = (o) => constraint(rule("isNotEmpty", (v) => !isNil(v) && v !== "", (p) => `${p} should not be empty`, o));
export const IsString = (o) => constraint(rule("isString", (v) => typeof v === "string", (p) => `${p} must be a string`, o));
export const IsNumber = (o) => constraint(rule("isNumber", (v) => typeof v === "number" && !Number.isNaN(v), (p) => `${p} must be a number`, o));
export const IsInt = (o) => constraint(rule("isInt", (v) => typeof v === "number" && Number.isInteger(v), (p) => `${p} must be an integer`, o));
export const IsBoolean = (o) => constraint(rule("isBoolean", (v) => typeof v === "boolean", (p) => `${p} must be a boolean`, o));
export const IsArray = (o) => constraint(rule("isArray", (v) => Array.isArray(v), (p) => `${p} must be an array`, o));
export const IsEmail = (o) => constraint(rule("isEmail", (v) => typeof v === "string" && EMAIL.test(v), (p) => `${p} must be an email`, o));
export const IsUrl = (o) => constraint(rule("isUrl", (v) => {
    if (typeof v !== "string")
        return false;
    try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
    }
    catch {
        return false;
    }
}, (p) => `${p} must be a URL`, o));
export const MinLength = (min, o) => constraint(rule("minLength", (v) => (typeof v === "string" || Array.isArray(v)) && v.length >= min, (p) => `${p} must be at least ${min} characters`, o));
export const MaxLength = (max, o) => constraint(rule("maxLength", (v) => (typeof v === "string" || Array.isArray(v)) && v.length <= max, (p) => `${p} must be at most ${max} characters`, o));
export const Min = (min, o) => constraint(rule("min", (v) => typeof v === "number" && v >= min, (p) => `${p} must not be less than ${min}`, o));
export const Max = (max, o) => constraint(rule("max", (v) => typeof v === "number" && v <= max, (p) => `${p} must not be greater than ${max}`, o));
export const Matches = (pattern, o) => constraint(rule("matches", (v) => typeof v === "string" && pattern.test(v), (p) => `${p} must match ${pattern}`, o));
export const IsIn = (values, o) => constraint(rule("isIn", (v) => values.includes(v), (p) => `${p} must be one of: ${values.join(", ")}`, o));
/**
 * Escape hatch for a custom rule: `@Custom("isEven", (v) => v % 2 === 0)`.
 * Compose your own domain constraints without leaving the decorator style.
 */
export const Custom = (name, test, o) => constraint(rule(name, test, (p) => `${p} failed ${name}`, o));
