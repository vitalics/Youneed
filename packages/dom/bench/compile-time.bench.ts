// How compile-time templates could work — measured with our own engine
// (@youneed/test-plugin-benchmark · runBenchmark + printBenchmarkTables).
//
// @youneed/dom's `html`` is a RUNTIME engine: per render it clones a cached
// <template>, walks it for hole markers, allocates Part objects, commits. A
// COMPILE-TIME approach (Solid/Svelte) emits straight-line code: a hoisted static
// skeleton cloned per instance, dynamic nodes grabbed by a fixed path, update is a
// direct `text.data = …`. The two middle rows isolate the *template engine* in an
// identical minimal custom-element shell; the last row is the real @youneed/dom
// component. Spread: compiled ≈ the metal · runtime adds the walk · framework adds
// the shell. A third table shows `@Component.compile()` freezing a static re-render.
// Run: pnpm --filter @youneed/dom bench:compile
import { registerDOM } from "../src/register.ts";

registerDOM();

import { runBenchmark, printBenchmarkTables } from "@youneed/test-plugin-benchmark";

const [{ Component, html, define, flushSync, setDefaultScheduler, syncScheduler }, { makeBaselines }] = await Promise.all([
  import("../src/dom.ts"),
  import("./baselines.ts"),
]);

setDefaultScheduler(syncScheduler);
const root = document.createElement("div");
document.body.appendChild(root);
const { vanilla, customElement } = makeBaselines(root);
const SHOW_COMMENT = 128;

// ── COMPILED: a hoisted skeleton cloned per instance; dynamic node by fixed path ──
const skeleton = document.createElement("div");
skeleton.className = "c";
skeleton.append("count: ", document.createTextNode("0"));
class CompiledEl extends HTMLElement {
  #text?: Text;
  connectedCallback() {
    if (this.#text) return;
    const node = skeleton.cloneNode(true) as HTMLElement;
    this.#text = node.lastChild as Text; // fixed path — the compiler knows it
    this.attachShadow({ mode: "open" }).appendChild(node);
  }
  set count(v: number) {
    if (this.#text) this.#text.data = String(v);
  }
}
customElements.define("compiled-el", CompiledEl);

// ── RUNTIME ENGINE: clone + WALK to find the marker + wire a generic setter ──
const runtimeTpl = document.createElement("template");
runtimeTpl.innerHTML = `<div class="c">count: <!--hole--></div>`;
class RuntimeEl extends HTMLElement {
  #text?: Text;
  connectedCallback() {
    if (this.#text) return;
    const frag = runtimeTpl.content.cloneNode(true) as DocumentFragment;
    const hole = document.createTreeWalker(frag, SHOW_COMMENT).nextNode() as ChildNode;
    this.#text = document.createTextNode("0");
    hole.replaceWith(this.#text);
    this.attachShadow({ mode: "open" }).appendChild(frag);
  }
  set count(v: number) {
    if (this.#text) this.#text.data = String(v);
  }
}
customElements.define("runtime-el", RuntimeEl);

// ── FULL FRAMEWORK + @Component.compile() ──
class AuthoredCounter extends Component("authored-counter") {
  @Component.prop() count = 0;
  render() {
    return html`<div class="c">count: ${this.count}</div>`;
  }
}
class StaticPlain extends Component("static-plain") {
  @Component.prop() count = 0;
  render() {
    return html`<div class="c">static</div>`;
  }
}
class StaticCompiled extends Component("static-compiled") {
  @Component.prop() count = 0;
  @Component.compile()
  render() {
    return html`<div class="c">static</div>`;
  }
}
define(AuthoredCounter, StaticPlain, StaticCompiled);

const mountOf = (tag: string) => () => {
  const el = root.appendChild(document.createElement(tag));
  flushSync();
  el.remove();
};
const updateOf = (tag: string) => {
  const el = root.appendChild(document.createElement(tag)) as HTMLElement & { count: number };
  flushSync();
  let n = 0;
  return () => {
    el.count = ++n;
    flushSync();
  };
};

const mnt = { group: "mount + first render", iterations: 3000 };
const upd = { group: "prop update + re-render", iterations: 300, batch: 500 };
const stat = { group: "re-render of a STATIC component", iterations: 300, batch: 500 };

printBenchmarkTables([
  await runBenchmark(vanilla.mount, { name: "vanilla DOM", baseline: true, ...mnt }),
  await runBenchmark(customElement.mount, { name: "custom element", ...mnt }),
  await runBenchmark(mountOf("compiled-el"), { name: "compiled (fixed path)", ...mnt }),
  await runBenchmark(mountOf("runtime-el"), { name: "runtime engine (walk)", ...mnt }),
  await runBenchmark(mountOf("authored-counter"), { name: "@youneed/dom (html``)", ...mnt }),

  await runBenchmark(vanilla.update, { name: "vanilla DOM", baseline: true, ...upd }),
  await runBenchmark(customElement.update, { name: "custom element", ...upd }),
  await runBenchmark(updateOf("compiled-el"), { name: "compiled (fixed path)", ...upd }),
  await runBenchmark(updateOf("runtime-el"), { name: "runtime engine (walk)", ...upd }),
  await runBenchmark(updateOf("authored-counter"), { name: "@youneed/dom (html``)", ...upd }),

  await runBenchmark(updateOf("static-plain"), { name: "static plain (re-renders)", baseline: true, ...stat }),
  await runBenchmark(updateOf("static-compiled"), { name: "static @compile (frozen)", ...stat }),
]);

process.exit(0);
