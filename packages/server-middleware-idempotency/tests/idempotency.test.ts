// Run: pnpm --filter @youneed/server-middleware-idempotency test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { MemoryKV } from "@youneed/kv";
import { idempotency } from "../src/index.ts";

const PORT = 41250;
const BASE = `http://127.0.0.1:${PORT}`;
const REQ_PORT = 41251;
const REQ_BASE = `http://127.0.0.1:${REQ_PORT}`;

let count = 0; // module counter — bumped once per real handler run

interface Res {
  status: number;
  body: any;
  replayed: string | null;
}
async function post(base: string, path: string, headers?: Record<string, string>): Promise<Res> {
  const r = await fetch(`${base}${path}`, { method: "POST", headers });
  let body: any = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { status: r.status, body, replayed: r.headers.get("idempotent-replayed") };
}

class IdempotencySuite extends Test({ name: "server-middleware-idempotency" }) {
  #server!: HTTP;

  @Test.beforeAll() async start() {
    count = 0;
    const store = new MemoryKV({ sweepMs: 0 });
    const app = Application()
      .use(idempotency({ store, ttl: 60 }))
      .post("/charge", () => Response.json({ n: ++count }))
      .post("/other", () => Response.json({ n: ++count }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(PORT, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("first POST with a key runs the handler → 200, n=1") async first() {
    const r = await post(BASE, "/charge", { "idempotency-key": "k1" });
    expect(r.status).toBe(200);
    expect(r.body.n).toBe(1);
    expect(count).toBe(1);
  }

  @Test.it("same key replays the first response; handler does NOT run again") async replay() {
    const r = await post(BASE, "/charge", { "idempotency-key": "k1" });
    expect(r.status).toBe(200);
    expect(r.body.n).toBe(1); // identical body to the first call
    expect(count).toBe(1); // handler did not run again
    expect(r.replayed).toBe("true");
  }

  @Test.it("a different key runs the handler again → n=2") async differentKey() {
    const r = await post(BASE, "/charge", { "idempotency-key": "k2" });
    expect(r.status).toBe(200);
    expect(r.body.n).toBe(2);
    expect(count).toBe(2);
  }

  @Test.it("no header → passes through, handler runs, not replayed") async noHeader() {
    const before = count;
    const r = await post(BASE, "/charge");
    expect(r.status).toBe(200);
    expect(r.body.n).toBe(before + 1);
    expect(count).toBe(before + 1);
    expect(r.replayed).toBeNull();
  }

  @Test.it("same key, different request (URL) → 422 fingerprint mismatch") async mismatch() {
    const r = await post(BASE, "/other", { "idempotency-key": "k1" });
    expect(r.status).toBe(422);
    expect(String(r.body.error).includes("different request")).toBe(true);
  }

  @Test.it("required:true + no header → 400") async required() {
    const store = new MemoryKV({ sweepMs: 0 });
    const app = Application()
      .use(idempotency({ store, required: true }))
      .post("/charge", () => Response.json({ ok: true }));
    const server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(REQ_PORT, () => resolve(h));
    });
    try {
      const r = await post(REQ_BASE, "/charge");
      expect(r.status).toBe(400);
      expect(String(r.body.error).includes("required")).toBe(true);
    } finally {
      await server.close();
    }
  }
}

await TestApplication().addTests(IdempotencySuite).reporter(new ConsoleReporter()).run();
