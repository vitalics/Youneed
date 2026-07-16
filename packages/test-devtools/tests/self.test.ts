// Self-test: run @youneed/test through the DevtoolsReporter, then drive its HTTP
// surface with fetch — assert GET / serves the page, GET /events streams the
// buffered events, and (with persist:false) the server is gone after the run.
import assert from "node:assert/strict";
import { Test, TestApplication, expect, type TestContext } from "@youneed/test";
import { DevtoolsReporter } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};

// A suite exercising pass / fail / skip, plus a step, annotation and attachment.
class Demo extends Test({ name: "Demo" }) {
  @Test.it("passes") a() {
    expect(1 + 1).toBe(2);
  }
  @Test.it("fails") b() {
    expect(1).toBe(2);
  }
  @Test.skip("skipped") c() {
    throw new Error("should not run");
  }
  @Test.it("with step + annotation")
  async d(ctx: TestContext) {
    ctx.annotate("issue", "JIRA-123");
    ctx.attach({ name: "log", body: "hello" });
    await ctx.step("inner", () => {
      expect(true).toBeTruthy();
    });
  }
}

// ── persist:true: run to completion, then inspect the still-live server ──────
const PORT = 47213;
const reporter = new DevtoolsReporter({ port: PORT, persist: true });
const base = `http://127.0.0.1:${PORT}`;

const summary = await TestApplication().addTests(Demo).reporter(reporter).run({ setExitCode: false });

ok("ran 4 tests", summary.total === 4);
ok("2 passed", summary.passed === 2);
ok("1 failed", summary.failed === 1);
ok("1 skipped", summary.skipped === 1);
ok("reporter.url is set", reporter.url === base);

// ── GET / serves the self-contained HTML page ────────────────────────────────
{
  const res = await fetch(base + "/");
  const html = await res.text();
  ok("GET / responds 200", res.status === 200);
  ok("GET / is HTML", (res.headers.get("content-type") || "").includes("text/html"));
  ok("page is the devtools UI", html.includes("<!doctype html>") && html.includes("youneed test devtools"));
  ok("page wires up the SSE stream", html.includes('new EventSource("/events")'));
}

// ── GET /events streams an event-stream and replays the buffered run ─────────
{
  const res = await fetch(base + "/events", {
    headers: { accept: "text/event-stream" },
    signal: AbortSignal.timeout(2000),
  });
  ok("GET /events is an event-stream", (res.headers.get("content-type") || "").includes("text/event-stream"));
  const reader = res.body!.getReader();
  let text = "";
  try {
    // The whole run is buffered, so the backlog arrives immediately; read until
    // we've seen a finished test (or the timeout aborts the stream).
    while (!text.includes("onTestEnd")) {
      const { value, done } = await reader.read();
      if (value) text += new TextDecoder().decode(value);
      if (done) break;
    }
  } catch {
    /* AbortSignal.timeout fired — fine, we keep whatever we read */
  }
  await reader.cancel().catch(() => {});
  ok("stream emits SSE data frames", /data: /.test(text));
  ok("stream replays buffered run events", text.includes("onRunStart") || text.includes("onSuiteStart"));
  ok("stream carries a test result", text.includes("onTestEnd"));
  ok("stream encodes the error safely", text.includes('"message"') && !text.includes("[object"));
}

// ── close() tears the server down ────────────────────────────────────────────
await reporter.close();
await new Promise((r) => setTimeout(r, 50)); // let the OS release the socket
let stillUp = false;
try {
  await fetch(base + "/", { signal: AbortSignal.timeout(500) });
  stillUp = true;
} catch {
  stillUp = false;
}
ok("server is closed after close()", !stillUp);
await reporter.close(); // idempotent
ok("close() is idempotent", true);

// ── persist:false closes the server on its own at onRunEnd ───────────────────
{
  const PORT2 = 47214;
  const r2 = new DevtoolsReporter({ port: PORT2, persist: false });
  await TestApplication().addTests(Demo).reporter(r2).run({ setExitCode: false });
  await new Promise((r) => setTimeout(r, 50));
  let up = false;
  try {
    await fetch(`http://127.0.0.1:${PORT2}/`, { signal: AbortSignal.timeout(500) });
    up = true;
  } catch {
    up = false;
  }
  ok("persist:false closes the server on onRunEnd", !up);
}

console.log(`\nall checks passed (${checks})`);
