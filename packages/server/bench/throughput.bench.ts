// HTTP throughput: @youneed/server vs Fastify vs bare node:http.
// autocannon (keep-alive + concurrency) hits GET /json on each, in turn.
// Run: pnpm --filter @youneed/server bench
import autocannon from "autocannon";
import Fastify from "fastify";
import { createServer } from "node:http";
import net from "node:net";
import { Application, Response } from "../src/server.ts";

const PORT = 41030;
const URL = `http://127.0.0.1:${PORT}/json`;
const PAYLOAD = { message: "Hello, World!", items: [1, 2, 3, 4, 5], nested: { ok: true } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function portFree(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port: PORT }, () => {
      s.destroy();
      resolve(false);
    });
    s.on("error", () => resolve(true));
    s.setTimeout(200, () => {
      s.destroy();
      resolve(true);
    });
  });
}

async function run(label: string, start: () => Promise<() => Promise<void>>) {
  const stop = await start();
  try {
    await autocannon({ url: URL, connections: 50, duration: 2 }); // warmup
    const r = await autocannon({ url: URL, connections: 50, duration: 6 });
    return { label, rps: r.requests.average, p99: r.latency.p99 };
  } finally {
    await stop();
    for (let i = 0; i < 25 && !(await portFree()); i++) await sleep(100);
  }
}

const results = [];

// ── @youneed/server ──
results.push(
  await run("@youneed/server", async () => {
    const http = Application()
      .get("/json", () => Response.json(PAYLOAD))
      .listen(PORT, () => {});
    await sleep(300);
    return () => http.close();
  }),
);

// ── Fastify ──
results.push(
  await run("fastify", async () => {
    const app = Fastify({ logger: false });
    app.get("/json", () => PAYLOAD);
    await app.listen({ port: PORT, host: "127.0.0.1" });
    return () => app.close();
  }),
);

// ── bare node:http ──
results.push(
  await run("node:http (raw)", async () => {
    const server = createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(PAYLOAD));
    });
    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    return () => new Promise<void>((resolve) => server.close(() => resolve()));
  }),
);

const fastest = Math.max(...results.map((r) => r.rps));
console.log("\nserver — GET /json throughput (node, 50 conns, autocannon)");
for (const r of results.sort((a, b) => b.rps - a.rps)) {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
  const rel = r.rps === fastest ? "▲ fastest" : `${(fastest / r.rps).toFixed(2)}× slower`;
  console.log(`  ${r.label.padEnd(18)} ${`${k(r.rps)} req/s`.padStart(12)}   p99 ${r.p99}ms   ${rel}`);
}
process.exit(0);
