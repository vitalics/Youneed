// ── @youneed/logger-transport-stdout — Node stdout/stderr transport ──────────
//
// The universal `ConsoleTransport` in `@youneed/logger` routes through the
// `console` global, which works everywhere but, on a busy Node server, pays for
// `console`'s formatting machinery. This transport writes the already-rendered
// line straight to `process.stdout`/`process.stderr` — the fast path the core
// used before it was made DOM-safe. Use it on servers; keep `ConsoleTransport`
// in the browser/DOM and SSR/SSG.

import { Transport, type TransformableInfo, type TransportOptions, rendered, levelOf } from "@youneed/logger";

export interface StdoutTransportOptions extends TransportOptions {
  /** Levels routed to `stderr` instead of `stdout`. Default: `error`, `warn`. */
  stderrLevels?: string[];
}

/** Writes the rendered, newline-terminated line directly to the Node process
 *  streams. `error`/`warn` (configurable) go to `stderr`, everything else to
 *  `stdout` — matching the conventional 12-factor split. */
export class StdoutTransport extends Transport {
  #stderr: Set<string>;
  constructor(opts: StdoutTransportOptions = {}) {
    super(opts);
    this.#stderr = new Set(opts.stderrLevels ?? ["error", "warn"]);
  }
  log(info: TransformableInfo, next?: () => void): void {
    const line = rendered(info) + "\n";
    if (this.#stderr.has(levelOf(info))) process.stderr.write(line);
    else process.stdout.write(line);
    next?.();
  }
}

/** Convenience factory. */
export function stdout(opts: StdoutTransportOptions = {}): StdoutTransport {
  return new StdoutTransport(opts);
}
