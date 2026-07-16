// Component render speed: @youneed/dom vs Lit (both native Custom Elements), run
// THROUGH our own tooling — @youneed/test + @youneed/test-plugin-benchmark. Each
// `@Benchmark` method becomes a timed loop; BenchmarkReporter prints ⚡ ops/sec.
// Both run in happy-dom; Lit's bodies await its async update model while our sync
// scheduler commits inline, so they're compared fairly.
// Run: pnpm --filter @youneed/dom bench
import { registerDOM } from "../src/register.ts";

registerDOM();

import { Test, TestApplication } from "@youneed/test";
import { Benchmark, benchmark, BenchmarkReporter } from "@youneed/test-plugin-benchmark";

const { Component, html, define, flushSync, setDefaultScheduler, syncScheduler } = await import("../src/dom.ts");
const lit = await import("lit");

// Render synchronously so our numbers reflect render cost, not scheduler latency.
setDefaultScheduler(syncScheduler);

// ── our component ──
class OursCounter extends Component("ours-counter") {
  @Component.prop() count = 0;
  render() {
    return html`<div class="c">count: ${this.count}</div>`;
  }
}
define(OursCounter);

// ── equivalent Lit component ──
// NOTE: no `count = 0` class field — with useDefineForClassFields it would
// shadow Lit's reactive accessor and silently disable updates. Init in the ctor.
class LitCounter extends lit.LitElement {
  static properties = { count: { type: Number } };
  declare count: number;
  constructor() {
    super();
    this.count = 0;
  }
  render() {
    return lit.html`<div class="c">count: ${this.count}</div>`;
  }
}
customElements.define("lit-counter", LitCounter);

const root = document.createElement("div");
document.body.appendChild(root);

// Long-lived elements for the update benchmarks.
const oursEl = document.createElement("ours-counter") as InstanceType<typeof OursCounter>;
root.appendChild(oursEl);
flushSync();
let oursN = 0;

const litEl = document.createElement("lit-counter") as InstanceType<typeof LitCounter>;
root.appendChild(litEl);
await litEl.updateComplete;
let litN = 0;

// ── benchmarks ──
// `group` tabulates mount-vs-mount and update-vs-update separately; `baseline`
// makes @youneed/dom the reference row, so Lit reads as "N× faster/slower".
class RenderBench extends Test({ name: "dom render — @youneed/dom vs Lit" }) {
  @Benchmark({ name: "@youneed/dom", group: "mount + first render", baseline: true })
  oursMount() {
    const el = document.createElement("ours-counter");
    root.appendChild(el);
    flushSync();
    el.remove();
  }

  @Benchmark({ name: "lit", group: "mount + first render" })
  async litMount() {
    const el = document.createElement("lit-counter") as InstanceType<typeof LitCounter>;
    root.appendChild(el);
    await el.updateComplete;
    el.remove();
  }

  // update is nano-scale → batch ops per sample to amortize timing overhead.
  @Benchmark({ name: "@youneed/dom", group: "prop update + re-render", baseline: true, iterations: 300, batch: 500 })
  oursUpdate() {
    oursEl.count = ++oursN;
    flushSync();
  }

  @Benchmark({ name: "lit", group: "prop update + re-render", iterations: 300, batch: 200 })
  async litUpdate() {
    litEl.count = ++litN;
    await litEl.updateComplete;
  }
}

// A fixed iteration count → reproducible, comparable numbers across runs.
await TestApplication()
  .addTests(RenderBench)
  .use(benchmark({ iterations: 5000 }))
  .reporter(new BenchmarkReporter())
  .run();
