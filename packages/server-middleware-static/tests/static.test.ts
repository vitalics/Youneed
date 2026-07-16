// Run: pnpm --filter @youneed/server-middleware-static test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { staticFiles } from "../src/index.ts";

const PORT = 41220;

class StaticSuite extends Test({ name: "server-middleware-static" }) {
  #server!: HTTP;
  #dir!: string;
  base = `http://127.0.0.1:${PORT}`;

  @Test.beforeAll() async start() {
    this.#dir = mkdtempSync(join(tmpdir(), "ynstatic-"));
    writeFileSync(join(this.#dir, "hello.txt"), "0123456789"); // 10 bytes
    writeFileSync(join(this.#dir, "page.html"), "<h1>hi</h1>");
    mkdirSync(join(this.#dir, "sub"));
    writeFileSync(join(this.#dir, "sub", "index.html"), "<p>index</p>");

    const app = Application()
      .use(staticFiles(this.#dir))
      .get("/fallback", () => Response.json({ fallback: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(PORT, () => resolve(h));
    });
  }

  @Test.afterAll() async stop() {
    await this.#server.close();
    rmSync(this.#dir, { recursive: true, force: true });
  }

  @Test.it("serves a file with the right Content-Type and body") async serves() {
    const r = await fetch(`${this.base}/page.html`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(await r.text()).toBe("<h1>hi</h1>");
  }

  @Test.it("304 when If-None-Match matches the ETag") async conditional() {
    const first = await fetch(`${this.base}/hello.txt`);
    const etag = first.headers.get("etag")!;
    await first.text();
    expect(etag).toBeTruthy();
    const second = await fetch(`${this.base}/hello.txt`, { headers: { "If-None-Match": etag } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  }

  @Test.it("Range → 206 with Content-Range and the correct partial bytes") async range() {
    const r = await fetch(`${this.base}/hello.txt`, { headers: { Range: "bytes=0-3" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(r.headers.get("content-length")).toBe("4");
    expect(await r.text()).toBe("0123");
  }

  @Test.it("suffix Range (last N bytes) → 206") async suffixRange() {
    const r = await fetch(`${this.base}/hello.txt`, { headers: { Range: "bytes=-2" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 8-9/10");
    expect(await r.text()).toBe("89");
  }

  @Test.it("416 on an unsatisfiable range") async badRange() {
    const r = await fetch(`${this.base}/hello.txt`, { headers: { Range: "bytes=50-60" } });
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */10");
  }

  @Test.it("serves index.html for a directory") async indexFile() {
    const r = await fetch(`${this.base}/sub`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await r.text()).toBe("<p>index</p>");
  }

  @Test.it("unknown path falls through to the next route") async fallthrough() {
    const r = await fetch(`${this.base}/fallback`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ fallback: true });
  }

  @Test.it("path traversal is blocked (falls through)") async traversal() {
    // %2e%2e%2f == ../ — must not escape root; here it 404s (no /etc route).
    const r = await fetch(`${this.base}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    expect(r.status).toBe(404);
  }
}

await TestApplication().addTests(StaticSuite).reporter(new ConsoleReporter()).run();
