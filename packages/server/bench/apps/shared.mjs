// Shared contract for every framework app in this folder: same port, same
// payloads, same three GET routes. Importable from .mjs, .ts (tsx) and Bun.
export const PORT = Number(process.env.BENCH_PORT || 41040);
export const HELLO = "Hello, World!";
export const JSON_PAYLOAD = {
  message: "Hello, World!",
  items: [1, 2, 3, 4, 5],
  nested: { ok: true },
};
