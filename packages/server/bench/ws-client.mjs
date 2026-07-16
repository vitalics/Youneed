// WebSocket round-trip probe for the bench: connect → send one frame → await
// the echo → exit 0. hyperfine times the whole process, so the number includes
// node's startup (a tens-of-ms floor) — read WebSocket rows as relative, not
// as raw per-message latency. Uses the global WebSocket (node 22+).
const url = process.argv[2];
const exit = (code) => process.exit(code);

const ws = new WebSocket(url);
const timer = setTimeout(() => {
  console.error("ws timeout");
  exit(1);
}, 3000);

ws.addEventListener("open", () => ws.send("ping"));
ws.addEventListener("message", () => {
  clearTimeout(timer);
  ws.close();
  exit(0);
});
ws.addEventListener("error", (e) => {
  clearTimeout(timer);
  console.error("ws error", e?.message ?? "");
  exit(1);
});
