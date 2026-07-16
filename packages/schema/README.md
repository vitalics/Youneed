# @youneed/schema

`class-validator`-style DTO validation, but on **standard TC39 decorators** — no
`reflect-metadata`, no `emitDecoratorMetadata`, no `experimentalDecorators`. The
exact same decorated class runs in TypeScript **and** plain JS.

```ts
import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsInt, Min, validate } from "@youneed/schema";

class CreateUserDTO {
  @IsEmail() email!: string;
  @IsNotEmpty() @MinLength(8) password!: string;
  @IsOptional() @IsInt() @Min(18) age?: number;
}

const errors = validate(CreateUserDTO, await req.json());
// [] when valid, else:
// [{ property: "email", value: "nope", constraints: { isEmail: "email must be an email" } }]
```

## Validate

```ts
validate(CreateUserDTO, plainObject) // ValidationError[] (class + plain object)
validate(dtoInstance)                // ValidationError[] (an instance)
isValid(CreateUserDTO, plainObject)  // boolean
validateOrThrow(CreateUserDTO, body) // throws SchemaError (carries .errors)
plainToInstance(CreateUserDTO, body) // build an instance from a plain object
```

`ValidationError` mirrors class-validator: `{ property, value, constraints }`,
where `constraints` is `{ [ruleName]: message }`.

## Constraints

| decorator | passes when |
| --- | --- |
| `@IsDefined()` | not null/undefined |
| `@IsNotEmpty()` | not null/undefined and not `""` |
| `@IsOptional()` | *modifier* — skip the field's other rules when it's null/undefined |
| `@IsString()` · `@IsNumber()` · `@IsInt()` · `@IsBoolean()` · `@IsArray()` | type matches |
| `@IsEmail()` · `@IsUrl()` | valid email / http(s) URL |
| `@MinLength(n)` · `@MaxLength(n)` | string/array length in range |
| `@Min(n)` · `@Max(n)` | number in range |
| `@Matches(/re/)` | string matches the regexp |
| `@IsIn([...])` | value is one of the list |
| `@Custom(name, test)` | your own predicate |

Every decorator takes an optional `{ message }` to override the default text:

```ts
class LoginDTO {
  @IsNotEmpty({ message: "password is required" }) password!: string;
}
```

Compose freely — multiple decorators on one field all apply, and subclasses
inherit their parent's constraints.

## Why TC39 decorators

`class-validator` relies on `reflect-metadata` + the legacy experimental
decorators (`experimentalDecorators` + `emitDecoratorMetadata`), which only exist
under TypeScript. `@youneed/schema` uses the Stage-3 standard decorators that ship
in modern engines and transpile without any metadata runtime — so a compiled-to-JS
DTO validates identically.

> Implementation note: TS/esbuild only attach `Symbol.metadata` to a class that
> *also* carries a class decorator, so a fields-only DTO would lose it. Each field
> decorator instead registers its rules via `context.addInitializer` into a
> constructor-keyed `WeakMap`; `validate(Class, …)` constructs one throwaway
> instance to trigger that, then checks your plain object.

## Use it in a handler / guard

```ts
import { validateOrThrow } from "@youneed/schema";

app.post("/users", (ctx) => {
  validateOrThrow(CreateUserDTO, ctx.body); // throws SchemaError → map to 422
  // …ctx.body is now known-good
});
```
