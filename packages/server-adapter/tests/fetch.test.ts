// Run: pnpm --filter @youneed/server-adapter test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response, type Context } from "@youneed/server";
import { toFetchHandler, serve, detectAdapter } from "../src/index.ts";

function demoApp() {
  return Application()
    .get("/hello", () => ({ hello: "world" }))
    .get("/text", () => Response.text("plain"))
    .get("/missing", () => Response.json({ error: "nope" }, { status: 404 }))
    .post("/echo", (ctx: Context) => ({ got: ctx.body }));
}

class FetchAdapterSuite extends Test({ name: "server-adapter" }) {
  @Test.it("toFetchHandler: GET returns a JSON Response") async getJson() {
    const fetchHandler = toFetchHandler(demoApp());
    const res = await fetchHandler(new Request("http://x/hello"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.includes("application/json")).toBeTruthy();
    expect(await res.json()).toEqual({ hello: "world" });
  }

  @Test.it("toFetchHandler: text body + content-type") async text() {
    const res = await toFetchHandler(demoApp())(new Request("http://x/text"));
    expect(await res.text()).toBe("plain");
    expect(res.headers.get("content-type")?.startsWith("text/plain")).toBeTruthy();
  }

  @Test.it("toFetchHandler: non-200 status flows through") async status() {
    const res = await toFetchHandler(demoApp())(new Request("http://x/missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "nope" });
  }

  @Test.it("toFetchHandler: POST body is parsed + echoed") async post() {
    const res = await toFetchHandler(demoApp())(
      new Request("http://x/echo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: 42 }),
      }),
    );
    expect(await res.json()).toEqual({ got: { n: 42 } });
  }

  @Test.it("toFetchHandler: echoes the x-request-id header") async requestId() {
    const res = await toFetchHandler(demoApp())(new Request("http://x/hello"));
    expect(typeof res.headers.get("x-request-id")).toBe("string");
  }

  @Test.it("detectAdapter: picks node when not in Bun/Deno") detect() {
    expect(detectAdapter().name).toBe("node");
  }

  @Test.it("serve(): real round-trip on the node adapter") async serveNode() {
    const running = await serve(demoApp(), { port: 41360 });
    try {
      expect(running.runtime).toBe("node");
      const res = await fetch(`${running.url}/hello`);
      expect(await res.json()).toEqual({ hello: "world" });
    } finally {
      await running.close();
    }
  }
}

await TestApplication().addTests(FetchAdapterSuite).reporter(new ConsoleReporter()).run();
