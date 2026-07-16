// time-travel.ts — the Time-Travel plugin, rendered with @youneed/dom itself.
//
// Demonstrates the PluginAPI: a plugin authored as a framework component. It
// reads the shared selection from the DevtoolsContext, lets you step through the
// selected component's recorded snapshots (◀ ▶ ⇥), and — for a live element —
// writes the snapshot back into it (true time-travel) under `ctx.replay` so the
// step itself doesn't add a new history entry.
//
// `static devtools = false` keeps this component out of the tree it inspects.

import { Component, classMap, css, html } from "@youneed/dom";
import {
  type ComponentRecord,
  componentPlugin,
  type DevtoolsContext,
  type DevtoolsPanel,
  fmt,
  type StateSnapshot,
} from "./core.ts";

type LiveNode = Record<string, unknown> & {
  flushSync?: () => void;
  setStyles?: (css: string) => void;
};

// Defined lazily inside a factory (not at module top level): `Component()` and
// `css` need a DOM, so eagerly defining the class would make importing
// @youneed/devtools throw in Node/SSR (before happy-dom is registered).
let TimeTravelView: ReturnType<typeof defineTimeTravelView> | undefined;

function defineTimeTravelView() {
  return class TimeTravelViewImpl extends Component("dt-time-travel") {
  static devtools = false;
  static styles = css`
    :host { display: block; padding: 6px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
    .travel { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .travel button { background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; cursor: pointer; font: inherit; padding: 1px 9px; }
    .travel button:disabled { opacity: .35; cursor: default; }
    .travel button.on { background: #3730a3; border-color: #6366f1; color: #fff; }
    .pos { color: #a1a1aa; }
    .badge { border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 10px; letter-spacing: .04em; white-space: nowrap; }
    .badge.live { background: #14532d; color: #4ade80; border: 1px solid #166534; }
    .badge.synced { background: #1e3a5f; color: #7dd3fc; border: 1px solid #1e40af; }
    .badge.past { background: #78350f; color: #fbbf24; border: 1px solid #92400e; }
    .section { margin: 8px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
    .kv { display: flex; gap: 6px; padding: 1px 0; }
    .kv .k { color: #fbbf24; }
    .kv .v { color: #d4d4d8; word-break: break-all; }
    .diff .changed .k, .diff .added .k { color: #4ade80; }
    .diff .removed .k { color: #f87171; }
    .arrow { color: #71717a; }
    .old { color: #f87171; text-decoration: line-through; }
    .new { color: #4ade80; }
    .muted { color: #71717a; }
  `;

  @Component.prop() ctx?: DevtoolsContext;

  #snap: number | null = null; // null = follow live
  #highlight = false; // keep the selected element outlined on the page
  #cleanup: Array<() => void> = [];

  onMount(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.#cleanup.push(ctx.subscribe(() => (this.requestUpdate(), this.#paintHighlight())));
    this.#cleanup.push(
      ctx.onSelect(() => {
        this.#snap = null; // reset stepping when the selection changes
        this.requestUpdate();
        this.#paintHighlight(); // keep outlining the (new) selection if active
      }),
    );
    // Keep the overlay glued to the element as the page scrolls / resizes.
    const refresh = () => this.#paintHighlight();
    this.listen(window, "scroll", refresh, { passive: true, capture: true });
    this.listen(window, "resize", refresh);
  }

  onUnmount(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.ctx?.highlight(undefined); // drop the overlay when the tab closes
  }

  /** Draw (or clear) the on-page overlay for the current selection. */
  #paintHighlight(): void {
    this.ctx?.highlight(this.#highlight ? this.ctx.current() : undefined);
  }

  /** Toggle the persistent highlight; scroll the element into view when turning on. */
  #toggleHighlight(): void {
    this.#highlight = !this.#highlight;
    if (this.#highlight) {
      (this.ctx?.current()?.elRef?.deref() as Element | undefined)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    this.#paintHighlight();
    this.requestUpdate();
  }

  #apply(rec: ComponentRecord, snap: StateSnapshot): void {
    const node = rec.elRef?.deref() as LiveNode | undefined;
    if (!node || !this.ctx) return;
    this.ctx.replay(() => {
      for (const [k, v] of Object.entries(snap.props)) {
        try {
          node[k] = v;
        } catch {
          /* read-only prop */
        }
      }
      if (snap.styles && typeof node.setStyles === "function") {
        node.setStyles(snap.styles.map((r) => r.cssText).join("\n"));
      }
      node.flushSync?.();
    });
  }

  #goTo(i: number, rec: ComponentRecord): void {
    const last = rec.history.length - 1;
    const clamped = Math.max(0, Math.min(i, last));
    this.#snap = clamped >= last ? null : clamped;
    const elementLive = rec.alive && !!rec.elRef?.deref();
    if (elementLive) this.#apply(rec, rec.history[clamped]);
    this.requestUpdate();
    this.#paintHighlight(); // the element may have resized after applying the snapshot
  }

  override render() {
    const ctx = this.ctx;
    if (!ctx) return html``;
    const rec = ctx.current();
    if (!rec) return html`<div class="muted">select a component in the Components tab</div>`;
    if (rec.history.length === 0) return html`<div class="muted">no recorded snapshots yet</div>`;

    const last = rec.history.length - 1;
    const index = this.#snap == null ? last : Math.min(this.#snap, last);
    const live = this.#snap == null || index === last;
    const snap = rec.history[index];
    const elementLive = rec.alive && !!rec.elRef?.deref();
    const badgeCls = live ? "badge live" : elementLive ? "badge synced" : "badge past";
    const badgeTxt = live ? "● LIVE" : elementLive ? "⟲ TIME-TRAVEL · DOM synced" : "◷ PAST · DOM unchanged";

    const props = snap.props;
    const prev = index > 0 ? rec.history[index - 1].props : undefined;
    const changedKeys = prev
      ? [...new Set([...Object.keys(prev), ...Object.keys(props)])]
          .filter((k) => !Object.is(prev[k], props[k]))
          .sort()
      : [];

    return html`
      <div class="travel">
        <button @click=${() => this.#goTo(index - 1, rec)} .disabled=${index <= 0}>◀</button>
        <button @click=${() => this.#goTo(index + 1, rec)} .disabled=${index >= last}>▶</button>
        <button @click=${() => this.#goTo(last, rec)} .disabled=${live} title="Jump to live">⇥</button>
        <button
          class=${classMap({ on: this.#highlight })}
          .disabled=${!elementLive}
          @click=${() => this.#toggleHighlight()}
          title="Highlight the selected element on the page"
        >⌖</button>
        <span class=${badgeCls}>${badgeTxt}</span>
        <span class="pos">${index + 1}/${rec.history.length}${snap.version != null ? ` · v${snap.version}` : ""}</span>
      </div>

      <div class="section">props @ snapshot ${index + 1}</div>
      ${Object.keys(props).length === 0
        ? html`<div class="muted">—</div>`
        : Object.entries(props).map(
            ([k, v]) => html`<div class="kv"><span class="k">${k}:</span><span class="v">${fmt(v)}</span></div>`,
          )}

      ${prev && changedKeys.length > 0
        ? html`
            <div class="section">changes vs snapshot ${index}</div>
            <div class="diff">
              ${changedKeys.map(
                (k) => html`
                  <div class="kv changed">
                    <span class="k">${k}:</span>
                    <span class="old">${fmt(prev[k])}</span>
                    <span class="arrow">→</span>
                    <span class="new">${fmt(props[k])}</span>
                  </div>
                `,
              )}
            </div>
          `
        : html``}
    `;
    }
  };
}

/** The Time-Travel plugin (built with @youneed/dom). */
export function timeTravelPanel(): DevtoolsPanel {
  TimeTravelView ??= defineTimeTravelView();
  return componentPlugin("time-travel", "Time Travel", TimeTravelView);
}
