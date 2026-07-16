// shad resizable panels — draggable, keyboard-accessible split layouts.
//   <shad-resizable-panel-group orientation="horizontal" class="max-w-sm rounded-lg border">
//     <shad-resizable-panel default-size="50%">…</shad-resizable-panel>
//     <shad-resizable-handle with-handle></shad-resizable-handle>
//     <shad-resizable-panel default-size="50%">…</shad-resizable-panel>
//   </shad-resizable-panel-group>
// The group owns sizing: a handle's `flex-grow` is moved between the panels on its
// two sides as you drag (pointer) or press arrow keys. Panels flex-basis:0 so the
// grow values act as proportional weights. Nest a group inside a panel for grids.

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

type Panel = HTMLElement & { style: CSSStyleDeclaration };

@Component.define()
export class ShadResizablePanelGroup extends Component("shad-resizable-panel-group") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: flex; height: 100%; width: 100%; overflow: hidden; background: hsl(var(--background)); }
      :host([orientation="vertical"]) { flex-direction: column; }
      slot { display: contents; }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) orientation: "horizontal" | "vertical" = "horizontal";

  #horizontal(): boolean {
    return this.orientation !== "vertical";
  }
  #panelsAround(handle: Element): [Panel, Panel] | null {
    const kids = [...this.children];
    const i = kids.indexOf(handle);
    const prev = kids[i - 1], next = kids[i + 1];
    if (prev?.tagName === "SHAD-RESIZABLE-PANEL" && next?.tagName === "SHAD-RESIZABLE-PANEL") {
      return [prev as Panel, next as Panel];
    }
    return null;
  }
  #grow(p: Panel): number {
    return parseFloat(p.style.flexGrow) || 0;
  }
  #apply(handle: Element, prev: Panel, next: Panel, p: number, n: number, total: number): void {
    const min = total * 0.05; // each side keeps ≥5% of the pair
    if (p < min) (n -= min - p, p = min);
    if (n < min) (p -= min - n, n = min);
    prev.style.flexGrow = String(p);
    next.style.flexGrow = String(n);
    handle.setAttribute("aria-valuenow", String(Math.round((p / total) * 100)));
    this.#emitLayout();
  }
  // Emit the whole group's layout as panel sizes in percent (sums to 100).
  #emitLayout(): void {
    const panels = [...this.children].filter((c) => c.tagName === "SHAD-RESIZABLE-PANEL") as Panel[];
    const sum = panels.reduce((a, p) => a + this.#grow(p), 0) || 1;
    this.emit("resize", panels.map((p) => Math.round((this.#grow(p) / sum) * 1000) / 10));
  }

  onMount(): void {
    // Seed each panel's flex-grow from its default-size (else share equally).
    const panels = [...this.children].filter((c) => c.tagName === "SHAD-RESIZABLE-PANEL") as Panel[];
    panels.forEach((p) => {
      const ds = parseFloat(p.getAttribute("default-size") || "");
      p.style.flexGrow = String(isNaN(ds) ? 100 / panels.length : ds);
    });
    // Seed each handle's aria-valuenow from its left/top panel share.
    for (const h of this.children) {
      if (h.tagName !== "SHAD-RESIZABLE-HANDLE") continue;
      const pair = this.#panelsAround(h);
      if (!pair) continue;
      const [prev, next] = pair;
      const total = this.#grow(prev) + this.#grow(next);
      if (total) h.setAttribute("aria-valuenow", String(Math.round((this.#grow(prev) / total) * 100)));
    }

    this.addEventListener("pointerdown", (e) => {
      const handle = e.composedPath().find((n) => (n as Element)?.tagName === "SHAD-RESIZABLE-HANDLE") as Element | undefined;
      if (!handle) return;
      const pair = this.#panelsAround(handle);
      if (!pair) return;
      e.preventDefault();
      e.stopPropagation(); // a nested group must not also react
      const [prev, next] = pair;
      const horizontal = this.#horizontal();
      const groupPx = horizontal ? this.getBoundingClientRect().width : this.getBoundingClientRect().height;
      const start = horizontal ? (e as PointerEvent).clientX : (e as PointerEvent).clientY;
      const p0 = this.#grow(prev), n0 = this.#grow(next), total = p0 + n0;
      handle.setAttribute("data-separator", "active");
      const onMove = (ev: PointerEvent) => {
        const pos = horizontal ? ev.clientX : ev.clientY;
        const frac = ((pos - start) / groupPx) * total;
        this.#apply(handle, prev, next, p0 + frac, n0 - frac, total);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        handle.setAttribute("data-separator", "inactive");
        document.body.style.userSelect = "";
      };
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
    }, { signal: this.abortSignal });

    // Keyboard: arrow keys nudge the focused handle by 5% of the pair.
    this.addEventListener("keydown", (e) => {
      const ke = e as KeyboardEvent;
      const handle = e.composedPath().find((n) => (n as Element)?.tagName === "SHAD-RESIZABLE-HANDLE") as Element | undefined;
      if (!handle) return;
      const pair = this.#panelsAround(handle);
      if (!pair) return;
      const horizontal = this.#horizontal();
      const dec = horizontal ? "ArrowLeft" : "ArrowUp";
      const inc = horizontal ? "ArrowRight" : "ArrowDown";
      if (ke.key !== dec && ke.key !== inc) return;
      e.preventDefault();
      const [prev, next] = pair;
      const p0 = this.#grow(prev), n0 = this.#grow(next), total = p0 + n0;
      const step = total * 0.05 * (ke.key === inc ? 1 : -1);
      this.#apply(handle, prev, next, p0 + step, n0 - step, total);
    }, { signal: this.abortSignal });
  }

  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadResizablePanel extends Component("shad-resizable-panel") {
  static styles = [
    tw,
    css`
      :host { display: flex; overflow: hidden; flex-grow: 1; flex-shrink: 1; flex-basis: 0; min-width: 0; min-height: 0; }
      slot { display: contents; }
    `,
  ];
  @Component.prop({ attribute: "default-size" }) defaultSize = "";
  override render() {
    return html`<div class="min-h-0 min-w-0 flex-1 overflow-hidden"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadResizableHandle extends Component("shad-resizable-handle") implements OnMount {
  static styles = [
    tw,
    css`
      :host {
        position: relative;
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        background: hsl(var(--border));
        outline: none;
        width: 1px;
        cursor: col-resize;
        touch-action: none;
      }
      :host(:focus-visible) { box-shadow: 0 0 0 1px hsl(var(--ring)); }
      /* Vertical group → a horizontal divider. */
      :host-context(shad-resizable-panel-group[orientation="vertical"]) { width: auto; height: 1px; cursor: row-resize; }
      .grip { z-index: 10; display: flex; height: 1.5rem; width: 0.25rem; flex-shrink: 0; border-radius: 0.5rem; background: hsl(var(--border)); }
      :host-context(shad-resizable-panel-group[orientation="vertical"]) .grip { height: 0.25rem; width: 1.5rem; }
    `,
  ];

  @Component.prop({ attribute: "with-handle" }) withHandle = false;

  onMount(): void {
    this.setAttribute("role", "separator");
    this.setAttribute("tabindex", "0");
    this.setAttribute("aria-valuemin", "0");
    this.setAttribute("aria-valuemax", "100");
    const vertical = this.closest('shad-resizable-panel-group[orientation="vertical"]') != null;
    this.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
    this.setAttribute("data-separator", "inactive");
  }

  override render() {
    return this.withHandle ? html`<div class="grip"></div>` : html``;
  }
}
