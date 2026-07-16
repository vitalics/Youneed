// Run: pnpm --filter @youneed/server-plugin-otlp test
// OTLP/HTTP JSON encoding + exporter batching, with an injected fake fetch — no network.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { Span } from "@youneed/server-middleware-trace";
import { OtlpExporter, toOtlpTraces } from "../src/index.ts";

function makeSpan(over: Partial<Span> = {}): Span {
  const base: Span = {
    traceId: "0123456789abcdef0123456789abcdef",
    spanId: "0123456789abcdef",
    parentId: undefined,
    name: "GET /users",
    startTime: 1000,
    endTime: 1042,
    duration: 42,
    attributes: { "http.method": "GET", "http.status_code": 200 },
    events: [{ name: "queried-db", time: 1010 }],
    setAttribute() {
      return base;
    },
    addEvent() {
      return base;
    },
    end() {},
  };
  return { ...base, ...over };
}

/** A fetch double capturing the last request. */
function fakeFetch(status = 200) {
  const calls: Array<{ url: string; body: any }> = [];
  const fn = (async (url: string, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body as string) });
    return { ok: status < 400, status } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

class OtlpSuite extends Test({ name: "@youneed/server-plugin-otlp" }) {
  @Test.it("encodes spans as OTLP/HTTP JSON") encode() {
    const body = toOtlpTraces([makeSpan()], { "service.name": "api" }, { name: "test", version: "1" }) as any;
    const rs = body.resourceSpans[0];
    expect(rs.resource.attributes[0]).toEqual({ key: "service.name", value: { stringValue: "api" } });
    const span = rs.scopeSpans[0].spans[0];
    expect(span.traceId).toBe("0123456789abcdef0123456789abcdef");
    expect(span.spanId).toBe("0123456789abcdef");
    expect(span.name).toBe("GET /users");
    expect(span.kind).toBe(2); // SERVER
    expect(span.startTimeUnixNano).toBe("1000000000"); // 1000ms → ns
    expect(span.endTimeUnixNano).toBe("1042000000");
    expect(span.events[0]).toEqual({ timeUnixNano: "1010000000", name: "queried-db" });
    expect(span.status.code).toBe(0); // UNSET (200)
    // int attribute encoded as decimal string
    const status = span.attributes.find((a: any) => a.key === "http.status_code");
    expect(status.value).toEqual({ intValue: "200" });
  }

  @Test.it("marks 5xx / error spans as OTLP status ERROR (2)") errorStatus() {
    const body = toOtlpTraces([makeSpan({ attributes: { "http.status_code": 503 } })], {}, { name: "s" }) as any;
    expect(body.resourceSpans[0].scopeSpans[0].spans[0].status.code).toBe(2);
  }

  @Test.it("auto-flushes when the batch size is reached") async autoFlush() {
    const { fn, calls } = fakeFetch();
    const exp = new OtlpExporter({ endpoint: "http://collector:4318", batchSize: 2, flushMs: 0, fetch: fn });
    exp.push(makeSpan({ spanId: "aaaaaaaaaaaaaaaa" }));
    expect(calls.length).toBe(0); // 1 < batchSize
    exp.push(makeSpan({ spanId: "bbbbbbbbbbbbbbbb" }));
    await new Promise((r) => setTimeout(r, 5)); // let the fire-and-forget flush settle
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("http://collector:4318/v1/traces");
    expect(calls[0]!.body.resourceSpans[0].scopeSpans[0].spans.length).toBe(2);
    const stats = exp.stats();
    expect(stats.exported).toBe(2);
    expect(stats.queued).toBe(0);
  }

  @Test.it("flush() ships buffered spans and records recent + counts") async manualFlush() {
    const { fn, calls } = fakeFetch();
    const exp = new OtlpExporter({ endpoint: "http://c:4318/v1/traces", flushMs: 0, fetch: fn });
    exp.push(makeSpan());
    await exp.flush();
    expect(calls.length).toBe(1);
    expect(calls[0]!.url).toBe("http://c:4318/v1/traces"); // not double-appended
    const stats = exp.stats();
    expect(stats.exported).toBe(1);
    expect(stats.recent[0]?.name).toBe("GET /users");
    // empty flush is a no-op
    await exp.flush();
    expect(calls.length).toBe(1);
  }

  @Test.it("counts failures on a non-2xx response") async failure() {
    const { fn } = fakeFetch(500);
    const exp = new OtlpExporter({ endpoint: "http://c:4318", flushMs: 0, fetch: fn });
    exp.push(makeSpan());
    await exp.flush();
    const stats = exp.stats();
    expect(stats.failed).toBe(1);
    expect(stats.exported).toBe(0);
    expect(stats.lastError).toBe("HTTP 500");
  }
}

await TestApplication().addTests(OtlpSuite).reporter(new ConsoleReporter()).run();
