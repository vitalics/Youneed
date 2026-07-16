// Angular comparison — kept in its OWN run (and its own tsconfig) because Angular
// needs legacy `experimentalDecorators` + `useDefineForClassFields: false`, while
// the rest of the repo (incl. @youneed/dom's `@Component.prop`) uses TC39 standard
// decorators — the two modes can't share one compilation.
//
// So this file talks to @youneed/dom through its decorator-FREE API (a plain
// `count` field + `requestUpdate()`), imported from the built package, to provide
// a shared baseline row. Angular runs zoneless (no zone.js); each component is
// created via `createComponent` and flushed with `detectChanges()`.
//
// Run: pnpm --filter @youneed/dom bench:angular
import { registerDOM } from "../src/register.ts";

registerDOM();

import "@angular/compiler"; // enable the JIT compiler (no AOT step in a bench)
import { Component as NgComponent, Input, createComponent, provideZonelessChangeDetection, type EnvironmentInjector } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { Component, html, define, flushSync, setDefaultScheduler, syncScheduler } from "@youneed/dom";
// The benchmark engine via its IMPERATIVE API — `@Benchmark`/`@youneed/test` use
// TC39 decorators, which can't coexist with this file's legacy Angular decorators,
// so we measure with plain function calls instead (same engine + comparison table).
import { runBenchmark, printBenchmarkTables } from "@youneed/test-plugin-benchmark";

setDefaultScheduler(syncScheduler);
const root = document.createElement("div");
document.body.appendChild(root);

// Framework-free baselines (the floor). Imported dynamically: the module touches
// HTMLElement/customElements, which only exist after registerDOM() has run.
const { makeBaselines } = await import("./baselines.ts");
const { vanilla, customElement } = makeBaselines(root);

// ── @youneed/dom (decorator-free wiring; same render engine as bench:frameworks) ──
class OursCounter extends Component("ours-counter") {
  count = 0;
  render() {
    return html`<div class="c">count: ${this.count}</div>`;
  }
}
define(OursCounter);

const oursMount = () => {
  const el = document.createElement("ours-counter");
  root.appendChild(el);
  flushSync();
  el.remove();
};
const oursEl = document.createElement("ours-counter") as OursCounter;
root.appendChild(oursEl);
flushSync();
let oursN = 0;
const oursUpdate = () => {
  oursEl.count = ++oursN;
  oursEl.requestUpdate();
  flushSync();
};

// ── Angular ──────────────────────────────────────────────────────────────────
@NgComponent({ selector: "ng-counter", template: `<div class="c">count: {{ count }}</div>` })
class NgCounter {
  @Input() count = 0;
}
@NgComponent({ selector: "ng-root", template: "" })
class NgRoot {}

const ngHost = document.createElement("ng-root");
document.body.appendChild(ngHost);
const appRef = await bootstrapApplication(NgRoot, { providers: [provideZonelessChangeDetection()] });
const injector: EnvironmentInjector = appRef.injector;

const ngMount = () => {
  const hostEl = document.createElement("div");
  root.appendChild(hostEl);
  const ref = createComponent(NgCounter, { environmentInjector: injector, hostElement: hostEl });
  ref.changeDetectorRef.detectChanges();
  ref.destroy();
  hostEl.remove();
};
const ngHostEl = document.createElement("div");
root.appendChild(ngHostEl);
const ngRef = createComponent(NgCounter, { environmentInjector: injector, hostElement: ngHostEl });
ngRef.changeDetectorRef.detectChanges();
let ngN = 0;
const ngUpdate = () => {
  ngRef.setInput("count", ++ngN);
  ngRef.changeDetectorRef.detectChanges();
};

// ── run (vanilla DOM is the baseline — the floor everything is measured from) ──
const mnt = { group: "mount + first render", iterations: 3000 };
const upd = { group: "prop update + re-render", iterations: 300, batch: 500 };

printBenchmarkTables([
  await runBenchmark(vanilla.mount, { name: "vanilla DOM", baseline: true, ...mnt }),
  await runBenchmark(customElement.mount, { name: "custom element", ...mnt }),
  await runBenchmark(oursMount, { name: "@youneed/dom", ...mnt }),
  await runBenchmark(ngMount, { name: "angular", ...mnt }),

  await runBenchmark(vanilla.update, { name: "vanilla DOM", baseline: true, ...upd }),
  await runBenchmark(customElement.update, { name: "custom element", ...upd }),
  await runBenchmark(oursUpdate, { name: "@youneed/dom", ...upd }),
  await runBenchmark(ngUpdate, { name: "angular", ...upd }),
]);

process.exit(0);
