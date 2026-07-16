# @youneed/test — runner benchmark

A cross-runner shoot-out: run the **same workload** under each test runner and
time the whole invocation with [`hyperfine`](https://github.com/sharkdp/hyperfine).
Same methodology as [`packages/server/bench`](../../server/bench/README.md).

| Runner | command shape |
| --- | --- |
| `@youneed/test` (ours) | `node --import tsx src/cli.ts 'workloads/youneed/**/*.test.ts'` |
| node native | `node --test workloads/node/*.test.mjs` |
| vitest | `vitest run --config vitest.config.mjs` |
| jest | `jest --config jest.config.cjs` |
| `@playwright/test` (no browser) | `playwright test --config playwright.config.mjs` |

## What we measure

A fixed workload of **20 files × 50 tests = 1000 cases per runner**, each case a
pinch of arithmetic plus a few sync `expect`-style asserts, with one
`await Promise.resolve()` on a fixed cadence (every 7th case) so async handling is
exercised too. **No disk, network, or sleeps** — so the wall-clock is dominated by
the *runner's own overhead* (process startup, module load, test collection,
scheduling, assertion machinery), which is exactly what we want to compare.

hyperfine times the **entire command** end-to-end (cold-ish start + bootstrap +
the 1000-case run), repeated over warmup + measured runs, and reports
`mean ± stddev` / median / min / max in milliseconds.

## Why native syntax per runner

To keep the comparison **fair**, the workload is generated separately for each
runner in its *native* format/syntax — so we measure the runner, not a shared TS
transformer or adapter shim:

- `youneed/` — `*.test.ts`, suites `export class … extends Test()` with `@Test.it`
  and `expect` from `@youneed/test` (run under `tsx`).
- `node/` — `*.test.mjs`, `node:test` + `node:assert/strict`.
- `vitest/` — `*.test.mjs`, `import { test, expect } from "vitest"`.
- `jest/` — `*.test.js` (CJS, jest's default — no transform, the fairest jest baseline).
- `playwright/` — `*.spec.mjs`, `@playwright/test` with **no browser/projects**
  (pure `test()`/`expect()` logic).

The cases are **deterministic** (operands derived from file/test index, no
randomness), so every runner does provably the same work and runs are
reproducible. Tweak the scale at the top of `gen.mjs`
(`FILES` / `TESTS_PER_FILE` / `ASYNC_EVERY`).

## Running

```sh
pnpm --filter @youneed/test bench          # full
pnpm --filter @youneed/test bench:quick    # ~0.4× the runs
pnpm --filter @youneed/test bench:gen      # (re)generate workloads only
pnpm --filter @youneed/test bench -- --runners=youneed,node --runs=20
```

`bench.mjs` (re)generates the workloads if missing, then runs each selected
runner through hyperfine one at a time, computes each runner's multiplier vs our
`youneed` baseline, and writes `bench/results/{RESULTS.md,results.json}`.

- **Requires** `hyperfine` on `PATH` (`brew install hyperfine`).
- **Auto-skip.** A runner whose binary isn't installed (resolved from
  `node_modules/.bin`, hoisted to the repo root by pnpm) is skipped with
  `skipped: <runner> (not installed)` instead of aborting the sweep — except
  `youneed` and `node`, which need no install. If a runner errors at probe time,
  its row shows `err [n]` with the reason, and the rest still run.

## Caveats

- hyperfine times the whole process, so absolute ms include node/runner startup
  (a fixed floor) on top of the run. That floor is part of what makes one runner
  feel snappier than another, so it's fair to include — but it means the numbers
  are **machine-specific**. Trust **back-to-back relative multipliers** on one
  box, not the absolutes, and re-run a couple of times (numbers drift on a shared
  machine).
- Our runner runs `.ts` directly under `tsx`; the others run pre-`.mjs`/`.js`.
  `tsx` adds a one-time transform cost to *our* number, so if anything this
  *understates* our lead on a pure-JS workload.
