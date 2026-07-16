// SSR throughput: @youneed/ssr renderToString vs React renderToStaticMarkup.
// Both turn a component tree into an HTML string. Note: our output is richer
// (a Custom Element + Declarative Shadow DOM + inlined styles), React emits a
// plain <ul>/<li> tree — so this is "render a list to HTML", not byte-identical.
// Run: pnpm --filter @youneed/ssr bench
import { registerDOM } from "@youneed/dom/register";

registerDOM();

const [dom, ssr, React, reactServer, { bench, report }] = await Promise.all([
  import("../../dom/src/index.ts"),
  import("../src/dom-ssr.ts"),
  import("react"),
  import("react-dom/server"),
  import("../../bench-util.mjs"),
]);

const { Component, html } = dom;
const { renderToString } = ssr;
const h = (React.default ?? React).createElement;
const { renderToStaticMarkup } = reactServer;

const items = Array.from({ length: 25 }, (_, i) => `item ${i}`);

// ── our list component ──
@Component.define()
class OursList extends Component("ours-list") {
  @Component.prop() items: string[] = [];
  render() {
    return html`<ul>${this.items.map((it) => html`<li>${it}</li>`)}</ul>`;
  }
}

// sanity: make sure our renderer actually emits the items
const sample = renderToString(OursList.of({ items }));
if (!sample.includes("item 24")) throw new Error("ours renderToString produced no items");

const oursRender = () => renderToString(OursList.of({ items }));
const reactRender = () =>
  renderToStaticMarkup(h("ul", null, items.map((it, i) => h("li", { key: i }, it))));

report("ssr — render a 25-item list to an HTML string", [
  bench("@youneed/ssr", oursRender, { batch: 50 }),
  bench("react-dom/server", reactRender, { batch: 50 }),
]);

process.exit(0);
