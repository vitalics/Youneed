// Run: pnpm --filter @youneed/server-plugin-feature-flags test
// Exercises the pure helpers, the request-scoped provider facade, and the plugin
// routes via a fake AppBuilder that captures handlers — no real HTTP server.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createFlags } from "@youneed/feature-flags";
import { featureFlags, flagsProvider, requestFlags, contextFromQuery } from "../src/index.ts";

const DEFS = [
  { key: "beta", defaultValue: false, rollout: 100 }, // everyone on
  { key: "off", defaultValue: false }, // baseline off
  {
    key: "checkout",
    defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
  },
];

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
  // Response.json(value) → descriptor { body: <string|object>, ... } OR a value.
  if (res && typeof res === "object" && "body" in res) {
    return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
  }
  return res;
}

class FeatureFlagsSuite extends Test({ name: "@youneed/server-plugin-feature-flags" }) {
  @Test.it("requestFlags evaluates against a supplied request context") flagFacade() {
    const flags = createFlags(DEFS);
    // A fake request whose deriver produces a pro-plan context.
    const ctx = { state: { user: { id: "u1", plan: "pro" } } } as any;
    const rf = requestFlags(flags, (c: any) => ({ targetingKey: c.state.user.id, attributes: { plan: c.state.user.plan } }), ctx);
    expect(rf.isEnabled("beta")).toBe(true);
    expect(rf.isEnabled("off")).toBe(false);
    expect(rf.variant("checkout")).toBe("fast"); // pro → fast
    expect(rf.value("checkout")).toBe("fast");
    expect(rf.value("missing", "fb")).toBe("fb");
    const all = rf.all();
    expect(Object.keys(all).sort()).toEqual(["beta", "checkout", "off"]);
    expect(all.checkout.reason).toBe("TARGETING_MATCH");
  }

  @Test.it("a non-pro context gets the control variant") facadeDefault() {
    const flags = createFlags(DEFS);
    const rf = requestFlags(flags, () => ({ attributes: { plan: "free" } }));
    expect(rf.value("checkout")).toBe("control");
    expect(rf.variant("checkout")).toBe(undefined);
  }

  @Test.it("flagsProvider installs a working this.flags facade") provider() {
    const flags = createFlags(DEFS);
    const p = flagsProvider(flags, { context: () => ({ attributes: { plan: "pro" } }) });
    const instance: any = {};
    p.install(instance);
    expect(typeof instance.flags.isEnabled).toBe("function");
    expect(typeof instance.flags.evaluate).toBe("function");
    // No active request context here, so the deriver is skipped ⇒ default eval.
    // The pro→fast path (with a request context) is covered by `flagFacade` above,
    // which drives the identical facade via requestFlags(flags, derive, ctx).
    expect(instance.flags.value("checkout")).toBe("control");
    expect(instance.flags.isEnabled("beta")).toBe(true); // rollout 100 ⇒ on for anyone
  }

  @Test.it("contextFromQuery parses targetingKey + coerced attrs") queryCtx() {
    const ec = contextFromQuery({ targetingKey: "u9", "attr.plan": "pro", "attr.age": "42", "attr.beta": "true" });
    expect(ec.targetingKey).toBe("u9");
    expect(ec.attributes).toEqual({ plan: "pro", age: 42, beta: true });
  }

  @Test.it("GET /list returns definitions + overrides") listRoute() {
    const flags = createFlags(DEFS);
    flags.override("off", true);
    const app = fakeApp();
    featureFlags(flags).setup!(app as any);
    const out = readJson(app.call("GET", "/__flags/list"));
    expect(out.definitions.map((d: any) => d.key).sort()).toEqual(["beta", "checkout", "off"]);
    expect(out.overrides).toEqual({ off: true });
    // the overridden flag carries an `overridden` marker in the definition list
    expect(out.definitions.find((d: any) => d.key === "off").overridden).toBe(true);
  }

  @Test.it("GET /snapshot returns all(ctx) for the derived request context") snapshotRoute() {
    const flags = createFlags(DEFS);
    const app = fakeApp();
    featureFlags(flags, { context: (c: any) => ({ attributes: { plan: c.query.plan } }) }).setup!(app as any);
    const snap = readJson(app.call("GET", "/__flags/snapshot", { query: { plan: "pro" } }));
    expect(snap.checkout.value).toBe("fast");
    expect(snap.beta.value).toBe(true);
  }

  @Test.it("POST /override then /clear round-trips through the engine") async overrideRoute() {
    const flags = createFlags(DEFS);
    const app = fakeApp();
    featureFlags(flags).setup!(app as any);
    await app.call("POST", "/__flags/override", { body: { key: "off", value: true } });
    expect(flags.isEnabled("off")).toBe(true);
    await app.call("POST", "/__flags/clear", { body: { key: "off" } });
    expect(flags.isEnabled("off")).toBe(false);
  }

  @Test.it("override routes are gated behind allowOverride") async gated() {
    const flags = createFlags(DEFS);
    const app = fakeApp();
    featureFlags(flags, { allowOverride: false }).setup!(app as any);
    const res = (await app.call("POST", "/__flags/override", { body: { key: "off", value: true } })) as any;
    expect(res.status).toBe(403);
    expect(flags.isEnabled("off")).toBe(false);
  }

  @Test.it("GET /evaluate evaluates one flag for an ad-hoc query context") evaluateRoute() {
    const flags = createFlags(DEFS);
    const app = fakeApp();
    featureFlags(flags).setup!(app as any);
    const pro = readJson(app.call("GET", "/__flags/evaluate", { query: { key: "checkout", "attr.plan": "pro" } }));
    expect(pro.value).toBe("fast");
    expect(pro.variant).toBe("fast");
    const missing = app.call("GET", "/__flags/evaluate", { query: {} }) as any;
    expect(missing.status).toBe(400);
  }

  @Test.it("inspect() reports kind + count + endpoints") inspect() {
    const flags = createFlags(DEFS);
    const info = featureFlags(flags).inspect!() as any;
    expect(info.kind).toBe("feature-flags");
    expect(info.count).toBe(3);
    expect(info.endpoints.snapshot).toBe("/__flags/snapshot");
  }
}

await TestApplication().addTests(FeatureFlagsSuite).reporter(new ConsoleReporter()).run();
