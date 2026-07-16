import { type ConstraintOptions } from "./core.ts";
/** Skip the other constraints on this field when the value is null/undefined. */
export declare function IsOptional(): (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsDefined: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsNotEmpty: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsString: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsNumber: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsInt: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsBoolean: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsArray: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsEmail: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsUrl: (o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const MinLength: (min: number, o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const MaxLength: (max: number, o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const Min: (min: number, o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const Max: (max: number, o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const Matches: (pattern: RegExp, o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
export declare const IsIn: <T>(values: readonly T[], o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
/**
 * Escape hatch for a custom rule: `@Custom("isEven", (v) => v % 2 === 0)`.
 * Compose your own domain constraints without leaving the decorator style.
 */
export declare const Custom: (name: string, test: (value: unknown, object: unknown) => boolean, o?: ConstraintOptions) => (_value: undefined, ctx: ClassFieldDecoratorContext) => void;
