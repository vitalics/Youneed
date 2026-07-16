// @youneed/dom vs React, Vue — anchored against framework-free baselines (vanilla
// DOM + a hand-written custom element) that mark the floor. Measured with our own
// @youneed/test-plugin-benchmark engine (runBenchmark + printBenchmarkTables).
// Two groups (mount, update) → two tables; baseline = vanilla DOM, so each row
// reads "N× slower than the metal". happy-dom, sync scheduler; async models awaited.
// Run: pnpm --filter @youneed/dom bench:frameworks
import { registerDOM } from "../src/register.ts";

registerDOM();

import { runBenchmark, printBenchmarkTables } from "@youneed/test-plugin-benchmark";

const [{ Component, html, define, flushSync, setDefaultScheduler, syncScheduler }, React, ReactDOMClient, ReactDOM, Vue, { makeBaselines }] =
  await Promise.all([import("../src/dom.ts"), import("react"), import("react-dom/client"), import("react-dom"), import("vue"), import("./baselines.ts")]);
const reactFlush = ReactDOM.flushSync;

setDefaultScheduler(syncScheduler);
const root = document.createElement("div");
document.body.appendChild(root);
const { vanilla, customElement } = makeBaselines(root);
const append = () => root.appendChild(document.createElement("div"));

// ── @youneed/dom (shadow + light-DOM) ──
class OursCounter extends Component("ours-counter") {
  @Component.prop() count = 0;
  render() {
    return html`<div class="c">count: ${this.count}</div>`;
  }
}
class OursLight extends Component("ours-light", { shadow: false }) {
  @Component.prop() count = 0;
  render() {
    return html`<div class="c">count: ${this.count}</div>`;
  }
}
define(OursCounter);
define(OursLight);
const domMount = (tag: string) => () => {
  const el = root.appendChild(document.createElement(tag));
  flushSync();
  el.remove();
};
const domUpdate = (el: { count: number }) => () => {
  el.count++;
  flushSync();
};
const oursEl = root.appendChild(document.createElement("ours-counter")) as unknown as { count: number };
const lightEl = root.appendChild(document.createElement("ours-light")) as unknown as { count: number };
flushSync();

// ── React ──
const h = React.createElement;
const RC = ({ count }: { count: number }) => h("div", { className: "c" }, `count: ${count}`);
const reactRoot = ReactDOMClient.createRoot(append());
reactFlush(() => reactRoot.render(h(RC, { count: 0 })));
let rn = 0;

// ── Vue ──
const vueCount = Vue.ref(0);
Vue.createApp({ setup: () => () => Vue.h("div", { class: "c" }, `count: ${vueCount.value}`) }).mount(append());

// mount is micro-scale (measurable per-op); update is nano-scale for the sync
// renderers, so batch many ops per sample to amortize timing overhead.
const mnt = { group: "mount + first render", iterations: 3000 };
const upS = { group: "prop update + re-render", iterations: 300, batch: 500 }; // sync nano
const upA = { group: "prop update + re-render", iterations: 2000 }; // async (awaited)
const reactMountFn = () => {
  const host = append();
  const r = ReactDOMClient.createRoot(host);
  reactFlush(() => r.render(h(RC, { count: 0 })));
  r.unmount();
  host.remove();
};
const vueMountFn = () => {
  const host = append();
  const app = Vue.createApp({ setup: () => () => Vue.h("div", { class: "c" }, "count: 0") });
  app.mount(host);
  app.unmount();
  host.remove();
};

printBenchmarkTables([
  await runBenchmark(() => vanilla.mount(), { name: "vanilla DOM", baseline: true, ...mnt }),
  await runBenchmark(() => customElement.mount(), { name: "custom element", ...mnt }),
  await runBenchmark(domMount("ours-counter"), { name: "@youneed/dom", ...mnt }),
  await runBenchmark(domMount("ours-light"), { name: "@youneed/dom light", ...mnt }),
  await runBenchmark(reactMountFn, { name: "react", ...mnt }),
  await runBenchmark(vueMountFn, { name: "vue", ...mnt }),

  await runBenchmark(() => vanilla.update(), { name: "vanilla DOM", baseline: true, ...upS }),
  await runBenchmark(() => customElement.update(), { name: "custom element", ...upS }),
  await runBenchmark(domUpdate(oursEl), { name: "@youneed/dom", ...upS }),
  await runBenchmark(domUpdate(lightEl), { name: "@youneed/dom light", ...upS }),
  await runBenchmark(() => reactFlush(() => reactRoot.render(h(RC, { count: ++rn }))), { name: "react", ...upA }),
  await runBenchmark(async () => {
    vueCount.value++;
    await Vue.nextTick();
  }, { name: "vue", ...upA }),
]);

process.exit(0);
