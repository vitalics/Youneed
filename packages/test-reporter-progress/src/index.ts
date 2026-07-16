// @youneed/test-reporter-progress — a live, interactive progress reporter for
// @youneed/test. It listens to the LIVE `onProgress` event (emitted as each test
// starts/ends, even during a `.parallel()` run) and shows what's running where.
//
//   import { ProgressReporter } from "@youneed/test-reporter-progress";
//   TestApplication().addTests(...).parallel(4).reporter(new ProgressReporter()).run();
//
// On a TTY with >1 lane it redraws a per-lane dashboard in place; otherwise it
// prints one tagged line per event (so it's CI-/pipe-friendly and testable).

import { Reporter, type ProgressEvent } from "@youneed/test";

const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", reset: "\x1b[0m" };

/** `p2/4` for a parallel lane, `w1/3` for a worker. */
const laneTag = (p: ProgressEvent) => `${p.run.mode === "worker" ? "w" : "p"}${p.run.lane + 1}/${p.run.lanes}`;

const mark = (p: ProgressEvent) =>
  p.phase === "testStart"
    ? `${C.dim}▶${C.reset}`
    : p.status === "passed"
      ? `${C.green}✓${C.reset}`
      : p.status === "failed"
        ? `${C.red}✗${C.reset}`
        : `${C.yellow}∘${C.reset}`;

export class ProgressReporter extends Reporter({ name: "progress" }) {
  #current = new Map<number, string>(); // lane → latest rendered cell
  #lanes = 1;
  #drawn = 0; // lines drawn last redraw (for cursor-up)
  #tty = !!(globalThis as { process?: { stdout?: { isTTY?: boolean } } }).process?.stdout?.isTTY;

  @Reporter.event("onProgress")
  progress(p: ProgressEvent) {
    this.#lanes = p.run.lanes;
    this.#current.set(p.run.lane, `${mark(p)} ${p.suite} › ${p.name}`);
    if (this.#tty && p.run.lanes > 1) this.#redraw();
    else this.#line(p);
  }

  /** Non-TTY / single-lane: one tagged line per event (CI-friendly). */
  #line(p: ProgressEvent) {
    const tag = p.run.lanes > 1 ? `${C.dim}[${laneTag(p)}]${C.reset} ` : "";
    console.log(`${tag}${this.#current.get(p.run.lane)}`);
  }

  /** TTY: redraw a block of one line per lane, in place. */
  #redraw() {
    const out = (globalThis as { process: { stdout: { write(s: string): void } } }).process.stdout;
    if (this.#drawn) out.write(`\x1b[${this.#drawn}A`); // cursor up to the block top
    let block = "";
    for (let i = 0; i < this.#lanes; i++) {
      block += `\x1b[2K  ${C.dim}lane ${i + 1}/${this.#lanes}${C.reset}  ${this.#current.get(i) ?? `${C.dim}…${C.reset}`}\n`;
    }
    out.write(block);
    this.#drawn = this.#lanes;
  }
}
