// ── @youneed/logger-transport-http — ship logs over HTTP (universal) ─────────
//
// Buffers records and POSTs them in batches to an ingestion endpoint. Built on
// the platform `fetch` (and, in the browser, `navigator.sendBeacon` for the
// final flush on page unload), so the same transport works in the browser/DOM,
// SSR/SSG, the server, workers and at the edge — no Node API.
//
// A batch is flushed when it reaches `batchSize` or after `flushInterval` ms,
// whichever comes first. Network failures are swallowed (a logging hiccup must
// not crash the app) unless an `onError` hook is given.

import { type TransformableInfo, type LogTransport, type Format, rendered } from "@youneed/logger";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; keepalive?: boolean }) => Promise<unknown>;

export interface HttpTransportOptions {
  /** Ingestion endpoint. */
  url: string;
  level?: string;
  format?: Format;
  /** Flush once the buffer reaches this many records. Default 20. */
  batchSize?: number;
  /** Flush a non-empty buffer after this many ms. Default 2000. `0` disables the timer. */
  flushInterval?: number;
  /** Extra request headers (merged over `content-type: application/json`). */
  headers?: Record<string, string>;
  /** Map each record to a payload element. Default: the rendered line (string). */
  transform?: (info: TransformableInfo) => unknown;
  /** Turn the batched elements into the request body. Default `JSON.stringify`. */
  serialize?: (batch: unknown[]) => string;
  /** Override the `fetch` implementation (tests, custom agents). Default `globalThis.fetch`. */
  fetch?: FetchLike;
  /** On the browser, use `navigator.sendBeacon` for the unload flush. Default true. */
  useBeacon?: boolean;
  /** Called with any send error instead of swallowing it. */
  onError?: (err: unknown) => void;
}

/** Batching HTTP transport. Call `flush()` to force a send and `close()` on
 *  shutdown to stop the timer and drain the buffer. */
export class HttpTransport implements LogTransport, Disposable, AsyncDisposable {
  level?: string;
  format?: Format;
  #url: string;
  #batchSize: number;
  #flushInterval: number;
  #headers: Record<string, string>;
  #transform: (info: TransformableInfo) => unknown;
  #serialize: (batch: unknown[]) => string;
  #fetch?: FetchLike;
  #useBeacon: boolean;
  #onError?: (err: unknown) => void;
  #buffer: unknown[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(opts: HttpTransportOptions) {
    this.level = opts.level;
    this.format = opts.format;
    this.#url = opts.url;
    this.#batchSize = opts.batchSize ?? 20;
    this.#flushInterval = opts.flushInterval ?? 2000;
    this.#headers = { "content-type": "application/json", ...opts.headers };
    this.#transform = opts.transform ?? rendered;
    this.#serialize = opts.serialize ?? ((batch) => JSON.stringify(batch));
    this.#fetch = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch?.bind(globalThis);
    this.#useBeacon = opts.useBeacon !== false;
    this.#onError = opts.onError;
    this.#installUnloadFlush();
  }

  log(info: TransformableInfo, next?: () => void): void {
    this.#buffer.push(this.#transform(info));
    if (this.#buffer.length >= this.#batchSize) void this.flush();
    else this.#schedule();
    next?.();
  }

  /** Send the buffered batch now. Resolves once the request settles. */
  async flush(): Promise<void> {
    this.#clearTimer();
    if (this.#buffer.length === 0) return;
    const batch = this.#buffer;
    this.#buffer = [];
    const body = this.#serialize(batch);
    try {
      const f = this.#fetch;
      if (!f) throw new Error("no fetch implementation available");
      await f(this.#url, { method: "POST", headers: this.#headers, body, keepalive: true });
    } catch (err) {
      if (this.#onError) this.#onError(err);
    }
  }

  /** Stop the timer, remove the unload listener and flush what's left. Wired to
   *  `Symbol.asyncDispose`, so `await using t = new HttpTransport(...)` drains
   *  on scope exit; `logger.close()` calls it for every transport. */
  async close(): Promise<void> {
    this.#removeUnloadFlush();
    await this.flush();
  }
  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
  // Synchronous `using`: detach the listener and kick a best-effort flush
  // (can't await here). Prefer `await using` / `close()` for a guaranteed drain.
  [Symbol.dispose](): void {
    this.#removeUnloadFlush();
    this.#clearTimer();
    void this.flush();
  }

  #schedule(): void {
    if (this.#flushInterval <= 0 || this.#timer !== undefined) return;
    const t = setTimeout(() => {
      this.#timer = undefined;
      void this.flush();
    }, this.#flushInterval);
    // Don't keep a Node process alive just for a pending flush.
    (t as { unref?: () => void }).unref?.();
    this.#timer = t;
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  // ── Browser unload: best-effort flush via sendBeacon (survives navigation) ──
  #unload = (): void => {
    if (this.#buffer.length === 0) return;
    const batch = this.#buffer;
    this.#buffer = [];
    const nav = (globalThis as { navigator?: { sendBeacon?: (url: string, data: string) => boolean } }).navigator;
    if (this.#useBeacon && nav?.sendBeacon) nav.sendBeacon(this.#url, this.#serialize(batch));
    else {
      this.#buffer = batch; // restore; let flush() handle it
      void this.flush();
    }
  };

  #installUnloadFlush(): void {
    const g = globalThis as { addEventListener?: (t: string, cb: () => void) => void };
    if (typeof g.addEventListener === "function") g.addEventListener("pagehide", this.#unload);
  }
  #removeUnloadFlush(): void {
    const g = globalThis as { removeEventListener?: (t: string, cb: () => void) => void };
    if (typeof g.removeEventListener === "function") g.removeEventListener("pagehide", this.#unload);
  }
}

/** Convenience factory. */
export function http(opts: HttpTransportOptions): HttpTransport {
  return new HttpTransport(opts);
}
