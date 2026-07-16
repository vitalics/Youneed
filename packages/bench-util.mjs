// Tiny ops/sec micro-benchmark helper shared by the per-package benches.
// Not a published package — dev-only, imported relatively by bench/ files.

const fmt = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`;

/** Run `fn` for ~`duration` ms after a warmup; return { label, opsPerSec }. */
export function bench(label, fn, { duration = 800, warmup = 100, batch = 1 } = {}) {
  for (let i = 0; i < warmup; i++) fn();
  let ops = 0;
  const start = performance.now();
  const end = start + duration;
  while (performance.now() < end) {
    for (let b = 0; b < batch; b++) fn();
    ops += batch;
  }
  return { label, opsPerSec: ops / ((performance.now() - start) / 1000) };
}

/** Async variant — awaits `fn` each iteration (for libraries with async render). */
export async function benchAsync(label, fn, { duration = 800, warmup = 50 } = {}) {
  for (let i = 0; i < warmup; i++) await fn();
  let ops = 0;
  const start = performance.now();
  const end = start + duration;
  while (performance.now() < end) {
    await fn();
    ops++;
  }
  return { label, opsPerSec: ops / ((performance.now() - start) / 1000) };
}

/** Print a sorted comparison table (fastest first) with relative speed. */
export function report(title, results) {
  const fastest = Math.max(...results.map((r) => r.opsPerSec));
  console.log(`\n${title}`);
  for (const r of [...results].sort((a, b) => b.opsPerSec - a.opsPerSec)) {
    const rel =
      r.opsPerSec === fastest ? "▲ fastest" : `${(fastest / r.opsPerSec).toFixed(2)}× slower`;
    console.log(`  ${r.label.padEnd(22)} ${`${fmt(r.opsPerSec)} ops/s`.padStart(14)}   ${rel}`);
  }
}
