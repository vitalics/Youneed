// Run: pnpm --filter @youneed/server-plugin-secrets test
// Exercises the masking helper, the presence probe, the controller provider, and
// the plugin routes via a fake AppBuilder that captures handlers — no real HTTP
// server. The load-bearing assertions verify the raw secret VALUE never leaks
// over /names, /health, or the masked preview.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createSecrets, MemorySecrets } from "@youneed/secrets";
import { secrets, secretsProvider, secretHealth, maskSecret } from "../src/index.ts";

const STRIPE = "sk_live_ABCDEFGHIJKLMNOP"; // the value that must NEVER escape
function engine() {
  return createSecrets(new MemorySecrets({ STRIPE_KEY: STRIPE, EMPTY: "", DB_URL: "postgres://x" }), { cacheTtlMs: 0 });
}

// A tiny fake AppBuilder that captures the routes a plugin's setup() registers.
type Handler = (ctx: any) => any;
function fakeApp() {
  const routes = new Map<string, Handler>();
  return {
    get: (path: string, h: Handler) => routes.set(`GET ${path}`, h),
    post: (path: string, h: Handler) => routes.set(`POST ${path}`, h),
    use: () => {},
    call(method: string, path: string, ctx: any = {}) {
      const h = routes.get(`${method} ${path}`);
      if (!h) throw new Error(`no route ${method} ${path}`);
      return h(ctx);
    },
    routes,
  };
}
// Response.json returns a HttpResult descriptor in this framework — read its body.
function readJson(res: any): any {
  if (res && typeof res === "object" && "body" in res) {
    return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
  }
  return res;
}
// Serialise anything into a string so we can assert the raw value is absent.
function serialise(res: any): string {
  const body = readJson(res);
  return typeof body === "string" ? body : JSON.stringify(body);
}

class SecretsSuite extends Test({ name: "@youneed/server-plugin-secrets" }) {
  @Test.it("maskSecret reveals first 2 + ••• + last 2, never the raw value") mask() {
    expect(maskSecret(STRIPE)).toBe("sk•••OP");
    expect(maskSecret(STRIPE).includes(STRIPE)).toBe(false);
    // short values collapse to bullets so length isn't leaked precisely
    expect(maskSecret("ab")).toBe("••");
    expect(maskSecret("")).toBe("•");
  }

  @Test.it("secretsProvider installs the raw Secrets engine as this.secrets") async provider() {
    const eng = engine();
    const p = secretsProvider(eng);
    const instance: any = {};
    p.install(instance);
    expect(instance.secrets).toBe(eng);
    expect(typeof instance.secrets.require).toBe("function");
    expect(await instance.secrets.require("STRIPE_KEY")).toBe(STRIPE); // server-side only
  }

  @Test.it("secretHealth returns present + masked preview, never the raw value") async health() {
    const eng = engine();
    const h = await secretHealth(eng, "STRIPE_KEY", true);
    expect(h.present).toBe(true);
    expect(h.length).toBe(STRIPE.length);
    expect(h.preview).toBe("sk•••OP");
    // the raw value is nowhere in the health payload
    expect(JSON.stringify(h).includes(STRIPE)).toBe(false);
  }

  @Test.it("secretHealth reports missing/empty secrets without a preview") async healthMissing() {
    const eng = engine();
    expect((await secretHealth(eng, "NOPE", true)).present).toBe(false);
    expect((await secretHealth(eng, "EMPTY", true)).present).toBe(false); // empty ⇒ absent
    const off = await secretHealth(eng, "STRIPE_KEY", false); // tester disabled
    expect(off.present).toBe(true);
    expect(off.length).toBe(undefined);
    expect(off.preview).toBe(undefined);
  }

  @Test.it("GET /names returns NAMES ONLY + backend — no values") async namesRoute() {
    const eng = engine();
    const app = fakeApp();
    secrets(eng).setup!(app as any);
    const out = readJson(await app.call("GET", "/__secrets/names"));
    expect(out.backend).toBe("memory");
    expect(out.names.sort()).toEqual(["DB_URL", "EMPTY", "STRIPE_KEY"]);
    // CRITICAL: the listing must not carry any secret VALUE
    expect(serialise(await app.call("GET", "/__secrets/names")).includes(STRIPE)).toBe(false);
    expect(serialise(await app.call("GET", "/__secrets/names")).includes("postgres://x")).toBe(false);
  }

  @Test.it("GET /health returns masked presence and NEVER the raw value") async healthRoute() {
    const eng = engine();
    const app = fakeApp();
    secrets(eng).setup!(app as any);
    const res = await app.call("GET", "/__secrets/health", { query: { name: "STRIPE_KEY" } });
    const out = readJson(res);
    expect(out.present).toBe(true);
    expect(out.preview).toBe("sk•••OP");
    expect(out.length).toBe(STRIPE.length);
    // CRITICAL: the full secret value is NOT anywhere in the response
    expect(serialise(res).includes(STRIPE)).toBe(false);
  }

  @Test.it("GET /health requires a name") async healthRequiresName() {
    const eng = engine();
    const app = fakeApp();
    secrets(eng).setup!(app as any);
    const res = (await app.call("GET", "/__secrets/health", { query: {} })) as any;
    expect(res.status).toBe(400);
  }

  @Test.it("allowResolveTester:false ⇒ /health reports presence only") async testerOff() {
    const eng = engine();
    const app = fakeApp();
    secrets(eng, { allowResolveTester: false }).setup!(app as any);
    const out = readJson(await app.call("GET", "/__secrets/health", { query: { name: "STRIPE_KEY" } }));
    expect(out.present).toBe(true);
    expect(out.preview).toBe(undefined);
    expect(out.length).toBe(undefined);
  }

  @Test.it("exposeDevtools:false mounts no routes") noDevtools() {
    const eng = engine();
    const app = fakeApp();
    secrets(eng, { exposeDevtools: false }).setup!(app as any);
    expect(app.routes.size).toBe(0);
  }

  @Test.it("inspect() reports kind + backend + endpoints") inspect() {
    const eng = engine();
    const info = secrets(eng).inspect!() as any;
    expect(info.kind).toBe("secrets");
    expect(info.backend).toBe("memory");
    expect(info.endpoints.names).toBe("/__secrets/names");
    expect(info.endpoints.health).toBe("/__secrets/health");
  }
}

await TestApplication().addTests(SecretsSuite).reporter(new ConsoleReporter()).run();
