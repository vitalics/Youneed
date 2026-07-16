// ── @youneed/cli-plugin-devtools/protocol — the CLI DOMAIN ────────────────────
//
// Exposes a @youneed/cli app's command catalogue (and an optional run) over
// `@youneed/devtools-protocol`, so the unified devtools client inspects a CLI the
// same way it inspects a server or a page. Serve it over any transport (the
// existing devtools HTTP server can bridge, or an in-process transport).
//
// A run is a STREAMING, INTERACTIVE session — not a buffered request/response:
//   • `CLI.start{argv}`   spawns the CLI; stdout/stderr stream as `CLI.output`
//                         events as they're produced; resolves at exit (also
//                         pushed as a `CLI.exit` event).
//   • `CLI.input{data}`   writes RAW bytes to the running child's stdin — so the
//                         browser can drive prompts/menus (arrow keys, enter…)
//                         exactly like a real terminal.
//   • `CLI.stop`          kills the running child (Ctrl-C-style termination).
// `CLI.run{argv}` (buffered) is kept for the legacy HTTP page and back-compat.

import { t } from "@youneed/schema";
import { createTarget, defineDomain, type Domain, type DevtoolsTarget, type DomainContext } from "@youneed/devtools-protocol";
import type { PluginHost } from "@youneed/cli";
import type { ChildProcess } from "node:child_process";
import { createCatalog } from "./catalog.ts";

export interface CliDomainOptions {
  /** Command name to hide from the catalogue (e.g. the devtools command itself). */
  exclude?: string;
  /** Launcher argv prefix for a run (default `process.argv.slice(0, 2)`). */
  launcher?: string[];
  /** Kill a run after this many ms. `0`/omitted = no timeout (interactive runs
   *  wait for human input — rely on `CLI.stop` / disconnect instead). */
  runTimeoutMs?: number;
  /** Allow runs to spawn the process (default `true`). */
  run?: boolean;
}

interface RunResult {
  code: number | null;
  output: string;
}

/** Per-connection session scratch — holds the child of the active streaming run. */
interface CliSession {
  child?: ChildProcess;
}

/** Resolve the launcher + argv into the binary and its arguments. */
function resolveSpawn(opts: CliDomainOptions, argv: string[]): { bin?: string; args: string[] } {
  const launcher = opts.launcher ?? process.argv.slice(0, 2);
  const [bin, ...args] = [...launcher, ...argv];
  return { bin, args };
}

/** Spawn the CLI with `argv`, buffering stdout+stderr (the legacy HTTP `/run`). */
async function runArgv(opts: CliDomainOptions, argv: string[]): Promise<RunResult> {
  const { bin, args } = resolveSpawn(opts, argv);
  if (!bin) return { code: null, output: "no launcher" };
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    const ms = opts.runTimeoutMs ?? 0;
    const timer = ms > 0 ? setTimeout(() => child.kill(), ms) : undefined;
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, output });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: null, output: String(err) });
    });
  });
}

/**
 * The `CLI` domain — wraps `./catalog.ts`:
 *   • `CLI.getCatalog`     → command/option/arg catalogue
 *   • `CLI.start{argv}`    → spawn; stream `CLI.output`, resolve `{ code }` at exit
 *   • `CLI.input{data}`    → write raw bytes to the running child's stdin
 *   • `CLI.stop`           → kill the running child
 *   • `CLI.run{argv}`      → buffered spawn → `{ code, output }` (legacy)
 */
export function cliDomain(host: PluginHost, opts: CliDomainOptions = {}): Domain {
  const children = new Set<ChildProcess>();
  const ensureAllowed = (): void => {
    if (opts.run === false) throw new Error("running is disabled");
  };

  return defineDomain({
    domain: "CLI",
    description: "CLI command catalogue + interactive run",
    events: {
      output: { description: "a stdout/stderr chunk from the running command", params: t.json<{ stream: "stdout" | "stderr"; data: string }>() },
      exit: { description: "the running command exited", params: t.json<{ code: number | null }>() },
    },
    commands: {
      getCatalog: { description: "command/option catalogue", handler: () => createCatalog(host, { exclude: opts.exclude }) },
      start: {
        description: "spawn the CLI with argv; streams CLI.output, resolves { code } at exit",
        params: t.json<{ argv: string[] }>(),
        handler: async (p: { argv?: string[] }, ctx: DomainContext): Promise<{ code: number | null }> => {
          ensureAllowed();
          const { bin, args } = resolveSpawn(opts, p.argv ?? []);
          if (!bin) {
            ctx.emit("output", { stream: "stderr", data: "no launcher\n" });
            ctx.emit("exit", { code: null });
            return { code: null };
          }
          const { spawn } = await import("node:child_process");
          const session = ctx.session as CliSession;
          // Kill any prior run on this connection before starting a new one.
          session.child?.kill();
          // FORCE_COLOR: keep ANSI colours over the pipe. YOUNEED_CLI_TTY: opt the
          // child into live-repaint rendering even though its stdout isn't a TTY —
          // otherwise continuously-animating commands (no settling tasks) would
          // only flush their final frame at exit.
          const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, FORCE_COLOR: "1", YOUNEED_CLI_TTY: "1" } });
          session.child = child;
          children.add(child);
          child.stdout?.on("data", (d) => ctx.emit("output", { stream: "stdout", data: String(d) }));
          child.stderr?.on("data", (d) => ctx.emit("output", { stream: "stderr", data: String(d) }));
          const ms = opts.runTimeoutMs ?? 0;
          const timer = ms > 0 ? setTimeout(() => child.kill(), ms) : undefined;
          return new Promise<{ code: number | null }>((resolve) => {
            const done = (code: number | null): void => {
              if (timer) clearTimeout(timer);
              children.delete(child);
              if (session.child === child) session.child = undefined;
              ctx.emit("exit", { code });
              resolve({ code });
            };
            child.on("close", (code) => done(code));
            child.on("error", (err) => {
              ctx.emit("output", { stream: "stderr", data: String(err) + "\n" });
              done(null);
            });
          });
        },
      },
      input: {
        description: "write raw bytes to the running child's stdin (keystrokes, lines)",
        params: t.json<{ data: string }>(),
        handler: (p: { data?: string }, ctx: DomainContext): { ok: boolean } => {
          const child = (ctx.session as CliSession).child;
          if (!child?.stdin?.writable) return { ok: false };
          child.stdin.write(p.data ?? "");
          return { ok: true };
        },
      },
      stop: {
        description: "kill the running child (Ctrl-C-style)",
        handler: (_p: unknown, ctx: DomainContext): { ok: boolean } => {
          const child = (ctx.session as CliSession).child;
          if (!child) return { ok: false };
          child.kill();
          return { ok: true };
        },
      },
      run: {
        description: "spawn the CLI with argv → { code, output } (buffered; legacy)",
        params: t.json<{ argv: string[] }>(),
        handler: (p: { argv?: string[] }) => {
          ensureAllowed();
          return runArgv(opts, p.argv ?? []);
        },
      },
    },
  });
}

/** A {@link DevtoolsTarget} (kind `"cli"`) with the {@link cliDomain} registered. */
export function createCliTarget(host: PluginHost, opts: CliDomainOptions & { title?: string } = {}): DevtoolsTarget {
  return createTarget({ kind: "cli", title: opts.title ?? host.name }).register(cliDomain(host, opts));
}
