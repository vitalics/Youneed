// Run: pnpm --filter @youneed/server-plugin-devtools test
import { Application, Controller, Response, HttpError, withDocumentation, type HTTP, type Context } from "@youneed/server";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import {
  topology,
  externalServer,
  mergeTopologies,
  securityAudit,
  auditGrade,
  toOpenApi,
  toAsyncApi,
  microbench,
  devtools,
  type ServerInfo,
} from "../src/index.ts";
import { createClient, fromWebSocket, bridgeToHub, createTarget, defineDomain, type DevtoolsClient } from "@youneed/devtools-protocol";

const secured: ServerInfo = {
  name: "api",
  url: "http://localhost:3000",
  middleware: ["cors", "helmet", "rate-limit", "body-limit", "https-redirect", "bearer"],
  routes: [
    { method: "GET", path: "/users", guards: 1, kind: "http", schema: { response: { type: "array" } } },
    {
      method: "POST",
      path: "/users",
      guards: 1,
      kind: "http",
      schema: { body: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
    },
  ],
};

const risky: ServerInfo = {
  name: "legacy",
  middleware: [], // nothing mounted
  routes: [
    { method: "POST", path: "/orders", kind: "http" }, // no guard, no body schema
    { method: "GET", path: "/orders/:id", kind: "http" }, // id, no guard → BOLA hint
  ],
};

class ServerDevtoolsSuite extends Test({ name: "server-devtools" }) {
  // ── topology ──
  @Test.it("topology + external server + merge") topo() {
    const ext = externalServer({ name: "billing", url: "https://billing.dev" });
    expect(ext.external).toBe(true);
    expect(ext.routes.length).toBe(0);
    const merged = mergeTopologies(topology([secured]), topology([ext]));
    expect(merged.servers.map((s) => s.name).sort().join(",")).toBe("api,billing");
  }

  // ── security audit (OWASP) ──
  @Test.it("a well-secured server passes route-level checks") securedOk() {
    const findings = securityAudit(secured);
    // No unauthenticated-mutation / no-input-validation (POST has guard + body schema).
    expect(findings.some((f) => f.rule === "unauthenticated-mutation")).toBeFalsy();
    expect(findings.some((f) => f.rule === "no-input-validation")).toBeFalsy();
    expect(findings.some((f) => f.rule === "no-rate-limit")).toBeFalsy();
  }

  @Test.it("flags unauthenticated mutation, missing validation, BOLA, misconfig") riskyFlags() {
    const f = securityAudit(risky);
    const rules = f.map((x) => x.rule);
    expect(rules.includes("unauthenticated-mutation")).toBeTruthy(); // POST /orders no guard
    expect(rules.includes("no-input-validation")).toBeTruthy(); // POST no body schema
    expect(rules.includes("object-level-auth")).toBeTruthy(); // GET /orders/:id no guard
    expect(rules.includes("no-rate-limit")).toBeTruthy();
    expect(rules.includes("no-security-headers")).toBeTruthy();
    // each finding carries an OWASP ref + docs link
    expect(f.every((x) => x.owasp.startsWith("API") && x.docs.includes("owasp.org"))).toBeTruthy();
    expect(auditGrade(f)).toBe("error"); // the unauthenticated mutation is an error
  }

  @Test.it("internal routes are skipped by the audit") internal() {
    const s: ServerInfo = {
      name: "x",
      middleware: ["rate-limit", "helmet", "cors", "body-limit", "https-redirect", "bearer"],
      routes: [
        // would normally flag (mutation, no guard/body) — but it's internal
        { method: "POST", path: "/__devtools/x", kind: "http", internal: true },
        { method: "DELETE", path: "/__devtools/y/:id", kind: "http", internal: true },
      ],
    };
    const f = securityAudit(s);
    expect(f.some((x) => x.route)).toBeFalsy(); // no per-route findings for internal routes
  }

  @Test.it("auditGrade rolls up severity") grade() {
    expect(auditGrade([])).toBe("pass");
    expect(auditGrade([{ rule: "x", severity: "warning", owasp: "API8:2023", message: "", docs: "" }])).toBe("warning");
  }

  // ── OpenAPI ──
  @Test.it("toOpenApi builds paths, params, requestBody and responses") openapi() {
    const doc = toOpenApi(secured, { title: "Users API", version: "2.0.0" }) as any;
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Users API");
    expect(doc.servers[0].url).toBe("http://localhost:3000");
    expect(doc.paths["/users"].get).toBeDefined();
    expect(doc.paths["/users"].post.requestBody.content["application/json"].schema.properties.name).toBeDefined();
  }

  @Test.it("toOpenApi documents guarded routes (security + 401/403 + names)") openapiGuards() {
    const s: ServerInfo = {
      name: "x",
      routes: [
        { method: "GET", path: "/me", kind: "http", guards: 1, guardNames: ["requireAuth"] },
        { method: "GET", path: "/public", kind: "http" },
      ],
    };
    const doc = toOpenApi(s) as any;
    const me = doc.paths["/me"].get;
    expect(me.security).toEqual([{ guard: [] }]);
    expect(me.responses["401"]).toBeDefined();
    expect(me.responses["403"]).toBeDefined();
    expect(me["x-guards"]).toEqual(["requireAuth"]);
    expect(String(me.description).includes("requireAuth")).toBeTruthy();
    // a guard security scheme is declared
    expect(doc.components.securitySchemes.guard).toBeDefined();
    // unguarded route has no security
    expect(doc.paths["/public"].get.security).toBeUndefined();
  }

  @Test.it("toAsyncApi builds channels from ws/sse routes (skips http)") asyncapi() {
    const s: ServerInfo = {
      name: "events",
      url: "http://localhost:3000",
      routes: [
        { method: "GET", path: "/users", kind: "http" }, // not a channel
        { method: "WS", path: "/live", kind: "ws" },
        { method: "GET", path: "/stream", kind: "sse" },
        { method: "WS", path: "/__devtools/ws", kind: "ws", internal: true }, // skipped
      ],
    };
    const doc = toAsyncApi(s, { title: "Events", version: "2.0.0" }) as any;
    expect(doc.asyncapi).toBe("2.6.0");
    expect(doc.info.title).toBe("Events");
    expect(doc.servers.production.url).toBe("ws://localhost:3000");
    expect(Object.keys(doc.channels)).toEqual(["/live", "/stream"]);
    // ws is bidirectional, sse is subscribe-only
    expect(doc.channels["/live"].publish).toBeDefined();
    expect(doc.channels["/live"].subscribe).toBeDefined();
    expect(doc.channels["/stream"].subscribe).toBeDefined();
    expect(doc.channels["/stream"].publish).toBeUndefined();
    expect(doc.channels["/__devtools/ws"]).toBeUndefined();
  }

  @Test.it("toOpenApi maps :param to {param} and skips ws/sse") openapiParams() {
    const s: ServerInfo = {
      name: "x",
      routes: [
        { method: "GET", path: "/u/:id", kind: "http", schema: { params: { type: "object", properties: { id: { type: "string" } } } } },
        { method: "WS", path: "/live", kind: "ws" },
      ],
    };
    const doc = toOpenApi(s) as any;
    expect(doc.paths["/u/{id}"]).toBeDefined();
    expect(doc.paths["/live"]).toBeUndefined(); // ws excluded
    expect(doc.paths["/u/{id}"].get.parameters[0]).toEqual({ name: "id", in: "path", required: true, schema: { type: "string" } });
  }

  // ── microbench ──
  @Test.it("microbench returns sane stats") bench() {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    const r = microbench(() => arr.reduce((a, b) => a + b, 0), { name: "sum", samples: 50, warmup: 10 });
    expect(r.name).toBe("sum");
    expect(r.samples).toBe(50);
    expect(r.opsPerSec > 0).toBeTruthy();
    expect(r.p50 >= r.minMs && r.p99 <= r.maxMs + 1e-9).toBeTruthy();
  }
}

// ── the devtools() server plugin, mounted on a real Application ──────────────────
class DevtoolsPluginSuite extends Test({ name: "server-plugin-devtools/plugin" }) {
  #server!: HTTP;
  port = 41877;
  path = "/__devtools";
  get base() {
    return `http://127.0.0.1:${this.port}`;
  }

  @Test.beforeAll() async start() {
    // Register the plugin the idiomatic way: app.plugin(devtools(...)).
    const app = Application()
      .get("/users", () => Response.json([{ id: 1 }]))
      .plugin(devtools({ name: "demo-api", path: this.path, middleware: ["cors"] }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(this.port, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("plugin reports name 'devtools'") name() {
    expect(devtools().name).toBe("devtools");
  }

  @Test.it("serves the unified UI page at {path}") async page() {
    const r = await fetch(`${this.base}${this.path}`);
    expect(r.status).toBe(200);
    expect((r.headers.get("content-type") ?? "").includes("text/html")).toBeTruthy();
    const html = await r.text();
    expect(html.includes("<youneed-devtools")).toBeTruthy();
  }
}

// ── "try a guard" — POST {path}/try-guard against a real guarded route ───────────
// A documented guard that rejects with 401 unless a Bearer token is present.
const requireAuth = withDocumentation(
  (ctx: Context): boolean => {
    if (!ctx.request.headers["authorization"]) throw new HttpError(401, { error: "Unauthorized" });
    return true;
  },
  { name: "requireAuth", description: "Bearer token in the Authorization header" },
);

class GuardedController extends Controller("/secret") {
  @Controller.get("/data")
  @Controller.guard(requireAuth)
  data() {
    return Response.json({ ok: true });
  }
}

class TryGuardSuite extends Test({ name: "server-plugin-devtools/try-guard" }) {
  #server!: HTTP;
  #client!: DevtoolsClient;
  port = 41878;

  @Test.beforeAll() async start() {
    const app = Application(GuardedController).plugin(devtools({ name: "guarded-api" }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(this.port, () => resolve(h));
    });
    this.#client = createClient(fromWebSocket((await openWs(`ws://127.0.0.1:${this.port}/__devtools/ws`)) as never));
  }
  @Test.afterAll() async stop() {
    this.#client.close();
    await this.#server.close();
  }

  @Test.it("Topology.tryGuard denies an unauthenticated request") async denied() {
    const trials = await this.#client.command<Array<{ name: string; outcome: string; status?: number }>>("Topology.tryGuard", { method: "GET", path: "/secret/data" });
    expect(trials.length > 0).toBeTruthy();
    expect(trials[0].outcome).toBe("denied");
    expect(trials[0].status).toBe(401);
  }

  @Test.it("Topology.tryGuard passes with a valid Authorization header") async passed() {
    const trials = await this.#client.command<Array<{ name: string; outcome: string }>>("Topology.tryGuard", {
      method: "GET",
      path: "/secret/data",
      init: { headers: { authorization: "Bearer tok" } },
    });
    expect(trials[0].outcome).toBe("passed");
    expect(trials[0].name).toBe("requireAuth");
  }
}

// ── Topology.get exposes mounted plugins (name + inspect() info) ─────────────────
class PluginsTopologySuite extends Test({ name: "server-plugin-devtools/plugins" }) {
  #server!: HTTP;
  #client!: DevtoolsClient;
  port = 41879;

  @Test.beforeAll() async start() {
    // A demo plugin with an inspect() — Topology.get should surface it under `plugins`.
    const app = Application()
      .get("/users", () => Response.json([]))
      .plugin({ name: "x", inspect: () => ({ kind: "demo" }) })
      .plugin(devtools({ name: "plugins-api" }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(this.port, () => resolve(h));
    });
    this.#client = createClient(fromWebSocket((await openWs(`ws://127.0.0.1:${this.port}/__devtools/ws`)) as never));
  }
  @Test.afterAll() async stop() {
    this.#client.close();
    await this.#server.close();
  }

  @Test.it("Topology.get includes mounted plugins with their inspect() info") async pluginsInTopology() {
    const server = await this.#client.command<ServerInfo>("Topology.get");
    expect(Array.isArray(server.plugins)).toBeTruthy();
    const found = (server.plugins ?? []).find((p) => p.name === "x");
    expect(found).toBeDefined();
    expect((found!.info as { kind?: string }).kind).toBe("demo");
  }
}

// ── Topology over devtools-protocol (CDP-style WS) ────────────────────────────

const PROTO_PORT = 41822;

function openWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error("ws open failed"));
  });
}

class ProtocolSuite extends Test({ name: "server-devtools · protocol" }) {
  #server!: HTTP;
  #ws!: WebSocket;
  #client!: DevtoolsClient;

  @Test.beforeAll() async start() {
    const app = Application()
      .get("/users", () => Response.json([]))
      .post("/users", () => Response.json({}, { status: 201 }))
      .plugin(devtools({ name: "demo-api", middleware: ["cors"] }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(PROTO_PORT, () => resolve(h));
    });
    this.#ws = await openWs(`ws://127.0.0.1:${PROTO_PORT}/__devtools/ws`);
    this.#client = createClient(fromWebSocket(this.#ws as never));
  }
  @Test.afterAll() async stop() {
    this.#client.close();
    await this.#server.close();
  }

  @Test.it("Topology.get returns the live routes") async get() {
    const info = await this.#client.command<ServerInfo>("Topology.get");
    expect(info.name).toBe("demo-api");
    expect(info.routes.some((r) => r.path === "/users" && r.method === "GET")).toBeTruthy();
  }

  @Test.it("Topology.grade rolls up the audit") async grade() {
    const grade = await this.#client.command<string>("Topology.grade");
    expect(["pass", "warning", "error"].includes(grade)).toBeTruthy();
  }

  @Test.it("Topology.openapi produces a 3.1 doc") async openapi() {
    const doc = await this.#client.command<{ openapi: string; paths: Record<string, unknown> }>("Topology.openapi", { title: "X" });
    expect(doc.openapi).toBe("3.1.0");
    expect("/users" in doc.paths).toBeTruthy();
  }

  @Test.it("Protocol.getDomains advertises Topology") async domains() {
    const spec = await this.#client.getDomains();
    const d = spec.domains.find((x) => x.domain === "Topology");
    expect(!!d).toBeTruthy();
    expect(d!.commands.some((c) => c.name === "get")).toBeTruthy();
  }

  @Test.it("Target.getInfo lists the Topology domain") async info() {
    const t = await this.#client.getInfo();
    expect(t.kind).toBe("server");
    expect(t.domains.includes("Topology")).toBeTruthy();
  }

  @Test.it("Network.enable streams responseReceived events") async network() {
    const events: Array<{ path: string; status: number }> = [];
    this.#client.on("Network.responseReceived", (p) => events.push(p as { path: string; status: number }));
    await this.#client.command("Network.enable");
    await (await fetch(`http://127.0.0.1:${PROTO_PORT}/users`)).text();
    await new Promise((r) => setTimeout(r, 50)); // let the event frame arrive
    const hit = events.find((e) => e.path === "/users");
    expect(hit?.status).toBe(200);
  }

  @Test.it("hub: GET {path}/json discovers the server target") async hub() {
    const r = await fetch(`http://127.0.0.1:${PROTO_PORT}/__devtools/json`);
    const targets = (await r.json()) as Array<{ kind: string; domains: string[]; webSocketDebuggerUrl: string }>;
    const server = targets.find((x) => x.kind === "server")!;
    expect(server.webSocketDebuggerUrl).toBe("/__devtools/ws");
    expect(server.domains.includes("Topology")).toBeTruthy();
  }
}

// ── front-bridge relay: a page registers OUT, UI drives it through the hub ─────

const BRIDGE_PORT = 41823;

class BridgeSuite extends Test({ name: "server-devtools · front-bridge" }) {
  #server!: HTTP;
  #bridge!: { close(): void };

  @Test.beforeAll() async start() {
    const app = Application().get("/", () => Response.json({})).plugin(devtools({ name: "hub" }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(BRIDGE_PORT, () => resolve(h));
    });
    // A "page" target connecting OUT to the hub (DOM-free generic domain).
    const pageTarget = createTarget({ kind: "dom", title: "page" }).register(
      defineDomain({ domain: "Ping", commands: { hello: { handler: () => "hi" } } }),
    );
    this.#bridge = bridgeToHub(`ws://127.0.0.1:${BRIDGE_PORT}/__devtools/register`, pageTarget);
  }
  @Test.afterAll() async stop() {
    this.#bridge.close();
    await this.#server.close();
  }

  async #remoteSession(): Promise<string> {
    // Poll discovery until the page's registration lands.
    for (let i = 0; i < 40; i++) {
      const targets = (await (await fetch(`http://127.0.0.1:${BRIDGE_PORT}/__devtools/json`)).json()) as Array<{ kind: string; sessionId?: string }>;
      const page = targets.find((t) => t.kind === "dom" && t.sessionId);
      if (page?.sessionId) return page.sessionId;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error("page never registered");
  }

  @Test.it("hub /json lists the relayed page target") async lists() {
    const sid = await this.#remoteSession();
    expect(typeof sid === "string" && sid.length > 0).toBeTruthy();
  }

  @Test.it("UI drives the page's domain through the hub (attach + sessionId)") async drive() {
    const sid = await this.#remoteSession();
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const s = new WebSocket(`ws://127.0.0.1:${BRIDGE_PORT}/__devtools/ws`);
      s.onopen = () => resolve(s);
      s.onerror = () => reject(new Error("ws fail"));
    });
    const client = createClient(fromWebSocket(ws as never), { sessionId: sid });
    await client.command("hub.attach", { targetId: sid });
    const info = await client.getInfo(); // routed to the page target
    const pong = await client.command<string>("Ping.hello");
    client.close();
    expect(info.kind).toBe("dom");
    expect(pong).toBe("hi");
  }
}

await TestApplication()
  .addTests(ServerDevtoolsSuite, DevtoolsPluginSuite, TryGuardSuite, PluginsTopologySuite, ProtocolSuite, BridgeSuite)
  .reporter(new ConsoleReporter())
  .run();
