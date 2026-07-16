// Cross-framework + cross-runtime HTTP throughput. Compares @youneed/server
// under node / Bun / Deno against Node native, Bun native, Express, Elysia and
// NestJS. Each app boots in its OWN process under the right runtime (node, `node
// --import tsx`, bun or deno), then autocannon hammers one endpoint with keep-
// alive + concurrency. We measure one app at a time so they never contend.
//
// Run:  pnpm --filter @youneed/server bench:frameworks
//       pnpm --filter @youneed/server bench:frameworks -- --endpoint=/text --connections=100 --duration=8
//
// Bun/Deno entries are skipped automatically when the runtime isn't on PATH.
// Numbers drift between runs (shared machine, sequential combos) — trust back-
// to-back deltas on one box, not absolutes.
import autocannon from "autocannon";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 41040;
const HOST = "127.0.0.1";

// ── CLI args ──
const arg = (name: string, fallback: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ENDPOINT = arg("endpoint", "/json");
const CONNECTIONS = Number(arg("connections", "50"));
const DURATION = Number(arg("duration", "6"));
const URL = `http://${HOST}:${PORT}${ENDPOINT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const hasBun = spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;
const hasDeno = spawnSync("deno", ["--version"], { stdio: "ignore" }).status === 0;
// TS apps run on node with tsx's loader (`node --import tsx`) — avoids hunting
// for the tsx binary, which the hoisted node_modules puts at the repo root.
const node = process.execPath;
const tsxApp = (file: string) => ({ cmd: node, args: ["--import", "tsx", file] });

interface App {
  label: string;
  /** Command + args + env. null = skip with a reason. */
  spawn: () => { cmd: string; args: string[]; env?: Record<string, string> } | null;
  skip?: string;
}

const app = (p: string) => resolve(HERE, "apps", p);

const APPS: App[] = [
  // Our server, the SAME app file, run under each runtime — node:http rides
  // Bun's and Deno's node-compat layers (the bench only hits HTTP, no WS).
  { label: "@youneed/server (node)", spawn: () => tsxApp(app("ours.ts")) },
  {
    label: "@youneed/server (bun)",
    skip: hasBun ? undefined : "bun not on PATH",
    spawn: () => (hasBun ? { cmd: "bun", args: [app("ours.ts")] } : null),
  },
  {
    label: "@youneed/server (deno)",
    skip: hasDeno ? undefined : "deno not on PATH",
    spawn: () => (hasDeno ? { cmd: "deno", args: ["run", "-A", app("ours.ts")] } : null),
  },
  { label: "node native", spawn: () => ({ cmd: node, args: [app("node-native.mjs")] }) },
  {
    label: "bun native",
    skip: hasBun ? undefined : "bun not on PATH",
    spawn: () => (hasBun ? { cmd: "bun", args: [app("bun-native.ts")] } : null),
  },
  {
    label: "deno native",
    skip: hasDeno ? undefined : "deno not on PATH",
    spawn: () => (hasDeno ? { cmd: "deno", args: ["run", "-A", app("deno-native.ts")] } : null),
  },
  { label: "express", spawn: () => ({ cmd: node, args: [app("express.mjs")] }) },
  { label: "elysia", spawn: () => tsxApp(app("elysia.ts")) },
  {
    label: "nestjs",
    // Nest needs legacy decorators — tsx reads the dedicated tsconfig via env.
    spawn: () => ({ ...tsxApp(app("nest.ts")), env: { TSX_TSCONFIG_PATH: app("nest.tsconfig.json") } }),
  },
];

/** Resolve once the port accepts connections (the app is listening). */
function waitForPort(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const probe = () => {
      const s = net.connect({ host: HOST, port: PORT }, () => {
        s.destroy();
        resolve(true);
      });
      s.on("error", () => {
        s.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(probe, 150);
      });
    };
    probe();
  });
}

/** Resolve once the port is free again — bounded, so a stuck child can't hang us. */
function waitPortFree(maxTries = 50): Promise<void> {
  return new Promise((resolve) => {
    let tries = 0;
    const probe = () => {
      const s = net.connect({ host: HOST, port: PORT }, () => {
        s.destroy();
        if (++tries >= maxTries) resolve(); // give up — teardown fallback handles it
        else setTimeout(probe, 100);
      });
      s.on("error", () => {
        s.destroy();
        resolve();
      });
      s.setTimeout(200, () => {
        s.destroy();
        resolve();
      });
    };
    probe();
  });
}

/** Kill a spawned app and everything it forked. `bun script.ts` (and tsx) can
 *  fork a child that actually holds the port, so SIGKILL the whole PROCESS GROUP
 *  (the child was spawned `detached`, making it the group leader). */
function killTree(child: ChildProcess): void {
  if (child.pid == null) return;
  try {
    process.kill(-child.pid, "SIGKILL"); // negative pid → the group
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

interface Row {
  label: string;
  rps?: number;
  p99?: number;
  note?: string;
}

async function measure(a: App): Promise<Row> {
  const plan = a.spawn?.();
  if (!plan) return { label: a.label, note: a.skip ?? "skipped" };

  const child: ChildProcess = spawn(plan.cmd, plan.args, {
    cwd: resolve(HERE, ".."),
    env: { ...process.env, BENCH_PORT: String(PORT), ...plan.env },
    stdio: ["ignore", "ignore", "pipe"],
    detached: true, // own process group, so killTree() reaps forked grandchildren
  });
  let stderr = "";
  child.stderr?.on("data", (d) => (stderr += d.toString()));

  try {
    const up = await waitForPort();
    if (!up) {
      killTree(child);
      return { label: a.label, note: `did not listen${stderr ? `: ${stderr.split("\n")[0]}` : ""}` };
    }
    await autocannon({ url: URL, connections: CONNECTIONS, duration: 2 }); // warmup
    const r = await autocannon({ url: URL, connections: CONNECTIONS, duration: DURATION });
    return { label: a.label, rps: r.requests.average, p99: r.latency.p99 };
  } catch (err) {
    return { label: a.label, note: (err as Error).message };
  } finally {
    killTree(child);
    await waitPortFree();
    await sleep(200);
  }
}

const rows: Row[] = [];
for (const a of APPS) {
  process.stdout.write(`  benchmarking ${a.label}…\n`);
  rows.push(await measure(a));
}

const ran = rows.filter((r) => r.rps != null);
const fastest = ran.length ? Math.max(...ran.map((r) => r.rps!)) : 0;
const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

console.log(
  `\nserver — GET ${ENDPOINT} throughput (${CONNECTIONS} conns, ${DURATION}s, autocannon)\n`,
);
for (const r of rows.sort((a, b) => (b.rps ?? -1) - (a.rps ?? -1))) {
  if (r.rps == null) {
    console.log(`  ${r.label.padEnd(24)} ${"—".padStart(12)}   ${r.note ?? "n/a"}`);
    continue;
  }
  const rel = r.rps === fastest ? "▲ fastest" : `${(fastest / r.rps).toFixed(2)}× slower`;
  console.log(`  ${r.label.padEnd(24)} ${`${k(r.rps)} req/s`.padStart(12)}   p99 ${r.p99}ms   ${rel}`);
}
process.exit(0);
