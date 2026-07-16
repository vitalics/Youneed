// Framework-free baselines — the floor every framework is measured against:
//   • "vanilla DOM"     — document.createElement + textContent, nothing else.
//   • "custom element"  — a hand-written `class extends HTMLElement` with a shadow
//     root and a cached text node: the fastest a Web Component can be (no
//     reactivity, no diffing, no scheduler). This is the ceiling @youneed/dom
//     builds toward — its overhead over this row is the cost of the framework.
//
// No decorators here, so it compiles under both the repo's TC39 config and the
// Angular bench's legacy-decorator config. IMPORTANT: this module references
// HTMLElement / customElements at evaluation time, so import it *dynamically*
// only after @youneed/dom's registerDOM() has run.

export interface Baseline {
  /** Create + attach + detach a fresh node (mount + first paint). */
  mount: () => void;
  /** Update the text of one long-lived node (re-render). */
  update: () => void;
}

// A hand-written custom element: builds its shadow DOM once, then updates through
// a cached text node — the cheapest possible "component" update.
class CeCounter extends HTMLElement {
  #count = 0;
  #text: Text;
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const div = document.createElement("div");
    div.className = "c";
    this.#text = document.createTextNode("count: 0");
    div.appendChild(this.#text);
    shadow.appendChild(div);
  }
  get count(): number {
    return this.#count;
  }
  set count(v: number) {
    this.#count = v;
    this.#text.data = "count: " + v;
  }
}
if (!customElements.get("ce-counter")) customElements.define("ce-counter", CeCounter);

/** Build the two framework-free baselines, rendering into `root`. */
export function makeBaselines(root: HTMLElement): { vanilla: Baseline; customElement: Baseline } {
  // long-lived nodes for the update benches. The vanilla update mutates a cached
  // Text node's `.data` (the cheapest possible DOM write) rather than reassigning
  // `textContent` (which re-parses) — so this row is the true optimal floor.
  const vEl = document.createElement("div");
  vEl.className = "c";
  const vText = document.createTextNode("count: 0");
  vEl.appendChild(vText);
  root.appendChild(vEl);
  let vN = 0;

  const ceEl = document.createElement("ce-counter") as CeCounter;
  root.appendChild(ceEl);
  let cN = 0;

  return {
    vanilla: {
      mount: () => {
        const el = document.createElement("div");
        el.className = "c";
        el.textContent = "count: 0";
        root.appendChild(el);
        el.remove();
      },
      update: () => {
        vText.data = "count: " + ++vN;
      },
    },
    customElement: {
      mount: () => {
        const el = document.createElement("ce-counter");
        root.appendChild(el);
        el.remove();
      },
      update: () => {
        ceEl.count = ++cN;
      },
    },
  };
}
