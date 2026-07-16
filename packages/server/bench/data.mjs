// Shared payloads for the @youneed/server micro-benchmark, so every endpoint
// returns deterministic, byte-identical bodies across runs.
export const HELLO = "Hello, World!";

export const JSON_PAYLOAD = {
  message: HELLO,
  items: [1, 2, 3, 4, 5],
  nested: { ok: true, ts: "2026-06-18T00:00:00.000Z" },
};

// Resolved against process.cwd() — bench.mjs launches the app with cwd = bench/.
export const STATIC_FILE = "static.txt";

// Bounded SSE stream so `curl -N` terminates and hyperfine can time a full
// round trip.
export const SSE_EVENTS = 5;

export const PORT = Number(globalThis.process?.env?.PORT ?? 41100);
