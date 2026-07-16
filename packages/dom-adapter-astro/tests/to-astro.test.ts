// toAstro bridge: render a @youneed/dom component to SSR HTML for an Astro island —
// by class, raw tag and live instance — and confirm Declarative Shadow DOM is
// emitted and a `data-hydrate` script carries the props.
//
// happy-dom must be registered before dom.ts/@youneed/ssr load (classes extend
// HTMLElement at import), so register first, then dynamically import.
// Run: pnpm --filter @youneed/dom-adapter-astro test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { Component, html } = await import("@youneed/dom");
const { toAstro } = await import("../src/to-astro.ts");

@Component.define()
class Card extends Component("astro-card") {
  @Component.prop() name = "world";
  render() {
    return html`<p>hi ${this.name}</p>`;
  }
}

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

// ── class form renders DSD + hydration script ───────────────────────────────────
{
  const out = await toAstro(Card, { name: "Ada" });
  check("class form emits the host tag", out.includes("<astro-card"));
  check("class form emits Declarative Shadow DOM", out.includes('<template shadowrootmode="open"'));
  check("class form renders the prop into the shadow markup", out.includes("hi Ada"));
  check("class form emits a data-hydrate script", out.includes("data-hydrate"));
  check("hydrate script carries the tag + props", out.includes('"tag":"astro-card"') && out.includes('"name":"Ada"'));
}

// ── raw-tag form ────────────────────────────────────────────────────────────
{
  const out = await toAstro(Card.tagName, { name: "Lin" });
  check("tag form renders the prop", out.includes("hi Lin"));
  check("tag form emits a hydrate script", out.includes("data-hydrate") && out.includes('"name":"Lin"'));
}

// ── instance form ───────────────────────────────────────────────────────────
{
  const out = await toAstro(new Card({ name: "Bo" }));
  check("instance form renders the constructor prop", out.includes("hi Bo"));
  check("instance form recovers props for hydration", out.includes('"name":"Bo"'));
}

// ── hydrate:false omits the script (static markup) ──────────────────────────────
{
  const out = await toAstro(Card, { name: "St" }, { hydrate: false });
  check("hydrate:false still renders the markup", out.includes("hi St"));
  check("hydrate:false omits the hydrate script", !out.includes("data-hydrate"));
}

// ── no props → no hydrate script ────────────────────────────────────────────────
{
  const out = await toAstro(Card);
  check("default prop renders", out.includes("hi world"));
  check("no props → no hydrate script", !out.includes("data-hydrate"));
}

// ── the `<` in the JSON payload is escaped (no markup injection) ────────────────
{
  const out = await toAstro(Card, { name: "<b>x</b>" });
  check("hydrate JSON escapes `<`", out.includes("\\u003c") && !out.includes('"name":"<b>'));
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
