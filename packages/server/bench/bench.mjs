// Micro-benchmark for @youneed/server: boot the app once (node + tsx), then
// drive `hyperfine` + `curl`/`bash` over each endpoint and collect the numbers.
// Same methodology as the repo-level /bench harness, scoped to our server.
//
//   node bench.mjs [--endpoints=json,text,file,...] [--runs=N] [--quick]
//
// Requires: hyperfine, curl, bash on PATH (tsx via the local toolchain).
//
// NOTE: hyperfine+curl times ONE request INCLUDING curl's own process startup
// (a ~ms floor), so absolute numbers understate raw server speed. It is the
// right tool for relative before/after comparisons on the same machine; for
// req/s under keep-alive + concurrency, use an autocannon load test instead.
import { spawn, execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

// A stray socket error from a dying server must never abort the run.
process.on("uncaughtException", (e) => console.log(`  ! ignored: ${e.message}`));
process.on("unhandledRejection", (e) => console.log(`  ! ignored: ${e?.message ?? e}`));

const BENCH = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 41100);
const HOST = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const quick = !!args.quick;
const scale = quick ? 0.25 : 1;
const runsOverride = args.runs ? Number(args.runs) : null;
const r = (n) => runsOverride ?? Math.max(5, Math.round(n * scale));

// ── endpoint plan ──────────────────────────────────────────────────────────────
// shellNone (default true): exec curl directly, no `sh -c` wrapper. CRUD runs a
// bash script, so it keeps the shell. `probe` runs the command once up front to
// fail fast on a broken stream instead of burning (warmup+runs) × timeout.
const ALL = [
  { key: "file", label: "Static File", runs: r(200), warmup: 15, cmd: `curl -s ${HOST}/file` },
  { key: "json", label: "JSON", runs: r(200), warmup: 15, cmd: `curl -s ${HOST}/json` },
  { key: "json-typed", label: "JSON (compiled serializer)", runs: r(200), warmup: 15, cmd: `curl -s ${HOST}/json-typed` },
  { key: "json-cached", label: "JSON (compiled cache)", runs: r(200), warmup: 15, cmd: `curl -s ${HOST}/json-cached` },
  { key: "text", label: "Text", runs: r(200), warmup: 15, cmd: `curl -s ${HOST}/text` },
  { key: "crud", label: "CRUD cycle", runs: r(80), warmup: 8, shellNone: false, cmd: `bash crud.sh ${PORT}` },
  { key: "sse", label: "SSE (bounded)", runs: r(120), warmup: 10, probe: true, cmd: `curl -sN --max-time 5 ${HOST}/sse` },
  // WebSocket connect → send → echo → exit, measured by a tiny node client.
  // hyperfine times the whole process (node startup floor), so read it relative.
  { key: "ws", label: "WebSocket (echo RTT)", runs: r(40), warmup: 4, probe: true, cmd: `node ws-client.mjs ${HOST.replace("http", "ws")}/ws` },
];
const want = typeof args.endpoints === "string" ? args.endpoints.split(",") : ALL.map((e) => e.key);
const plan = ALL.filter((e) => want.includes(e.key));

// ── server lifecycle ──────────────────────────────────────────────────────────
function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.setTimeout(300, () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${HOST}/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) return true;
    } catch {}
    await sleep(150);
  }
  return false;
}

// SIGKILL whatever still LISTENS on the port. `-sTCP:LISTEN` is critical: a
// plain `lsof -ti :PORT` also lists our own client sockets → self-SIGKILL.
function killPortListeners() {
  try {
    execSync(`lsof -ti :${PORT} -sTCP:LISTEN`, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(Number)
      .filter((pid) => pid && pid !== process.pid)
      .forEach((pid) => {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      });
  } catch {}
}

// Free the port BEFORE booting — a zombie from a prior run would both cause
// EADDRINUSE for the fresh server AND answer /health, so we'd measure the stale
// process. Kill any listener, then wait for the port to actually close.
async function freePort() {
  killPortListeners();
  for (let i = 0; i < 25; i++) {
    if (!(await portOpen(PORT))) return;
    await sleep(150);
  }
}

async function withServer(fn) {
  await freePort();
  const child = spawn("node", ["--import", "tsx", "app.ts"], {
    cwd: BENCH,
    env: { ...process.env, PORT: String(PORT) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  let exited = null;
  child.on("exit", (code) => (exited = code));

  try {
    if (!(await waitForHealth(15000))) {
      const reason = exited !== null ? `exited (code ${exited})` : "no /health in 15s";
      const tail = log.trim().split("\n").slice(-4).join(" | ").slice(0, 400);
      throw new Error(`server did not boot — ${reason}${tail ? " — " + tail : ""}`);
    }
    return await fn();
  } finally {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    killPortListeners();
    for (let i = 0; i < 25; i++) {
      if (!(await portOpen(PORT))) break;
      await sleep(150);
    }
  }
}

// ── hyperfine ──────────────────────────────────────────────────────────────────
function hyperfine(command, { runs, warmup, shellNone = true }) {
  const out = join(BENCH, "results", ".tmp.json");
  const a = [];
  if (shellNone) a.push("--shell=none");
  a.push("--warmup", String(warmup), "--runs", String(runs), "--export-json", out, command);
  execFileSync("hyperfine", a, { cwd: BENCH, stdio: "ignore" });
  const res = JSON.parse(readFileSync(out, "utf8")).results[0];
  const ms = (s) => Math.round(s * 1e6) / 1000; // → ms, 3 decimals
  return { mean: ms(res.mean), stddev: ms(res.stddev ?? 0), min: ms(res.min), max: ms(res.max), median: ms(res.median) };
}

function probeOnce(command, shellNone) {
  if (shellNone) {
    const [bin, ...a] = command.split(" ");
    execFileSync(bin, a, { cwd: BENCH, stdio: "ignore", timeout: 7000 });
  } else {
    execSync(command, { cwd: BENCH, stdio: "ignore", timeout: 7000 });
  }
}

const cleanReason = (s) =>
  String(s ?? "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

// ── run ──────────────────────────────────────────────────────────────────────
function have(bin) {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
for (const bin of ["hyperfine", "curl", "bash"]) {
  if (!have(bin)) {
    console.error(`✖ '${bin}' not found on PATH — install it to run the benchmark.`);
    process.exit(1);
  }
}

mkdirSync(join(BENCH, "results"), { recursive: true });

console.log(`\n@youneed/server bench — endpoints: ${plan.map((e) => e.key).join(", ")} · mode: ${quick ? "quick" : "full"}\n`);

// Measure one endpoint. hyperfine aborts the whole run if a single curl exits
// non-zero (a transient connection hiccup under back-to-back churn), so when the
// server is still healthy we retry once before giving up.
async function measureEndpoint(e) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (e.probe) probeOnce(e.cmd, e.shellNone !== false);
      return hyperfine(e.cmd, e);
    } catch (err) {
      const serverUp = await waitForHealth(2000);
      if (serverUp && attempt === 1) {
        await sleep(800); // let connection churn drain, then retry once
        continue;
      }
      return { error: true, reason: cleanReason(err.message || err) };
    }
  }
}

const measured = await withServer(async () => {
  const out = {};
  process.stdout.write("▶ measuring: ");
  for (const e of plan) {
    process.stdout.write(`${e.key} `);
    out[e.key] = await measureEndpoint(e);
    await sleep(300); // settle between endpoints (drain short-lived sockets)
  }
  console.log("\n");
  return out;
});

// ── output ──────────────────────────────────────────────────────────────────
const notes = [];
const cell = (v) => {
  if (!v) return "—";
  if (v.error) {
    notes.push(v.reason);
    return `err [${notes.length}]`;
  }
  return `${v.mean.toFixed(2)} ± ${v.stddev.toFixed(2)}`;
};

let md = `# @youneed/server — benchmark results\n\n`;
md += `Mean wall-clock per request in **milliseconds** (lower is better), \`mean ± stddev\`, via \`hyperfine\` + \`curl\`.\n`;
md += `Mode: ${quick ? "quick" : "full"}. Runtime: node + tsx.\n\n`;
md += `| Endpoint | mean ± stddev (ms) | median | min | max |\n`;
md += `| --- | --- | --- | --- | --- |\n`;
for (const e of plan) {
  const v = measured[e.key];
  const extra = v && !v.error ? `| ${v.median.toFixed(2)} | ${v.min.toFixed(2)} | ${v.max.toFixed(2)} |` : `| — | — | — |`;
  md += `| ${e.label} | ${cell(v)} ${extra}\n`;
}
if (notes.length) {
  md += `\n## Notes\n\n`;
  notes.forEach((n, i) => (md += `${i + 1}. ${n}\n`));
}

writeFileSync(join(BENCH, "results", "RESULTS.md"), md);
writeFileSync(join(BENCH, "results", "results.json"), JSON.stringify({ port: PORT, quick, measured }, null, 2));

console.log(`Wrote results/RESULTS.md and results/results.json\n`);
console.log(md);
