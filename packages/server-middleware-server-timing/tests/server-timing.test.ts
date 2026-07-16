// Run: pnpm --filter @youneed/server-middleware-server-timing test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { serverTiming, timing } from "../src/index.ts";

class ServerTimingSuite extends Test({ name: "server-middleware-server-timing" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41213";

  @Test.beforeAll() async start() {
    const app = Application()
      // scoped per prefix so /off has ONLY the disabled instance
      .use("/work", serverTiming())
      .use("/plain", serverTiming())
      .use("/flex", serverTiming())
      .use("/prec", serverTiming({ precision: 0 }))
      .use("/off", serverTiming({ enabled: () => false }))
      .get("/work", async (ctx) => {
        timing(ctx).add("cache", 1.5, "Cache Read");
        const v = await timing(ctx).measure(
          "db",
          async () => {
            await new Promise((r) => setTimeout(r, 5));
            return 42;
          },
          "SQL query",
        );
        const stop = timing(ctx).start("render");
        stop();
        return Response.json({ v });
      })
      .get("/plain", () => Response.json({ ok: true }))
      .get("/flex", async (ctx) => {
        // configurable metric: desc set AFTER the work runs
        const m = timing(ctx).metric("db");
        await new Promise((r) => setTimeout(r, 3));
        m.desc("dynamic desc").stop();
        timing(ctx).metric("never-stopped"); // auto-finalized to time-to-response
        timing(ctx).metric("explicit").dur(2.5).desc("fixed"); // explicit dur, no stop
        return Response.json({ ok: true });
      })
      .get("/prec", async (ctx) => {
        await timing(ctx).measure("db", () => new Promise((r) => setTimeout(r, 3)));
        return Response.json({ ok: true });
      })
      .get("/off", (ctx) => {
        timing(ctx).add("secret", 9); // recorded but must NOT be emitted
        return Response.json({ ok: true });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41213, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("emits Server-Timing with recorded metrics + auto total") async metrics() {
    const r = await fetch(`${this.base}/work`);
    await r.body?.cancel();
    const h = r.headers.get("server-timing") ?? "";
    expect(h.includes('cache;dur=1.5;desc="Cache Read"')).toBeTruthy();
    expect(/(^|, )db;dur=[\d.]+;desc="SQL query"/.test(h)).toBeTruthy();
    expect(/(^|, )render;dur=[\d.]+/.test(h)).toBeTruthy();
    expect(/(^|, )total;dur=[\d.]+/.test(h)).toBeTruthy();
  }
  @Test.it("db duration reflects the awaited work (≥ ~4ms)") async measured() {
    const r = await fetch(`${this.base}/work`);
    await r.body?.cancel();
    const m = /db;dur=([\d.]+)/.exec(r.headers.get("server-timing") ?? "");
    expect(m != null && Number(m[1]) >= 4).toBeTruthy();
  }
  @Test.it("with no recorded metrics still emits the total") async plain() {
    const r = await fetch(`${this.base}/plain`);
    await r.body?.cancel();
    expect((r.headers.get("server-timing") ?? "").startsWith("total;dur=")).toBeTruthy();
  }
  @Test.it("enabled:false suppresses the header entirely") async disabled() {
    const r = await fetch(`${this.base}/off`);
    await r.body?.cancel();
    expect(r.headers.get("server-timing")).toBeNull();
  }
  @Test.it("metric(): desc set after start, auto-finalize unstopped, explicit dur wins") async flexible() {
    const r = await fetch(`${this.base}/flex`);
    await r.body?.cancel();
    const h = r.headers.get("server-timing") ?? "";
    expect(/(^|, )db;dur=[\d.]+;desc="dynamic desc"/.test(h)).toBeTruthy(); // desc set after start
    expect(/(^|, )never-stopped;dur=[\d.]+/.test(h)).toBeTruthy(); // auto-finalized
    expect(h.includes('explicit;dur=2.5;desc="fixed"')).toBeTruthy(); // explicit dur kept exactly
  }
  @Test.it("precision option quantizes durations (precision:0 → integers)") async precision() {
    const r = await fetch(`${this.base}/prec`);
    await r.body?.cancel();
    const h = r.headers.get("server-timing") ?? "";
    expect(/db;dur=\d+(;|,|$)/.test(h)).toBeTruthy(); // integer
    expect(/dur=\d+\.\d/.test(h)).toBe(false); // no decimals anywhere
  }
}

await TestApplication().addTests(ServerTimingSuite).reporter(new ConsoleReporter()).run();
