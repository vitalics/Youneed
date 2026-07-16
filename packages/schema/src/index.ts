// @youneed/schema — class-validator-style DTO validation on STANDARD TC39
// decorators (not the experimental TS ones), with first-class
// [Standard Schema](https://standardschema.dev) interop so validators are
// interchangeable:
//
//   class CreateUserDTO {
//     @IsEmail() email!: string;
//     @IsNotEmpty() @MinLength(8) password!: string;
//     @IsOptional() @IsInt() @Min(18) age?: number;
//   }
//   const errors = validate(CreateUserDTO, req.body);   // ValidationError[]
//   validateOrThrow(CreateUserDTO, req.body);            // throws SchemaError
//   validateOrThrow(zodSchema, req.body);                // …or any Standard Schema
//   const std = toStandardSchema(CreateUserDTO);         // …and expose ours as one
//
// Modules:
//   • ./core.ts        — rule model, registry, `validate` engine
//   • ./decorators.ts  — the `@Is*` / `@Min*` / `@Custom` field decorators
//   • ./standard.ts    — Standard Schema interop (`toStandardSchema`, types)
//   • ./env.ts         — functional value schema (`t`) + the env engine

export * from "./core.ts";
export * from "./decorators.ts";
export * from "./standard.ts";

// The complement to the decorator API above: a chainable, coercing builder used
// by the `defineEnvironmentVariables` implementations in @youneed/dom-provider-env and
// @youneed/server-plugin-env.
export * from "./env.ts";
