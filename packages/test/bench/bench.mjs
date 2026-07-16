// Test-runner shoot-out for @youneed/test: run the SAME workload (FILES × TESTS,
// see gen.mjs) under each runner — our `youneed-test`, node:test, vitest, jest,
// and @playwright/test (no browser) — and time each whole invocation with
// `hyperfine`. Same methodology as packages/server/bench/bench.mjs.
//
//   node bench.mjs [--runners=youneed,node,vitest,...] [--runs=N] [--quick]
//
// Requires: hyperfine on PATH. Missing runners (no bin / not in node_modules) are
// skipped with a printed note instead of aborting the run.
//
// NOTE: hyperfine times the ENTIRE command, including process startup, module
// load, and runner bootstrap — which is exactly the overhead we want to compare
// on an identical 1000-case workload. Absolute ms are machine-specific; trust the
// relative multipliers back-to-back on one box.
import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A stray child error must never abort the whole sweep.
process.on("uncaughtException", (e) => console.log(`  ! ignored: ${e.message}`));
process.on("unhandledRejection", (e) => console.log(`  ! ignored: ${e?.message ?? e}`));

const BENCH = dirname(fileURLToPath(import.meta.url));
const PKG = dirname(BENCH); // packages/test
const CLI_TS = join(PKG, "src", "cli.ts"); // run our CLI under tsx directly

// Resolve a runner's bin by walking up from packages/test looking for
// node_modules/.bin/<name> — pnpm with node-linker=hoisted puts them at the repo
// root, not in the package's own node_modules. Returns "" if not found.
function BIN(name) {
  let dir = PKG;
  for (let i = 0; i < 6; i++) {
    const p = join(dir, "node_modules", ".bin", name);
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return "";
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const quick = !!args.quick;
const scale = quick ? 0.4 : 1;
const runsOverride = args.runs ? Number(args.runs) : null;
const r = (n) => runsOverride ?? Math.max(3, Math.round(n * scale));

// ── runner plan ──────────────────────────────────────────────────────────────
// Each runner: how to detect it, and the argv to run its workload from `BENCH`.
// `shellNone` execs the binary directly (no `sh -c`). The youneed runner is the
// baseline every multiplier is computed against.
const ALL = [
  {
    key: "youneed",
    label: "@youneed/test",
    runs: r(12),
    warmup: 2,
    baseline: true,
    detect: () => existsSync(CLI_TS),
    bin: "node",
    // our CLI does its OWN globbing, so quote the pattern to keep the shell from
    // touching it.
    argv: ["--import", "tsx", CLI_TS, "'workloads/youneed/**/*.test.ts'"],
  },
  {
    key: "node",
    label: "node:test",
    runs: r(12),
    warmup: 2,
    detect: () => true,
    bin: "node",
    // glob (not a dir): node v24 treats a bare path positional as a module to
    // run; the glob makes it discover test files. The shell expands it (hyperfine
    // runs via sh), and probeOnce expands it explicitly below.
    argv: ["--test", "workloads/node/*.test.mjs"],
  },
  {
    key: "vitest",
    label: "vitest",
    runs: r(10),
    warmup: 2,
    detect: () => existsSync(BIN("vitest")),
    bin: BIN("vitest"),
    argv: ["run", "--config", "vitest.config.mjs"],
  },
  {
    key: "jest",
    label: "jest",
    runs: r(10),
    warmup: 2,
    detect: () => existsSync(BIN("jest")),
    bin: BIN("jest"),
    argv: ["--config", "jest.config.cjs"],
  },
  {
    key: "playwright",
    label: "@playwright/test",
    runs: r(10),
    warmup: 2,
    detect: () => existsSync(BIN("playwright")),
    bin: BIN("playwright"),
    argv: ["test", "--config", "playwright.config.mjs"],
  },
];
const want = typeof args.runners === "string" ? args.runners.split(",") : ALL.map((e) => e.key);
const plan = ALL.filter((e) => want.includes(e.key));

// ── helpers ──────────────────────────────────────────────────────────────────
function have(bin) {
  try {
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const cleanReason = (s) =>
  String(s ?? "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

// hyperfine over a single command. We pass the full argv as one string and let
// hyperfine's parser split it; runner binaries here take no shell metacharacters.
function hyperfine(bin, argv, { runs, warmup }) {
  const out = join(BENCH, "results", ".tmp.json");
  const command = [bin, ...argv].join(" ");
  // `-i`/`--ignore-failure`: a runner may exit non-zero on a flaky case; we still
  // want the timing. The workload is designed to pass, so this is belt-and-braces.
  const a = ["--warmup", String(warmup), "--runs", String(runs), "--ignore-failure", "--export-json", out, command];
  execFileSync("hyperfine", a, { cwd: BENCH, stdio: "ignore" });
  const res = JSON.parse(readFileSync(out, "utf8")).results[0];
  const ms = (s) => Math.round(s * 1e6) / 1000;
  return { mean: ms(res.mean), stddev: ms(res.stddev ?? 0), min: ms(res.min), max: ms(res.max), median: ms(res.median) };
}

// Run once up front to fail fast on a broken workload / wrong flags, before
// burning (warmup+runs) iterations on it. Goes through a shell so it matches
// hyperfine's default (shell) glob expansion exactly.
function probeOnce(bin, argv) {
  execSync([bin, ...argv].join(" "), { cwd: BENCH, stdio: "ignore", timeout: 120000 });
}

// ── preflight ──────────────────────────────────────────────────────────────────
if (!have("hyperfine")) {
  console.error(`✖ 'hyperfine' not found on PATH — install it (brew install hyperfine) to run the benchmark.`);
  process.exit(1);
}
mkdirSync(join(BENCH, "results"), { recursive: true });

// Ensure the workload exists; generate it if missing.
if (!existsSync(join(BENCH, "workloads", "youneed"))) {
  console.log("workloads/ missing — generating…");
  execFileSync("node", [join(BENCH, "gen.mjs")], { stdio: "inherit" });
}

console.log(`\n@youneed/test runner bench — ${plan.map((e) => e.key).join(", ")} · mode: ${quick ? "quick" : "full"}\n`);

// ── run ──────────────────────────────────────────────────────────────────────
const measured = {};
const skipped = [];
process.stdout.write("▶ measuring: ");
for (const e of plan) {
  if (!e.detect()) {
    skipped.push(e);
    console.log(`\n  skipped: ${e.key} (not installed)`);
    process.stdout.write("▶ measuring: ");
    continue;
  }
  process.stdout.write(`${e.key} `);
  try {
    probeOnce(e.bin, e.argv);
    measured[e.key] = hyperfine(e.bin, e.argv, e);
  } catch (err) {
    measured[e.key] = { error: true, reason: cleanReason(err.message || err) };
  }
}
console.log("\n");

// ── output ──────────────────────────────────────────────────────────────────
const baseKey = (plan.find((e) => e.baseline) ?? plan[0])?.key;
const base = measured[baseKey];
const notes = [];

const cell = (v) => {
  if (!v) return "—";
  if (v.error) {
    notes.push(v.reason);
    return `err [${notes.length}]`;
  }
  return `${v.mean.toFixed(1)} ± ${v.stddev.toFixed(1)}`;
};
const rel = (v) => {
  if (!v || v.error || !base || base.error) return "—";
  const x = v.mean / base.mean;
  if (Math.abs(x - 1) < 0.005) return "1.00× (baseline)";
  return `${x.toFixed(2)}×`;
};

let md = `# @youneed/test — runner benchmark results\n\n`;
md += `Mean wall-clock to run the **same workload** (identical cases, native syntax per runner) in `;
md += `**milliseconds** (lower is better), \`mean ± stddev\`, via \`hyperfine\`.\n`;
md += `Baseline for the relative column is **${baseKey}**. Mode: ${quick ? "quick" : "full"}.\n\n`;
md += `| Runner | mean ± stddev (ms) | median | min | max | vs ${baseKey} |\n`;
md += `| --- | --- | --- | --- | --- | --- |\n`;
for (const e of plan) {
  const v = measured[e.key];
  if (!v) {
    md += `| ${e.label} | _skipped (not installed)_ | — | — | — | — |\n`;
    continue;
  }
  const extra =
    v && !v.error ? `${v.median.toFixed(1)} | ${v.min.toFixed(1)} | ${v.max.toFixed(1)}` : `— | — | —`;
  md += `| ${e.label} | ${cell(v)} | ${extra} | ${rel(v)} |\n`;
}
if (notes.length) {
  md += `\n## Errors\n\n`;
  notes.forEach((n, i) => (md += `${i + 1}. ${n}\n`));
}
md += `\n> hyperfine times the whole command (startup + bootstrap + run). Numbers are\n`;
md += `> machine-specific; trust back-to-back relative multipliers, not absolutes.\n`;

writeFileSync(join(BENCH, "results", "RESULTS.md"), md);
writeFileSync(
  join(BENCH, "results", "results.json"),
  JSON.stringify({ quick, baseline: baseKey, measured, skipped: skipped.map((e) => e.key) }, null, 2),
);

console.log(`Wrote results/RESULTS.md and results/results.json\n`);
console.log(md);
