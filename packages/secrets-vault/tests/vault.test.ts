// Run: pnpm --filter @youneed/secrets-vault test
// Verifies the Vault KV v2 adapter against an injected fake fetch — no network.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createSecrets } from "@youneed/secrets";
import { vaultSecrets } from "../src/index.ts";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** Builds a fake `fetch` that answers from a map of `url → KV v2 body` and records calls. */
function fakeFetch(routes: Record<string, unknown>) {
  const calls: Recorded[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init?.method ?? "GET",
      headers: (init?.headers as Record<string, string>) ?? {},
    });
    if (!(u in routes)) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(routes[u]), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ADDR = "https://vault:8200";
const opts = (fetch: typeof globalThis.fetch) => ({ address: ADDR, token: "s.tok123", fetch });

class VaultSuite extends Test({ name: "@youneed/secrets-vault" }) {
  @Test.it("get() on a single-`value` path returns the value") async single() {
    const { fn } = fakeFetch({
      [`${ADDR}/v1/secret/data/db`]: { data: { data: { value: "pg://x" } } },
    });
    const p = vaultSecrets(opts(fn));
    expect(await p.get("db")).toBe("pg://x");
  }

  @Test.it("get() on a multi-field path returns the whole map as JSON") async multi() {
    const { fn } = fakeFetch({
      [`${ADDR}/v1/secret/data/db`]: { data: { data: { host: "h", port: "5432" } } },
    });
    const p = vaultSecrets(opts(fn));
    expect(await p.get("db")).toBe(JSON.stringify({ host: "h", port: "5432" }));
  }

  @Test.it("get('path#field') selects a single field") async field() {
    const { fn } = fakeFetch({
      [`${ADDR}/v1/secret/data/db`]: { data: { data: { host: "h", password: "s3cret" } } },
    });
    const p = vaultSecrets(opts(fn));
    expect(await p.get("db#password")).toBe("s3cret");
    expect(await p.get("db#missing")).toBe(undefined);
  }

  @Test.it("404 → undefined") async notFound() {
    const { fn } = fakeFetch({}); // every path 404s
    const p = vaultSecrets(opts(fn));
    expect(await p.get("nope")).toBe(undefined);
  }

  @Test.it("list() maps data.keys and strips trailing slashes (names only)") async list() {
    const { fn } = fakeFetch({
      [`${ADDR}/v1/secret/metadata?list=true`]: { data: { keys: ["db", "stripe", "nested/"] } },
    });
    const p = vaultSecrets(opts(fn));
    expect(await p.list!()).toEqual(["db", "stripe", "nested"]);
  }

  @Test.it("uses the correct URL, method and X-Vault-Token header") async wire() {
    const { fn, calls } = fakeFetch({
      [`${ADDR}/v1/secret/data/db`]: { data: { data: { value: "v" } } },
      [`${ADDR}/v1/secret/metadata?list=true`]: { data: { keys: ["db"] } },
    });
    const p = vaultSecrets({ address: ADDR, token: "s.tok123", namespace: "team-a", fetch: fn });
    await p.get("db");
    await p.list!();

    expect(calls[0].url).toBe(`${ADDR}/v1/secret/data/db`);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers["X-Vault-Token"]).toBe("s.tok123");
    expect(calls[0].headers["X-Vault-Namespace"]).toBe("team-a");

    expect(calls[1].url).toBe(`${ADDR}/v1/secret/metadata?list=true`);
    expect(calls[1].method).toBe("LIST");
    expect(calls[1].headers["X-Vault-Token"]).toBe("s.tok123");
  }

  @Test.it("honours a custom mount") async mount() {
    const { fn, calls } = fakeFetch({
      [`${ADDR}/v1/kv/data/db`]: { data: { data: { value: "v" } } },
    });
    const p = vaultSecrets({ address: `${ADDR}/`, token: "t", mount: "kv", fetch: fn });
    expect(await p.get("db")).toBe("v");
    expect(calls[0].url).toBe(`${ADDR}/v1/kv/data/db`); // trailing slash on address trimmed
  }

  @Test.it("plugs into createSecrets() + require()") async engine() {
    const { fn } = fakeFetch({
      [`${ADDR}/v1/secret/data/DATABASE_URL`]: { data: { data: { value: "pg://prod" } } },
    });
    const secrets = createSecrets(vaultSecrets(opts(fn)));
    expect(secrets.backend).toBe("vault");
    expect(await secrets.require("DATABASE_URL")).toBe("pg://prod");
    await secrets.close(); // exercises close() no-op
  }
}

await TestApplication().addTests(VaultSuite).reporter(new ConsoleReporter()).run();
