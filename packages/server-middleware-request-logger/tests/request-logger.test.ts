// Run: pnpm --filter @youneed/server-middleware-request-logger test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response, HttpError } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { createLogger, createTransport, MESSAGE } from "@youneed/logger";
import { requestLogger } from "../src/index.ts";

class RequestLoggerSuite extends Test({ name: "server-middleware-request-logger" }) {
  #logs: string[] = [];
  #server!: HTTP;
  base = "http://127.0.0.1:41205";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(requestLogger({ log: (l) => this.#logs.push(l) }))
      .get("/hello", () => Response.json({ ok: true }))
      .get("/boom", () => {
        throw new HttpError(418, { error: "teapot" });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41205, () => resolve(h));
    });
    const hello = await fetch(`${this.base}/hello`);
    await hello.body?.cancel();
    const boom = await fetch(`${this.base}/boom`);
    await boom.body?.cancel();
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("logs a successful GET /hello with status 200") helloLogged() {
    expect(this.#logs.some((l) => /GET \/hello 200/.test(l))).toBeTruthy();
  }

  @Test.it("logs errors too: GET /boom recorded with status 418") boomLogged() {
    expect(this.#logs.some((l) => /\/boom 418/.test(l))).toBeTruthy();
  }

  @Test.it("the logged line includes a duration") includesDuration() {
    expect(this.#logs.some((l) => /ms/.test(l))).toBeTruthy();
  }
}

class StructuredLoggerSuite extends Test({ name: "server-middleware-request-logger: structured" }) {
  #lines: string[] = [];
  #server!: HTTP;
  base = "http://127.0.0.1:41306";

  @Test.beforeAll() async start() {
    const logger = createLogger({ transports: [createTransport({ log: (info) => this.#lines.push(String(info[MESSAGE])) })] });
    const app = Application()
      // inline trace middleware: stamp a span before the logger runs
      .use((ctx, next) => {
        if (ctx.request.url?.startsWith("/traced")) {
          ctx.state.span = { traceId: "abcdef0123456789abcdef0123456789" };
        }
        return next();
      })
      .use(requestLogger({ logger }))
      .get("/hello", () => Response.json({ ok: true }))
      .get("/traced", () => Response.json({ ok: true }))
      .get("/boom", () => {
        throw new HttpError(500, { error: "kaboom" });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41306, () => resolve(h));
    });
    for (const p of ["/hello", "/traced", "/boom"]) {
      const r = await fetch(`${this.base}${p}`);
      await r.body?.cancel();
    }
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  #find(pred: (rec: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
    for (const l of this.#lines) {
      try {
        const rec = JSON.parse(l);
        if (pred(rec)) return rec;
      } catch {
        /* ignore non-JSON */
      }
    }
    return undefined;
  }

  @Test.it("200 emits one JSON record msg:request with method/status/ms/requestId") success() {
    const rec = this.#find((r) => r.url === "/hello");
    expect(rec).toBeDefined();
    expect(rec!.message).toBe("request");
    expect(rec!.method).toBe("GET");
    expect(rec!.status).toBe(200);
    expect(rec!.level).toBe("info");
    expect(typeof rec!.ms).toBe("number");
    expect((rec!.ms as number) >= 0).toBe(true);
    expect(typeof rec!.requestId).toBe("string");
    expect((rec!.requestId as string).length > 0).toBe(true);
  }

  @Test.it("a throwing route emits level:error") errored() {
    const rec = this.#find((r) => r.url === "/boom");
    expect(rec).toBeDefined();
    expect(rec!.level).toBe("error");
    expect(rec!.status).toBe(500);
  }

  @Test.it("carries traceId when ctx.state.span was set upstream") traced() {
    const rec = this.#find((r) => r.url === "/traced");
    expect(rec).toBeDefined();
    expect(rec!.traceId).toBe("abcdef0123456789abcdef0123456789");
  }

  @Test.it("omits traceId for untraced requests") untraced() {
    const rec = this.#find((r) => r.url === "/hello");
    expect(rec!.traceId).toBeUndefined();
  }
}

await TestApplication()
  .addTests(RequestLoggerSuite)
  .addTests(StructuredLoggerSuite)
  .reporter(new ConsoleReporter())
  .run();
