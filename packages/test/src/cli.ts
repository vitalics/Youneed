#!/usr/bin/env node
// youneed-test — discover test files, run them, optionally watch.
//
//   youneed-test                         # run **/*.test.{ts,js}
//   youneed-test "src/**/*.spec.ts"      # custom globs
//   youneed-test -w                      # watch + re-run on change
//   youneed-test --parallel 4            # in-process lanes
//   youneed-test --workers 4             # forked workers (blobs merged)
//   youneed-test --shard 2/4 --blob      # one CI shard, write a blob
//   youneed-test --reporter console --reporter tap --reporter junit --output junit.xml
//
// Test files just EXPORT suites (`export class S extends Test() {…}`) — the CLI
// collects them (by the suite brand) and runs them. For `.ts` files run the CLI
// under a TS loader, e.g. `node --import tsx node_modules/.bin/youneed-test`.

import { watch } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NoopReporter, TestApplication, type WebServerOptions } from "./index.ts";

interface Args {
  globs: string[];
  watch: boolean;
  parallel?: number;
  workers?: number;
  shard?: string;
  reporters: string[];
  output?: string;
  blob: boolean;
  timeout?: number;
  webServer?: WebServerOptions;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { globs: [], watch: false, reporters: [], blob: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "-w":
      case "--watch": a.watch = true; break;
      case "--parallel": a.parallel = Number(next()); break;
      case "--workers": a.workers = Number(next()); break;
      case "--shard": a.shard = next(); break;
      case "--reporter": a.reporters.push(next()); break;
      case "--output": a.output = next(); break;
      case "--blob": a.blob = true; break;
      case "--timeout": a.timeout = Number(next()); break;
      case "--web-server": (a.webServer ??= { command: "" }).command = next(); break;
      case "--web-server-url": (a.webServer ??= { command: "" }).url = next(); break;
      case "--web-server-port": (a.webServer ??= { command: "" }).port = Number(next()); break;
      case "--web-server-timeout": (a.webServer ??= { command: "" }).timeout = Number(next()); break;
      case "-h":
      case "--help": printHelp(); process.exit(0); break;
      default:
        if (arg.startsWith("-")) throw new Error(`unknown flag: ${arg}`);
        a.globs.push(arg);
    }
  }
  if (a.globs.length === 0) a.globs = ["**/*.test.{ts,tsx,js,jsx,mts,mjs}"];
  return a;
}

function printHelp() {
  console.log(`youneed-test [globs...] [options]

  -w, --watch            re-run on file change
  --parallel <n>         run across n in-process lanes
  --workers <n>          run across n worker processes (merged)
  --shard <i/n>          run shard i of n
  --reporter <name>      add a reporter (built-in: default, noop; or a
                         @youneed/test-reporter-<name> package: console, tap,
                         junit, progress, html). Repeatable.
  --output <file>        output path for file reporters (e.g. junit)
  --blob                 also write a blob report
  --timeout <ms>         default per-test timeout (0 = none)
  --web-server <cmd>     start a web server before the run (à la Playwright)
  --web-server-url <url> wait until this URL responds before running tests
  --web-server-port <n>  …or wait until this TCP port accepts connections
  --web-server-timeout <ms>  readiness timeout for the web server (default 60000)
  -h, --help             this help`);
}

/** Glob → RegExp: supports `**`, `*`, `?`, and `{a,b}` alternation. */
function globToRe(glob: string): RegExp {
  const g = glob.replace(/^\.?\//, "");
  let re = "";
  for (let i = 0; i < g.length; ) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        re += "(?:.*/)?";
        i += g[i + 2] === "/" ? 3 : 2;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === "{") {
      const end = g.indexOf("}", i);
      const opts = g.slice(i + 1, end).split(",").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      re += `(?:${opts.join("|")})`;
      i = end + 1;
    } else {
      re += ".+^$()|[]\\".includes(c) ? `\\${c}` : c;
      i++;
    }
  }
  return new RegExp(`(^|/)${re}$`);
}

async function collectFiles(globs: string[], root: string): Promise<string[]> {
  const res = globs.map(globToRe);
  const found: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const rel = full.slice(root.length + 1).split(/[\\/]/).join("/");
        if (res.some((r) => r.test(rel))) found.push(full);
      }
    }
  }
  await walk(root);
  return found.sort();
}

const SUITE = Symbol.for("youneed.test.suite");

async function loadSuites(files: string[], version: number): Promise<Function[]> {
  const suites: Function[] = [];
  for (const file of files) {
    // Cache-bust under watch so edits re-register (ESM caches by URL).
    const url = pathToFileURL(file).href + (version ? `?v=${version}` : "");
    const mod = (await import(url)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (typeof value === "function" && (value as unknown as Record<symbol, unknown>)[SUITE] === true) suites.push(value);
    }
  }
  return suites;
}

async function resolveReporters(names: string[], output?: string): Promise<object[]> {
  const out: object[] = [];
  for (const name of names) {
    if (name === "default") continue; // the built-in default is used when none added
    if (name === "noop") {
      out.push(new NoopReporter());
      continue;
    }
    const pkg = name.includes("/") ? name : `@youneed/test-reporter-${name}`;
    const mod = (await import(pkg)) as { default?: new (...a: never[]) => object } & Record<string, unknown>;
    const Ctor = (mod.default ?? Object.values(mod).find((v) => typeof v === "function")) as new (...a: never[]) => object;
    if (!Ctor) throw new Error(`reporter "${name}" exports no reporter class`);
    out.push(output ? new Ctor({ output } as never) : new Ctor());
  }
  return out;
}

async function runOnce(args: Args, version: number): Promise<number> {
  const root = resolve(process.cwd());
  const files = await collectFiles(args.globs, root);
  const suites = await loadSuites(files, version);
  if (suites.length === 0) {
    console.log("no test suites found");
    return 0;
  }
  let app = TestApplication().addTests(...(suites as never[]));
  for (const r of await resolveReporters(args.reporters, args.output)) app = app.reporter(r);
  if (args.timeout !== undefined) app = app.timeout(args.timeout);
  if (args.webServer?.command && (args.webServer.url || args.webServer.port)) app = app.webServer(args.webServer);
  if (args.blob) app = app.blob();
  if (args.shard) app = app.shard(args.shard);
  if (args.workers && args.workers > 1) app = app.workers(args.workers);
  else if (args.parallel && args.parallel > 1) app = app.parallel(args.parallel);
  const summary = await app.run({ setExitCode: false });
  return summary.failed > 0 ? 1 : 0;
}

const args = parseArgs(process.argv.slice(2));

if (!args.watch) {
  process.exit(await runOnce(args, 0));
} else {
  let version = 1;
  let running = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cycle = async () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    do {
      queued = false;
      await runOnce(args, version++).catch((e) => console.error(e));
      console.log("\nwatching for changes… (ctrl-c to exit)");
    } while (queued);
    running = false;
  };
  await cycle();
  watch(resolve(process.cwd()), { recursive: true }, (_event, file) => {
    if (!file || !/\.(tsx?|jsx?|mts|mjs)$/.test(file) || file.includes("node_modules") || file.includes("dist")) return;
    clearTimeout(timer);
    timer = setTimeout(cycle, 120); // debounce a burst of edits
  });
}
