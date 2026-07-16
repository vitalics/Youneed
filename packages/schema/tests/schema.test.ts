// Run: pnpm --filter @youneed/schema test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import {
  validate,
  validateOrThrow,
  isValid,
  plainToInstance,
  SchemaError,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsInt,
  IsOptional,
  MinLength,
  Min,
  Max,
  IsIn,
  Matches,
  Custom,
  validateAsync,
  toStandardSchema,
  isStandardSchema,
  type StandardSchemaV1,
} from "../src/index.ts";

class CreateUserDTO {
  @IsEmail() email!: string;
  @IsNotEmpty() @MinLength(8) password!: string;
  @IsOptional() @IsInt() @Min(18) @Max(120) age?: number;
  @IsIn(["admin", "user"] as const) role!: string;
}

class Custom1 {
  @Custom("isEven", (v) => typeof v === "number" && v % 2 === 0) n!: number;
}

class Msg1 {
  @IsNotEmpty({ message: "name is required" }) name!: string;
}

class Inherited extends CreateUserDTO {
  @Matches(/^\+\d+$/) phone!: string;
}

class SchemaSuite extends Test({ name: "@youneed/schema" }) {
  @Test.it("valid DTO → no errors (validate by class + plain object)") valid() {
    const errors = validate(CreateUserDTO, {
      email: "ada@example.com",
      password: "hunter2!",
      age: 30,
      role: "admin",
    });
    expect(errors.length).toBe(0);
    expect(isValid(CreateUserDTO, { email: "ada@example.com", password: "hunter2!", role: "user" })).toBeTruthy();
  }

  @Test.it("collects every failed field in class-validator shape") invalid() {
    const errors = validate(CreateUserDTO, { email: "nope", password: "short", role: "root" });
    const byProp = Object.fromEntries(errors.map((e) => [e.property, e]));
    expect(errors.length).toBe(3); // email, password, role (age optional & absent)
    expect(byProp.email.constraints.isEmail).toBe("email must be an email");
    expect(byProp.password.constraints.minLength).toBe("password must be at least 8 characters");
    expect(byProp.role.constraints.isIn.includes("admin")).toBeTruthy();
  }

  @Test.it("@IsOptional skips rules when the value is absent, enforces when present") optional() {
    expect(validate(CreateUserDTO, { email: "ada@example.com", password: "hunter2!", role: "user" }).length).toBe(0);
    const tooYoung = validate(CreateUserDTO, { email: "ada@example.com", password: "hunter2!", role: "user", age: 5 });
    expect(tooYoung.length).toBe(1);
    expect(tooYoung[0].constraints.min).toBeTruthy();
  }

  @Test.it("validates an INSTANCE too (constructor registered the rules)") instanceForm() {
    const dto = plainToInstance(CreateUserDTO, { email: "x", password: "12345678", role: "user" });
    const errors = validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe("email");
  }

  @Test.it("validateOrThrow throws SchemaError carrying the errors") throws() {
    let caught: SchemaError | undefined;
    try {
      validateOrThrow(CreateUserDTO, { email: "bad", password: "short", role: "user" });
    } catch (e) {
      caught = e as SchemaError;
    }
    expect(caught instanceof SchemaError).toBeTruthy();
    expect(caught!.errors.length).toBe(2); // email + password
    expect(caught!.message.includes("email")).toBeTruthy();
  }

  @Test.it("custom message override") customMessage() {
    const errors = validate(Msg1, {});
    expect(errors[0].constraints.isNotEmpty).toBe("name is required");
  }

  @Test.it("@Custom rule") customRule() {
    expect(validate(Custom1, { n: 4 }).length).toBe(0);
    const odd = validate(Custom1, { n: 3 });
    expect(odd[0].constraints.isEven).toBeTruthy();
  }

  @Test.it("inherited DTO validates parent + child fields") inheritance() {
    const errors = validate(Inherited, {
      email: "ada@example.com",
      password: "hunter2!",
      role: "user",
      phone: "not-a-phone",
    });
    // only phone fails (parent fields valid)
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe("phone");
  }
}

// ── Standard Schema interop ───────────────────────────────────────────────────

// A minimal fake of a zod/valibot-style Standard Schema (sync), used to prove the
// CONSUME direction without a real dependency.
const evenSchema: StandardSchemaV1<unknown, number> = {
  "~standard": {
    version: 1,
    vendor: "fake",
    validate: (v) =>
      typeof v === "number" && v % 2 === 0 ? { value: v } : { issues: [{ message: "must be even", path: ["n"] }] },
  },
};
const asyncSchema: StandardSchemaV1<unknown, string> = {
  "~standard": {
    version: 1,
    vendor: "fake-async",
    validate: async (v) => (typeof v === "string" ? { value: v } : { issues: [{ message: "must be a string" }] }),
  },
};

class StandardSuite extends Test({ name: "@youneed/schema · standard schema" }) {
  @Test.it("toStandardSchema EXPOSES a DTO as a Standard Schema") expose() {
    const std = toStandardSchema(CreateUserDTO);
    expect(std["~standard"].version).toBe(1);
    expect(isStandardSchema(std)).toBe(true);
    const ok = std["~standard"].validate({ email: "ada@x.dev", password: "hunter2!", role: "user" });
    expect("value" in ok && !("issues" in ok && ok.issues)).toBe(true);
    const bad = std["~standard"].validate({ email: "nope", password: "x", role: "ghost" });
    const issues = "issues" in bad ? bad.issues! : [];
    expect(issues.length > 0).toBe(true);
    expect(issues.some((i) => i.path?.[0] === "email")).toBe(true);
  }

  @Test.it("validate CONSUMES any Standard Schema (interchangeable)") consume() {
    expect(validate(evenSchema, 4).length).toBe(0);
    const errs = validate(evenSchema, 3);
    expect(errs.length).toBe(1);
    expect(errs[0].property).toBe("n");
    expect(Object.values(errs[0].constraints)[0]).toBe("must be even");
  }

  @Test.it("validateOrThrow + isValid accept a Standard Schema") gate() {
    expect(isValid(evenSchema, 2)).toBe(true);
    let threw = false;
    try {
      validateOrThrow(evenSchema, 5);
    } catch (e) {
      threw = e instanceof SchemaError;
    }
    expect(threw).toBe(true);
  }

  @Test.it("round-trip: our DTO → Standard Schema → consumed by validate()") roundtrip() {
    const std = toStandardSchema(CreateUserDTO);
    expect(validate(std, { email: "ada@x.dev", password: "hunter2!", role: "user" }).length).toBe(0);
    expect(validate(std, { email: "bad", password: "hunter2!", role: "user" })[0].property).toBe("email");
  }

  @Test.it("validateAsync awaits an async Standard Schema") async asyncStd() {
    expect((await validateAsync(asyncSchema, "ok")).length).toBe(0);
    expect((await validateAsync(asyncSchema, 42)).length).toBe(1);
  }

  @Test.it("sync validate throws on an async Standard Schema") syncOnAsync() {
    let threw = false;
    try {
      validate(asyncSchema, 1);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  }
}

await TestApplication().addTests(SchemaSuite).addTests(StandardSuite).reporter(new ConsoleReporter()).run();
