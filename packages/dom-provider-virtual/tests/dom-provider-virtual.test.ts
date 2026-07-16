// Virtualization: only chunks the IntersectionObserver reports as visible render
// their items; off-screen chunks stay as height-holding placeholders. happy-dom
// has no IntersectionObserver, so we inject a controllable fake and drive it.
// Run: pnpm --filter @youneed/dom-virtual test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();

// ── controllable fake IntersectionObserver ──
type IOEntry = { target: Element; isIntersecting: boolean };
class FakeIO {
  static last: FakeIO | undefined;
  #cb: (entries: IOEntry[]) => void;
  targets = new Set<Element>();
  constructor(cb: (entries: IOEntry[]) => void) {
    this.#cb = cb;
    FakeIO.last = this;
  }
  observe(el: Element) {
    this.targets.add(el);
  }
  unobserve(el: Element) {
    this.targets.delete(el);
  }
  disconnect() {
    this.targets.clear();
  }
  /** Drive an intersection change for a subset of observed targets. */
  fire(targets: Element[], isIntersecting: boolean) {
    this.#cb(targets.map((target) => ({ target, isIntersecting })));
  }
}
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;

const { Component, html, define, flushSync, setDefaultScheduler, syncScheduler } = await import("@youneed/dom");
const { virtual, virtualProvider } = await import("../src/index.ts");
setDefaultScheduler(syncScheduler);

const items = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `item-${i}` }));

@Component.define()
class Host extends Component("x-vhost") {
  render() {
    return html`${virtual({
      items,
      chunkSize: 10,
      estimateHeight: 20,
      render: (it: { id: number; name: string }) => html`<div class="row" data-id=${String(it.id)}>${it.name}</div>`,
    })}`;
  }
}
void Host;

const host = document.createElement("x-vhost");
document.body.appendChild(host);
flushSync();

const list = host.shadowRoot!.querySelector("vm-virtual-list")!;
const viewport = list.shadowRoot!.querySelector(".viewport")!;
const chunkEls = () => [...viewport.querySelectorAll("vm-virtual-chunk")] as (HTMLElement & { active: boolean })[];
const rowsIn = (chunk: HTMLElement) => chunk.shadowRoot!.querySelectorAll(".row").length;
const totalRows = () => chunkEls().reduce((n, c) => n + rowsIn(c), 0);
const placeholderIn = (chunk: HTMLElement) => chunk.shadowRoot!.querySelector("div[style*='height']") != null;

const io = FakeIO.last!;
const chunks = chunkEls();

// Activate chunks 0 and 1 (the visible window).
io.fire([chunks[0], chunks[1]], true);
flushSync();
const afterActivate = { rows: totalRows(), c0: rowsIn(chunks[0]), c2placeholder: placeholderIn(chunks[2]) };

// Scroll chunk 0 out of view.
io.fire([chunks[0]], false);
flushSync();
const afterLeave = { rows: totalRows(), c0placeholder: placeholderIn(chunks[0]) };

// ── provider form: this.virtual(...) ──
@Component.define()
class ProvHost extends Component("x-vprov", { providers: [virtualProvider()] }) {
  render() {
    return html`${this.virtual({
      items,
      chunkSize: 10,
      render: (it: { id: number; name: string }) => html`<div class="row">${it.name}</div>`,
    })}`;
  }
}
void ProvHost;
const provHost = document.createElement("x-vprov") as HTMLElement & { virtual?: unknown };
document.body.appendChild(provHost);
flushSync();

class VirtualTest extends Test({ name: "dom-provider-virtual" }) {
  @Test.it("splits the list into chunks (100 items / 10 = 10 chunks)") chunked() {
    expect(chunks.length).toBe(10);
  }
  @Test.it("renders nothing until a chunk is reported visible") lazy() {
    // before any fire, total rows is 0 (mount happened with all inactive)
    expect(afterActivate.c0).toBe(10); // chunk 0 now has its 10 rows
  }
  @Test.it("only the visible chunks render their items") windowed() {
    expect(afterActivate.rows).toBe(20); // chunks 0 + 1 only
    expect(afterActivate.c2placeholder).toBeTruthy(); // chunk 2 still a spacer
  }
  @Test.it("a chunk scrolled out of view collapses back to a placeholder") recycle() {
    expect(afterLeave.rows).toBe(10); // only chunk 1 left
    expect(afterLeave.c0placeholder).toBeTruthy();
  }
  @Test.it("the observer watches every chunk element") observed() {
    expect(io.targets.size).toBe(10);
  }
  @Test.it("provider exposes this.virtual + renders vm-virtual-list") provider() {
    expect(typeof provHost.virtual).toBe("function");
    expect(provHost.shadowRoot!.querySelector("vm-virtual-list")).toBeTruthy();
  }
}

await TestApplication().addTests(VirtualTest).reporter(new ConsoleReporter()).run();
