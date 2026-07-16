// @youneed/server-plugin-env: coerce + validate process.env (or an explicit
// source) against a `t` schema, fail fast, redact secrets, and expose a plugin.
// Run: pnpm --filter @youneed/server-plugin-env test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { defineEnvironmentVariables, environment, describeEnv, t, EnvError } from "../src/index.ts";

const schema = {
  PORT: t.port().default(3000),
  DATABASE_URL: t.url().secret(),
  NODE_ENV: t.enum(["development", "production", "test"] as const).default("development"),
};

class ServerEnvTest extends Test({ name: "@youneed/server-plugin-env" }) {
  @Test.it("coerces + validates an explicit source") explicit() {
    const env = defineEnvironmentVariables(
      { PORT: "8080", DATABASE_URL: "postgres://localhost/db" },
      { schema },
    );
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_URL).toBe("postgres://localhost/db");
    expect(env.NODE_ENV).toBe("development"); // default
  }

  @Test.it("defaults to process.env") processEnv() {
    process.env.SP_ENV_TOKEN = "abc123";
    const env = defineEnvironmentVariables(undefined, { schema: { SP_ENV_TOKEN: t.string() } });
    expect(env.SP_ENV_TOKEN).toBe("abc123");
    delete process.env.SP_ENV_TOKEN;
  }

  @Test.it("fails fast on a missing required var") failFast() {
    let err: EnvError | undefined;
    try {
      defineEnvironmentVariables({ PORT: "8080" }, { schema }); // DATABASE_URL missing
    } catch (e) {
      err = e as EnvError;
    }
    expect(err instanceof EnvError).toBe(true);
    expect(err!.issues.some((i) => i.key === "DATABASE_URL")).toBe(true);
  }

  @Test.it("describeEnv masks secret fields") redact() {
    const env = defineEnvironmentVariables(
      { PORT: "8080", DATABASE_URL: "postgres://localhost/db" },
      { schema },
    );
    const view = describeEnv(env, schema);
    expect(view.DATABASE_URL).toBe("[REDACTED]");
    expect(view.PORT).toBe(8080);
  }

  @Test.it("environment() is a ServerPlugin exposing validated values") plugin() {
    const plugin = environment({
      source: { PORT: "9090", DATABASE_URL: "https://db.example.com" },
      schema,
    });
    expect(plugin.name).toBe("env");
    expect(plugin.values.PORT).toBe(9090);
    // inspect() is the redacted devtools view
    const inspected = plugin.inspect!() as Record<string, unknown>;
    expect(inspected.DATABASE_URL).toBe("[REDACTED]");
    expect(inspected.PORT).toBe(9090);
  }

  @Test.it("environment() validates eagerly (throws at construction)") pluginFailFast() {
    let threw = false;
    try {
      environment({ source: { PORT: "70000", DATABASE_URL: "https://db.io" }, schema });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  }
}

await TestApplication().addTests(ServerEnvTest).reporter(new ConsoleReporter()).run();
