// @youneed/dom-provider-virtual — IntersectionObserver-driven list virtualization.
//
// Composable `@youneed/dom` provider: install `virtualProvider()` and call
// `this.virtual({ items, render })` from render(). Same shape as the other
// dom-provider-* packages (i18n/a11y/…). The standalone `virtual()` function is
// still exported for use without the provider.
//
//   import { virtualProvider } from "@youneed/dom-provider-virtual";
//   class Feed extends Component("x-feed", { providers: [virtualProvider()] }) {
//     @Component.prop() rows: Row[] = [];
//     render() {
//       return html`${this.virtual({ items: this.rows, render: (r) => html`<div>${r.title}</div>` })}`;
//     }
//   }
//
// For big lists, only the visible items should be real DOM. This splits the list
// into fixed-size CHUNKS and renders one `<vm-virtual-chunk>` per chunk. A single
// IntersectionObserver (rooted on the scroll viewport, with an overscan margin)
// watches every chunk; as a chunk scrolls into view its `active` prop flips and —
// thanks to @youneed/dom's per-component isolation — ONLY that chunk re-renders
// its items. Off-screen chunks collapse to a spacer of their last measured height,
// so the scrollbar stays correct and the parent list never re-renders on scroll.
//
//   import { virtual } from "@youneed/dom-virtual";
//   class Feed extends Component("x-feed") {
//     @Component.prop() rows: Row[] = [];
//     render() {
//       return html`${virtual({
//         items: this.rows,
//         render: (r) => html`<div class="row">${r.title}</div>`,
//         estimateHeight: 40,
//       })}`;
//     }
//   }
//
// Config is passed as ONE object prop (`.data=${…}`) on purpose: HTML lowercases
// attribute names, so a `.camelCaseProp=${…}` template binding silently misses —
// a single lowercase `data` prop keeps the camelCase option names intact.
//
// SSR: with no IntersectionObserver, chunks render as placeholders; the client
// hydrates and the observer fills visible chunks. v1 covers vertical lists with a
// per-item height estimate; variable item heights settle via measurement.
import { Component, css, html, repeat } from "@youneed/dom";
import type { ComponentProvider, TemplateResult } from "@youneed/dom";

type RenderItem = (item: unknown, index: number) => TemplateResult;
type KeyFn = (item: unknown, index: number) => unknown;

/** Options for {@link virtual}. */
export interface VirtualOptions<T> {
  /** The full dataset — only visible chunks are rendered. */
  items: readonly T[];
  /** Render one row. `index` is the item's GLOBAL index in `items`. */
  render: (item: T, index: number) => TemplateResult;
  /** Stable key per item (defaults to its global index). */
  key?: (item: T, index: number) => unknown;
  /** Items per chunk — the granularity of windowing (default `20`). */
  chunkSize?: number;
  /** Estimated px height per item, for placeholders before measurement (default `32`). */
  estimateHeight?: number;
  /** Extra px above/below the viewport kept rendered, so rows are ready before
   *  they're scrolled to (IntersectionObserver `rootMargin`, default `400`). */
  overscan?: number;
}

interface ChunkData {
  items: readonly unknown[];
  base: number; // global index of items[0]
  estimate: number; // placeholder height (px) before measurement
  render: RenderItem;
  key?: KeyFn;
}

// ── one chunk: renders its slice when active, else a height-holding spacer ──
@Component.define()
class VirtualChunk extends Component("vm-virtual-chunk") {
  static styles = css`
    :host {
      display: block;
    }
  `;
  /** Toggled by the list's IntersectionObserver. */
  @Component.prop() active = false;
  @Component.prop() data: ChunkData = { items: [], base: 0, estimate: 0, render: () => html`` };
  #measured = 0;

  #measure(): void {
    if (this.active) this.#measured = this.offsetHeight || this.#measured;
  }
  onMount(): void {
    this.#measure();
  }
  onUpdate(): void {
    this.#measure();
  }

  override render() {
    const d = this.data;
    if (!this.active) {
      const h = this.#measured || d.estimate;
      return html`<div style=${`height:${h}px`}></div>`;
    }
    return html`${repeat(
      d.items,
      (it, i) => (d.key ? d.key(it, d.base + i) : d.base + i),
      (it, i) => d.render(it, d.base + i),
    )}`;
  }
}

interface Chunk {
  base: number;
  items: readonly unknown[];
}

// ── the list: chunks the data, owns the viewport + one shared observer ──
@Component.define()
class VirtualList extends Component("vm-virtual-list") {
  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    .viewport {
      height: 100%;
      overflow: auto;
    }
  `;
  @Component.prop() data: VirtualOptions<unknown> = { items: [], render: () => html`` };

  #io?: IntersectionObserver;
  #chunks: Chunk[] = [];

  get #viewport(): HTMLElement | null {
    return (this.shadowRoot as ShadowRoot | null)?.querySelector(".viewport") ?? null;
  }

  override render() {
    const d = this.data;
    const size = Math.max(1, Math.floor(d.chunkSize ?? 20));
    const estimateHeight = d.estimateHeight ?? 32;
    const chunks: Chunk[] = [];
    for (let i = 0; i < d.items.length; i += size) {
      chunks.push({ base: i, items: d.items.slice(i, i + size) });
    }
    this.#chunks = chunks;
    return html`<div class="viewport">
      ${repeat(
        chunks,
        (c) => c.base,
        (c) =>
          html`<vm-virtual-chunk
            .data=${{
              items: c.items,
              base: c.base,
              estimate: c.items.length * estimateHeight,
              render: d.render as RenderItem,
              key: d.key as KeyFn | undefined,
            } as ChunkData}
          ></vm-virtual-chunk>`,
      )}
    </div>`;
  }

  onMount(): void {
    this.#sync();
  }
  // The LIST re-renders only when its `data` prop changes (IO flips a CHUNK's
  // prop, which re-renders just that chunk) — so re-syncing here is cheap.
  onUpdate(): void {
    this.#sync();
  }

  #sync(): void {
    const viewport = this.#viewport;
    if (!viewport) return;
    if (!this.#io) {
      if (typeof IntersectionObserver === "undefined") return; // SSR / unsupported
      this.#io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) (e.target as VirtualChunk).active = e.isIntersecting;
        },
        { root: viewport, rootMargin: `${this.data.overscan ?? 400}px` },
      );
      this.onCleanup(() => this.#io?.disconnect());
    }
    // (Re)observe the current chunk elements.
    this.#io.disconnect();
    for (const el of viewport.querySelectorAll("vm-virtual-chunk")) this.#io.observe(el);
  }
}

/**
 * Render a virtualized list — embed the returned template in a component's `html`.
 * Typed over the item type, so `render`/`key` get the real item type.
 */
export function virtual<T>(opts: VirtualOptions<T>): TemplateResult {
  return html`<vm-virtual-list .data=${opts as VirtualOptions<unknown>}></vm-virtual-list>`;
}

/** The provider's contribution, exposed as `this.virtual`. */
export interface VirtualApi {
  /** Render a virtualized list — embed the returned template in `html`. */
  <T>(opts: VirtualOptions<T>): TemplateResult;
}

/**
 * Composable provider adding `this.virtual(...)` to a component. Plugs into the
 * `Component(tag, { providers: [...] })` slot, orthogonal to the other providers.
 *
 *   class Feed extends Component("x-feed", { providers: [virtualProvider()] }) {
 *     render() { return html`${this.virtual({ items: this.rows, render: (r) => html`${r.title}` })}`; }
 *   }
 */
export function virtualProvider(): ComponentProvider<{ readonly virtual: VirtualApi }> {
  return {
    install(host) {
      (host as { virtual?: VirtualApi }).virtual = virtual;
    },
  };
}

export { VirtualList, VirtualChunk };
