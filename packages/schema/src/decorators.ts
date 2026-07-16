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

import { constraint, isNil, rule, ruleSlot, type ConstraintOptions } from "./core.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Skip the other constraints on this field when the value is null/undefined. */
export function IsOptional() {
  return function (_value: undefined, ctx: ClassFieldDecoratorContext): void {
    const field = String(ctx.name);
    ctx.addInitializer(function (this: unknown) {
      ruleSlot((this as object).constructor, field).optional = true;
    });
  };
}

export const IsDefined = (o?: ConstraintOptions) =>
  constraint(rule("isDefined", (v) => !isNil(v), (p) => `${p} must be defined`, o));

export const IsNotEmpty = (o?: ConstraintOptions) =>
  constraint(rule("isNotEmpty", (v) => !isNil(v) && v !== "", (p) => `${p} should not be empty`, o));

export const IsString = (o?: ConstraintOptions) =>
  constraint(rule("isString", (v) => typeof v === "string", (p) => `${p} must be a string`, o));

export const IsNumber = (o?: ConstraintOptions) =>
  constraint(rule("isNumber", (v) => typeof v === "number" && !Number.isNaN(v), (p) => `${p} must be a number`, o));

export const IsInt = (o?: ConstraintOptions) =>
  constraint(rule("isInt", (v) => typeof v === "number" && Number.isInteger(v), (p) => `${p} must be an integer`, o));

export const IsBoolean = (o?: ConstraintOptions) =>
  constraint(rule("isBoolean", (v) => typeof v === "boolean", (p) => `${p} must be a boolean`, o));

export const IsArray = (o?: ConstraintOptions) =>
  constraint(rule("isArray", (v) => Array.isArray(v), (p) => `${p} must be an array`, o));

export const IsEmail = (o?: ConstraintOptions) =>
  constraint(rule("isEmail", (v) => typeof v === "string" && EMAIL.test(v), (p) => `${p} must be an email`, o));

export const IsUrl = (o?: ConstraintOptions) =>
  constraint(
    rule(
      "isUrl",
      (v) => {
        if (typeof v !== "string") return false;
        try {
          const u = new URL(v);
          return u.protocol === "http:" || u.protocol === "https:";
        } catch {
          return false;
        }
      },
      (p) => `${p} must be a URL`,
      o,
    ),
  );

export const MinLength = (min: number, o?: ConstraintOptions) =>
  constraint(
    rule(
      "minLength",
      (v) => (typeof v === "string" || Array.isArray(v)) && v.length >= min,
      (p) => `${p} must be at least ${min} characters`,
      o,
    ),
  );

export const MaxLength = (max: number, o?: ConstraintOptions) =>
  constraint(
    rule(
      "maxLength",
      (v) => (typeof v === "string" || Array.isArray(v)) && v.length <= max,
      (p) => `${p} must be at most ${max} characters`,
      o,
    ),
  );

export const Min = (min: number, o?: ConstraintOptions) =>
  constraint(rule("min", (v) => typeof v === "number" && v >= min, (p) => `${p} must not be less than ${min}`, o));

export const Max = (max: number, o?: ConstraintOptions) =>
  constraint(rule("max", (v) => typeof v === "number" && v <= max, (p) => `${p} must not be greater than ${max}`, o));

export const Matches = (pattern: RegExp, o?: ConstraintOptions) =>
  constraint(rule("matches", (v) => typeof v === "string" && pattern.test(v), (p) => `${p} must match ${pattern}`, o));

export const IsIn = <T>(values: readonly T[], o?: ConstraintOptions) =>
  constraint(rule("isIn", (v) => values.includes(v as T), (p) => `${p} must be one of: ${values.join(", ")}`, o));

/**
 * Escape hatch for a custom rule: `@Custom("isEven", (v) => v % 2 === 0)`.
 * Compose your own domain constraints without leaving the decorator style.
 */
export const Custom = (
  name: string,
  test: (value: unknown, object: unknown) => boolean,
  o?: ConstraintOptions,
) => constraint(rule(name, test, (p) => `${p} failed ${name}`, o));
