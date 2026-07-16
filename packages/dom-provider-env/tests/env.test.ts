// @youneed/dom-provider-env: coerce + validate a string source against a `t` schema,
// fail fast on issues, and support a synchronous or asynchronous (lazy) source.
// Run: pnpm --filter @youneed/dom-provider-env test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { defineEnvironmentVariables, t, EnvError } from "../src/index.ts";

const schema = {
  API_URL: t.url(),
  FEATURE_X: t.boolean().default(false),
  RETRIES: t.int().min(0).max(5).optional(),
  MODE: t.enum(["dev", "prod"] as const).default("dev"),
};

class DomEnvTest extends Test({ name: "@youneed/dom-provider-env" }) {
  @Test.it("coerces + validates a synchronous source") sync() {
    const env = defineEnvironmentVariables(
      { API_URL: "https://api.example.com", FEATURE_X: "yes", RETRIES: "3" },
      { schema },
    );
    expect(env.API_URL).toBe("https://api.example.com");
    expect(env.FEATURE_X).toBe(true);
    expect(env.RETRIES).toBe(3);
    expect(env.MODE).toBe("dev"); // default
  }

  @Test.it("applies defaults and omits optional-missing") defaults() {
    const env = defineEnvironmentVariables({ API_URL: "https://x.io" }, { schema });
    expect(env.FEATURE_X).toBe(false);
    expect(env.MODE).toBe("dev");
    expect(env.RETRIES).toBe(undefined);
  }

  @Test.it("fails fast, aggregating every issue") failFast() {
    let err: EnvError | undefined;
    try {
      defineEnvironmentVariables({ API_URL: "not-a-url", RETRIES: "99" }, { schema });
    } catch (e) {
      err = e as EnvError;
    }
    expect(err instanceof EnvError).toBe(true);
    expect(err!.issues.length).toBe(2); // API_URL invalid + RETRIES out of range
    expect(err!.issues.some((i) => i.key === "API_URL")).toBe(true);
    expect(err!.issues.some((i) => i.key === "RETRIES")).toBe(true);
  }

  @Test.it("the result is frozen") frozen() {
    const env = defineEnvironmentVariables({ API_URL: "https://x.io" }, { schema });
    expect(Object.isFrozen(env)).toBe(true);
  }

  @Test.it("awaits a Promise source") asyncPromise() {
    const p = defineEnvironmentVariables(Promise.resolve({ API_URL: "https://async.io" }), { schema });
    expect(typeof (p as Promise<unknown>).then).toBe("function");
    return p.then((env) => {
      expect(env.API_URL).toBe("https://async.io");
      expect(env.FEATURE_X).toBe(false);
    });
  }

  @Test.it("calls a lazy source function (async)") asyncFn() {
    return defineEnvironmentVariables(async () => ({ API_URL: "https://lazy.io" }), { schema }).then((env) => {
      expect(env.API_URL).toBe("https://lazy.io");
    });
  }

  @Test.it("calls a lazy source function (sync)") syncFn() {
    const env = defineEnvironmentVariables(() => ({ API_URL: "https://fn.io" }), { schema });
    expect(env.API_URL).toBe("https://fn.io");
  }
}

await TestApplication().addTests(DomEnvTest).reporter(new ConsoleReporter()).run();
