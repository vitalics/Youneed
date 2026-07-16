// ── @youneed/logger-transport-file — append-to-file transport (Node) ─────────
//
// File output is inherently Node-only (`node:fs`), so it lives outside the
// universal core. Two modes:
//   • sync (default) — `appendFileSync`, durable and simple; each record is on
//     disk before `log()` returns. Good for low/medium volume and crash safety.
//   • stream — a persistent `createWriteStream({ flags: "a" })`; non-blocking,
//     buffered by the OS, far cheaper under load. Call `close()` on shutdown to
//     flush. Pick this for high-throughput servers.

import { appendFileSync, createWriteStream, type WriteStream } from "node:fs";
import { Transport, type TransformableInfo, type TransportOptions, rendered } from "@youneed/logger";

export interface FileTransportOptions extends TransportOptions {
  /** Target file path; created if missing, always appended to. */
  filename: string;
  /** Use a buffered append stream instead of synchronous `appendFileSync`. */
  stream?: boolean;
}

/** Appends each rendered, newline-terminated record to `filename`. */
export class FileTransport extends Transport {
  #filename: string;
  #stream?: WriteStream;
  constructor(opts: FileTransportOptions) {
    super(opts);
    this.#filename = opts.filename;
    if (opts.stream) this.#stream = createWriteStream(this.#filename, { flags: "a" });
  }
  log(info: TransformableInfo, next?: () => void): void {
    const line = rendered(info) + "\n";
    if (this.#stream) this.#stream.write(line);
    else appendFileSync(this.#filename, line);
    next?.();
  }
  /** Flush and close the underlying stream (no-op in sync mode). Await on
   *  shutdown, or rely on `await using` — the base wires `Symbol.asyncDispose`
   *  to this method. */
  override close(): Promise<void> {
    const s = this.#stream;
    if (!s) return Promise.resolve();
    this.#stream = undefined;
    return new Promise((resolve) => s.end(resolve));
  }
}

/** Convenience factory. */
export function file(opts: FileTransportOptions): FileTransport {
  return new FileTransport(opts);
}
