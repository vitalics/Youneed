// Run: pnpm --filter @youneed/server-plugin-pubsub-redis test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createServer, type Server, type Socket } from "node:net";
import { redisPubSub } from "../src/index.ts";

// A tiny in-process Redis pub/sub broker (SUBSCRIBE/UNSUBSCRIBE/PUBLISH) so the
// real RedisPubSub client is exercised end-to-end without a Redis server.
const CRLF = "\r\n";
const bulk = (s: string) => `$${Buffer.byteLength(s)}${CRLF}${s}${CRLF}`;

// Parse one client command (RESP array of bulk strings) → [args, next] | null.
function parseCommand(buf: Buffer, pos: number): [string[], number] | null {
  if (buf[pos] !== 0x2a) return null; // '*'
  let eol = buf.indexOf("\r\n", pos);
  if (eol === -1) return null;
  const n = Number(buf.toString("utf8", pos + 1, eol));
  let p = eol + 2;
  const args: string[] = [];
  for (let i = 0; i < n; i++) {
    if (buf[p] !== 0x24) return null; // '$'
    eol = buf.indexOf("\r\n", p);
    if (eol === -1) return null;
    const len = Number(buf.toString("utf8", p + 1, eol));
    const start = eol + 2;
    if (start + len + 2 > buf.length) return null;
    args.push(buf.toString("utf8", start, start + len));
    p = start + len + 2;
  }
  return [args, p];
}

function startBroker(port: number): Promise<Server> {
  const channels = new Map<string, Set<Socket>>();
  const server = createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const parsed = parseCommand(buf, 0);
        if (!parsed) break;
        buf = buf.subarray(parsed[1]);
        const [cmd, ...args] = parsed[0];
        const c = cmd.toUpperCase();
        if (c === "SUBSCRIBE") {
          const chan = args[0];
          (channels.get(chan) ?? channels.set(chan, new Set()).get(chan)!).add(sock);
          sock.write(`*3${CRLF}${bulk("subscribe")}${bulk(chan)}:1${CRLF}`);
        } else if (c === "UNSUBSCRIBE") {
          channels.get(args[0])?.delete(sock);
          sock.write(`*3${CRLF}${bulk("unsubscribe")}${bulk(args[0])}:0${CRLF}`);
        } else if (c === "PUBLISH") {
          const [chan, msg] = args;
          const subs = channels.get(chan);
          if (subs) for (const s of subs) s.write(`*3${CRLF}${bulk("message")}${bulk(chan)}${bulk(msg)}`);
          sock.write(`:${subs ? subs.size : 0}${CRLF}`);
        } else {
          sock.write(`+OK${CRLF}`); // AUTH/SELECT/etc
        }
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

class PubSubRedisSuite extends Test({ name: "server-plugin-pubsub-redis" }) {
  #broker!: Server;
  port = 6390;

  @Test.beforeAll() async start() {
    this.#broker = await startBroker(this.port);
  }
  @Test.afterAll() async stop() {
    await new Promise<void>((r) => this.#broker.close(() => r()));
  }

  @Test.it("subscribe + publish round-trips through Redis SUBSCRIBE/PUBLISH") async roundtrip() {
    const bus = redisPubSub({ port: this.port });
    const got: string[] = [];
    let resolveMsg!: () => void;
    const received = new Promise<void>((r) => (resolveMsg = r));
    await bus.subscribe("news", (m, ch) => {
      got.push(`${ch}:${m}`);
      resolveMsg();
    });
    await delay(30); // let SUBSCRIBE register at the broker
    await bus.publish("news", "hello");
    await Promise.race([received, delay(1000)]);
    await bus.close();
    expect(got[0] === "news:hello").toBeTruthy();
  }

  @Test.it("unsubscribe stops delivery") async unsub() {
    const bus = redisPubSub({ port: this.port });
    const got: string[] = [];
    const sub = await bus.subscribe("room", (m) => void got.push(m));
    await delay(30);
    await sub.close();
    await delay(20);
    await bus.publish("room", "after-unsub");
    await delay(50);
    await bus.close();
    expect(got.length).toBe(0);
  }
}

await TestApplication().addTests(PubSubRedisSuite).reporter(new ConsoleReporter()).run();
