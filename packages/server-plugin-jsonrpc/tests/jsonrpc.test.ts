// Run: pnpm --filter @youneed/server-plugin-jsonrpc test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, type Context, type HTTP } from "@youneed/server";
import { t } from "@youneed/schema";
import { JsonRPC, JsonRPCResponse, JsonRPCErrorResponse, jsonrpc } from "../src/index.ts";

let lastCtxSeen = false;

class MathEndpoint extends JsonRPC({ guards: [] }) {
  @JsonRPC.method("sum", { args: [t.number(), t.number()], returns: t.number(), description: "add two numbers" })
  sum(a: number, b: number, ctx?: Context) {
    lastCtxSeen = ctx !== undefined;
    if (a > 10) return JsonRPCResponse.error({ code: -32000, message: "something went wrong" });
    return JsonRPCResponse.success({ result: a + b });
  }

  @JsonRPC.method("subscribe", { description: "push a tick event, then ack" })
  subscribe() {
    // Server-initiated EVENT frame to THIS client (no-op over POST).
    this.emit("tick", { n: 1 });
    return JsonRPCResponse.success({ ok: true });
  }

  @JsonRPC.method("boom")
  boom() {
    return JsonRPCResponse.error(JsonRPCErrorResponse.InternalError);
  }

  @JsonRPC.method("echo")
  echo(value: unknown) {
    // No `args` schema → raw params passed through; plain return = success.
    return value;
  }
}

const PORT = 41737;
const BASE = `http://127.0.0.1:${PORT}`;

async function rpc(body: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(`${BASE}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() };
}

class JsonRpcSuite extends Test({ name: "server-plugin-jsonrpc" }) {
  #server!: HTTP;

  @Test.beforeAll() async start() {
    const app = Application().plugin(
      jsonrpc((r) => ({
        endpoints: [MathEndpoint],
        connection: (s) => s.use("/rpc", r.post),
      })),
    );
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(PORT, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("success: echoes the request id") async ok() {
    const { status, json } = await rpc({ jsonrpc: "2.0", method: "sum", params: [1, 2], id: 1 });
    expect(status).toBe(200);
    expect(json.id).toBe(1);
    expect(json.result.result).toBe(3);
    expect(lastCtxSeen).toBeTruthy(); // ctx passed as trailing arg
  }

  @Test.it("unknown method → -32601 with the request id") async notFound() {
    const { json } = await rpc({ jsonrpc: "2.0", method: "фыв", params: [1, "asd"], id: 1 });
    expect(json.id).toBe(1);
    expect(json.error.code).toBe(-32601);
    expect(json.error.message).toBe("Method not found");
  }

  @Test.it("bad params → -32602 with a generated id") async badParams() {
    const { json } = await rpc({ jsonrpc: "2.0", method: "sum", params: [1, "asd"] });
    expect(json.error.code).toBe(-32602);
    // No id in the request → server generated one (a non-empty string).
    expect(typeof json.id === "string" && json.id.length > 0).toBeTruthy();
  }

  @Test.it("handler error wins over a success") async handlerError() {
    const { json } = await rpc({ jsonrpc: "2.0", method: "sum", params: [20, 1], id: 7 });
    expect(json.id).toBe(7);
    expect(json.error.code).toBe(-32000);
    expect("result" in json).toBeFalsy();
  }

  @Test.it("predefined error map") async predefined() {
    const { json } = await rpc({ jsonrpc: "2.0", method: "boom", id: 9 });
    expect(json.error.code).toBe(-32603);
  }

  @Test.it("schema-less method passes raw params; plain return = success") async raw() {
    const { json } = await rpc({ jsonrpc: "2.0", method: "echo", params: ["hi"], id: 2 });
    expect(json.result).toBe("hi");
  }

  @Test.it("invalid envelope → -32600") async invalid() {
    const { json } = await rpc({ method: "sum", params: [1, 2], id: 3 });
    expect(json.error.code).toBe(-32600);
  }

  @Test.it("batch: array in → array out") async batch() {
    const { json } = await rpc([
      { jsonrpc: "2.0", method: "sum", params: [1, 2], id: 1 },
      { jsonrpc: "2.0", method: "sum", params: [3, 4], id: 2 },
    ]);
    expect(Array.isArray(json)).toBeTruthy();
    expect(json[0].result.result).toBe(3);
    expect(json[1].result.result).toBe(7);
  }

  @Test.it("schema .parse: typed accept + reject + coerce") parse() {
    expect(t.number().parse(5)).toEqual({ success: true, value: 5 });
    expect(t.number().parse("asd").success).toBeFalsy();
    expect(t.int().parse("42")).toEqual({ success: true, value: 42 }); // string coerced
    expect(t.number().parse(true).success).toBeFalsy(); // wrong native type
  }

  @Test.it("rpc.discover: self-description (OpenRPC)") async discover() {
    const { json } = await rpc({ jsonrpc: "2.0", method: "rpc.discover", id: 5 });
    expect(json.id).toBe(5);
    expect(json.result.openrpc).toBe("1.2.6");
    const sum = json.result.methods.find((m: any) => m.name === "sum");
    expect(sum.description).toBe("add two numbers");
    expect(sum.params[0].schema.type).toBe("number");
    expect(sum.params[0].required).toBeTruthy();
    expect(sum.result.schema.type).toBe("number");
  }
}

// ── WebSocket transport: request/response + server→client events ──────────────

const WS_PORT = 41738;

function wsConnect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const s = new WebSocket(url);
    s.onopen = () => resolve(s);
    s.onerror = () => reject(new Error("ws connect failed"));
  });
}

function gather(sock: WebSocket, count: number, ms = 1000): Promise<any[]> {
  return new Promise((resolve) => {
    const out: any[] = [];
    const timer = setTimeout(() => resolve(out), ms);
    sock.onmessage = (e) => {
      out.push(JSON.parse(String(e.data)));
      if (out.length >= count) {
        clearTimeout(timer);
        resolve(out);
      }
    };
  });
}

class JsonRpcWsSuite extends Test({ name: "server-plugin-jsonrpc · ws" }) {
  #server!: HTTP;

  @Test.beforeAll() async start() {
    const app = Application().plugin(
      jsonrpc((r) => ({
        endpoints: [MathEndpoint],
        connection: (s) => s.ws("/rpc", r.ws),
      })),
    );
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(WS_PORT, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("request/response over a WebSocket frame") async reqResp() {
    const sock = await wsConnect(`ws://127.0.0.1:${WS_PORT}/rpc`);
    const frames = gather(sock, 1);
    sock.send(JSON.stringify({ jsonrpc: "2.0", method: "sum", params: [2, 3], id: 9 }));
    const [f] = await frames;
    sock.close();
    expect(f.id).toBe(9);
    expect(f.result.result).toBe(5);
  }

  @Test.it("server→client event (this.emit) arrives as a notification frame") async event() {
    const sock = await wsConnect(`ws://127.0.0.1:${WS_PORT}/rpc`);
    const framesP = gather(sock, 2);
    sock.send(JSON.stringify({ jsonrpc: "2.0", method: "subscribe", id: 1 }));
    const frames = await framesP;
    sock.close();
    const event = frames.find((f) => f.method === "tick");
    const resp = frames.find((f) => f.id === 1);
    expect(event?.params.n).toBe(1); // event has no id
    expect(event?.id).toBeUndefined();
    expect(resp?.result.ok).toBeTruthy();
  }
}

await TestApplication().addTests(JsonRpcSuite, JsonRpcWsSuite).reporter(new ConsoleReporter()).run();
