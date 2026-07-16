// Run: pnpm --filter @youneed/server-middleware-logger test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Controller, Response } from "@youneed/server";
import type { HTTP, Context, Middleware } from "@youneed/server";
import { createLogger, createTransport, MESSAGE } from "@youneed/logger";
import { logger, log } from "../src/index.ts";

interface Res {
  status: number;
  requestId: string;
  body: unknown;
}
async function get(url: string): Promise<Res> {
  const r = await fetch(url);
  return { status: r.status, requestId: r.headers.get("x-request-id") ?? "", body: await r.json() };
}

class LoggerSuite extends Test({ name: "server-middleware-logger" }) {
  #server!: HTTP;
  lines: string[] = [];
  base = "http://127.0.0.1:41260";

  @Test.beforeAll() async start() {
    const baseLogger = createLogger({
      transports: [createTransport({ log: (info) => this.lines.push(String(info[MESSAGE])) })],
    });
    const app = Application()
      // inline middleware that fakes an upstream trace span, only for /traced
      .use((ctx, next) => {
        if (ctx.request.url === "/traced") {
          ctx.state.span = { traceId: "abcdef0123456789abcdef0123456789" };
        }
        return next();
      })
      .use(logger(baseLogger))
      .get("/plain", (ctx) => {
        log(ctx).info("handled", { extra: 1 });
        return Response.json({ ok: true });
      })
      .get("/traced", (ctx) => {
        log(ctx).info("handled", { extra: 1 });
        return Response.json({ ok: true });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41260, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  // Find the JSON record this request emitted via log(ctx), by matching requestId.
  #record(requestId: string): Record<string, unknown> | undefined {
    for (const line of this.lines) {
      let rec: Record<string, unknown>;
      try {
        rec = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (rec.message === "handled" && rec.requestId === requestId) return rec;
    }
    return undefined;
  }

  @Test.it("emits a contextual JSON line bound to the requestId") async plain() {
    const r = await get(`${this.base}/plain`);
    expect(r.status).toBe(200);
    expect(r.requestId.length > 0).toBe(true);
    const rec = this.#record(r.requestId);
    expect(rec).toBeDefined();
    expect(rec!.message).toBe("handled");
    expect(rec!.extra).toBe(1);
    expect(rec!.requestId).toBe(r.requestId);
    // no upstream span → no traceId binding
    expect(rec!.traceId).toBeUndefined();
  }

  @Test.it("binds traceId from ctx.state.span on the traced route") async traced() {
    const r = await get(`${this.base}/traced`);
    expect(r.status).toBe(200);
    const rec = this.#record(r.requestId);
    expect(rec).toBeDefined();
    expect(rec!.traceId).toBe("abcdef0123456789abcdef0123456789");
    expect(rec!.requestId).toBe(r.requestId);
  }

  @Test.it("log(ctx) returns a working logger when the middleware ran") async working() {
    let emitted = "";
    const probe = createLogger({
      transports: [createTransport({ log: (info) => (emitted = String(info[MESSAGE])) })],
    });
    const ctx = { requestId: "rid-1", state: {} } as unknown as Context;
    // simulate the middleware storing the child
    logger(probe)(ctx, async () => undefined);
    log(ctx).info("inline");
    const rec = JSON.parse(emitted) as Record<string, unknown>;
    expect(rec.message).toBe("inline");
    expect(rec.requestId).toBe("rid-1");
  }

  @Test.it("log(ctx) fallback (no middleware) does not throw") async fallback() {
    const ctx = { requestId: "rid-2", state: {} } as unknown as Context;
    let threw = false;
    try {
      log(ctx).info("safe");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  }
}

// ── Controller-attached middleware: class-level `middlewares` + per-method
//    `@Controller.middleware`, with `this.log` inside the handler. ──────────────
const ctrlLines: string[] = [];
const ctrlLogger = createLogger({
  transports: [createTransport({ log: (info) => ctrlLines.push(String(info[MESSAGE])) })],
});
let tagRuns = 0;
const tag: Middleware = (ctx, next) => {
  tagRuns++;
  ctx.response.setHeader("x-tagged", "yes");
  return next();
};

class CatController extends Controller({ url: "/cats", middlewares: [logger(ctrlLogger)] }) {
  @Controller.get("/")
  list() {
    this.log.info("listing cats", { count: 2 }); // this.log → request-scoped child logger
    return Response.json({ cats: 2 });
  }

  @Controller.middleware(tag) // extra middleware just for this route (outside guards)
  @Controller.get("/:id")
  one(ctx: Context) {
    this.log.info("one cat");
    return Response.json({ id: ctx.params.id });
  }
}

class ControllerSuite extends Test({ name: "server-middleware-logger: controller" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41261";
  @Test.beforeAll() async start() {
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = Application(CatController).listen(41261, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  #record(message: string, requestId: string): Record<string, unknown> | undefined {
    for (const line of ctrlLines) {
      try {
        const rec = JSON.parse(line) as Record<string, unknown>;
        if (rec.message === message && rec.requestId === requestId) return rec;
      } catch {
        /* skip */
      }
    }
    return undefined;
  }

  @Test.it("class-level middleware wires the logger; this.log carries the requestId") async classLevel() {
    const r = await fetch(`${this.base}/cats`);
    const rid = r.headers.get("x-request-id") ?? "";
    expect(r.status).toBe(200);
    const rec = this.#record("listing cats", rid);
    expect(rec).toBeDefined();
    expect(rec!.count).toBe(2);
    expect(rec!.requestId).toBe(rid);
  }

  @Test.it("@Controller.middleware runs only on its route, around this.log") async methodLevel() {
    const r = await fetch(`${this.base}/cats/7`);
    const rid = r.headers.get("x-request-id") ?? "";
    expect(r.status).toBe(200);
    expect((await r.json() as { id: string }).id).toBe("7");
    expect(r.headers.get("x-tagged")).toBe("yes"); // method middleware ran
    expect(tagRuns).toBe(1);
    expect(this.#record("one cat", rid)).toBeDefined(); // this.log worked here too
  }

  @Test.it("the method middleware does NOT run on sibling routes") async scoped() {
    const before = tagRuns;
    const r = await fetch(`${this.base}/cats`);
    await r.body?.cancel();
    expect(r.headers.get("x-tagged")).toBeNull(); // untagged
    expect(tagRuns).toBe(before); // tag middleware not invoked for /cats
  }
}

await TestApplication().addTests(LoggerSuite).addTests(ControllerSuite).reporter(new ConsoleReporter()).run();
