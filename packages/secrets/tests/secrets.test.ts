// Run: pnpm --filter @youneed/secrets test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createSecrets, Secrets, EnvSecrets, MemorySecrets, type SecretsProvider } from "../src/index.ts";

class SecretsSuite extends Test({ name: "@youneed/secrets" }) {
  @Test.it("get/require from a provider") async get() {
    const s = createSecrets(new MemorySecrets({ DB: "pg://x" }));
    expect(await s.get("DB")).toBe("pg://x");
    expect(await s.require("DB")).toBe("pg://x");
    expect(await s.get("MISSING")).toBe(undefined);
  }

  @Test.it("require throws on a missing/empty secret") async requireThrows() {
    const s = createSecrets(new MemorySecrets({ EMPTY: "" }));
    let threw = 0;
    try { await s.require("NOPE"); } catch { threw++; }
    try { await s.require("EMPTY"); } catch { threw++; }
    expect(threw).toBe(2);
  }

  @Test.it("resolve() expands secret:// refs, passes others through") async resolve() {
    const s = createSecrets(new MemorySecrets({ TOKEN: "abc" }));
    expect(await s.resolve("secret://TOKEN")).toBe("abc");
    expect(await s.resolve("literal")).toBe("literal");
  }

  @Test.it("resolveAll deep-resolves a config object") async resolveAll() {
    const s = createSecrets(new MemorySecrets({ PW: "s3cret", KEY: "k1" }));
    const cfg = await s.resolveAll({ db: { password: "secret://PW" }, list: ["secret://KEY", "plain"], port: 5432 });
    expect(cfg).toEqual({ db: { password: "s3cret" }, list: ["k1", "plain"], port: 5432 });
  }

  @Test.it("caches within the TTL, refetches after") async cache() {
    let clock = 0;
    let calls = 0;
    const provider: SecretsProvider = { name: "counting", async get() { calls++; return "v" + calls; } };
    const s = new Secrets(provider, { cacheTtlMs: 100, now: () => clock });
    expect(await s.get("K")).toBe("v1");
    expect(await s.get("K")).toBe("v1"); // cached
    expect(calls).toBe(1);
    clock = 150; // past TTL
    expect(await s.get("K")).toBe("v2");
    expect(calls).toBe(2);
  }

  @Test.it("prefix namespaces keys against the provider") async prefix() {
    const mem = new MemorySecrets({ "app/DB": "x" });
    const s = new Secrets(mem, { prefix: "app/" });
    expect(await s.get("DB")).toBe("x");
  }

  @Test.it("getMany fetches a batch") async many() {
    const s = createSecrets(new MemorySecrets({ A: "1", B: "2" }));
    expect(await s.getMany(["A", "B", "C"])).toEqual({ A: "1", B: "2", C: undefined });
  }

  @Test.it("list returns names only") async list() {
    const s = createSecrets(new MemorySecrets({ A: "1", B: "2" }));
    expect((await s.list()).sort()).toEqual(["A", "B"]);
  }

  @Test.it("EnvSecrets reads an injected env record") async env() {
    const s = createSecrets(new EnvSecrets({ PORT: "3000" }));
    expect(await s.get("PORT")).toBe("3000");
    expect(s.backend).toBe("env");
  }
}

await TestApplication().addTests(SecretsSuite).reporter(new ConsoleReporter()).run();
