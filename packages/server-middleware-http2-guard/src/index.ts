import type { Middleware } from "@youneed/server";
import type { Http2Session, ServerHttp2Stream } from "node:http2";

// ── HTTP/2 bomb protection ─────────────────────────────────────────────────────
// HTTP/2 multiplexes many cheap streams over one connection, which a few DoS
// patterns abuse — all BELOW the request abstraction:
//   • Rapid Reset (CVE-2023-44487): open a stream, immediately RST_STREAM, repeat.
//     The server keeps doing per-stream setup for streams that never finish.
//   • Concurrent-stream flood: hold a huge number of streams open at once.
//   • Stream churn: create unbounded streams over a connection's lifetime.
// So we instrument the underlying Http2Session (reached via ctx.request.stream
// .session) ONCE per connection and tear it down (GOAWAY + destroy) when a
// pattern crosses a threshold. On HTTP/1.1 (no stream/session) it's a pass-through.
//
// NOT handled here (mitigate via Node's http2 server settings + a current Node):
// CONTINUATION/header-assembly floods (CVE-2024-27316) and HPACK memory happen
// while headers are assembled, before any request exists — cap them with
// `maxSessionMemory` / `maxHeaderListSize` on the server, not a middleware.

const NGHTTP2_ENHANCE_YOUR_CALM = 0x0b;

export interface Http2GuardOptions {
  /** Max streams open AT ONCE on one connection before tear-down (default 100). */
  maxConcurrentStreams?: number;
  /** Sliding window (ms) over which resets are counted (default 10_000). */
  windowMs?: number;
  /** Max aborted (RST_STREAM) streams per window before tear-down (default 100). */
  maxResetsPerWindow?: number;
  /** Max streams over a connection's whole life (0 = unlimited; default 0). */
  maxStreamsPerSession?: number;
  /** Notified right before an abusive connection is torn down. */
  onAbuse?: (info: Http2AbuseInfo) => void;
}

export interface Http2AbuseInfo {
  reason: "rapid-reset" | "max-concurrent-streams" | "max-streams-per-session";
  remoteAddress?: string;
  /** Resets counted in the current window at tear-down. */
  resets: number;
  /** Total streams seen on the connection at tear-down. */
  totalStreams: number;
}

/**
 * Defend HTTP/2 connections against stream-multiplexing DoS (Rapid Reset,
 * concurrent-stream floods, stream churn). Register it globally so it sees the
 * first request of every connection: `app.use(http2Guard())`. A no-op on
 * HTTP/1.1. Complements — doesn't replace — Node's `maxConcurrentStreams` /
 * `maxSessionMemory` server settings.
 */
export function http2Guard(opts: Http2GuardOptions = {}): Middleware {
  const maxConcurrent = opts.maxConcurrentStreams ?? 100;
  const windowMs = opts.windowMs ?? 10_000;
  const maxResets = opts.maxResetsPerWindow ?? 100;
  const maxStreams = opts.maxStreamsPerSession ?? 0;
  // Each session instrumented once; cleared with the session by GC (no leak).
  const instrumented = new WeakSet<Http2Session>();

  return (ctx, next) => {
    const stream = (ctx.request as unknown as { stream?: ServerHttp2Stream }).stream;
    const session = stream?.session as Http2Session | undefined;
    if (session && !instrumented.has(session)) {
      instrumented.add(session);
      const resets: number[] = [];
      let open = 0;
      let total = 0;
      const tearDown = (reason: Http2AbuseInfo["reason"]) => {
        opts.onAbuse?.({
          reason,
          remoteAddress: session.socket?.remoteAddress,
          resets: resets.length,
          totalStreams: total,
        });
        // GOAWAY(ENHANCE_YOUR_CALM) tells the peer to back off, then drop it.
        try { session.goaway(NGHTTP2_ENHANCE_YOUR_CALM); } catch { /* already closing */ }
        session.destroy();
      };
      session.on("stream", (s: ServerHttp2Stream) => {
        total++;
        open++;
        if (maxStreams && total > maxStreams) return tearDown("max-streams-per-session");
        if (open > maxConcurrent) return tearDown("max-concurrent-streams");
        // A clean finish closes with rstCode 0; a peer RST_STREAM (the Rapid
        // Reset signal) closes with a non-zero code (CANCEL=8, REFUSED=7, …).
        s.once("close", () => {
          open--;
          if (!s.rstCode) return;
          const now = Date.now();
          resets.push(now);
          while (resets.length && resets[0] <= now - windowMs) resets.shift();
          if (resets.length > maxResets) tearDown("rapid-reset");
        });
      });
    }
    return next();
  };
}
