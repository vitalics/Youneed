// shad <shad-dropdown-menu> — a menu opened by clicking its trigger (the default
// slot). Data-driven via `items` (same MenuEntry model as <shad-context-menu>):
//   { label, shortcut?, icon?, disabled?, destructive?, value? }  — an action
//   { separator: true }                                           — a divider
//   { heading: "Label" }                                          — a section label
//   { checkbox: true, label, value, checked? }                    — toggle item
//   { radio: "group", value, label, checked? }                    — radio option
//   { label, icon?, items: [...] }                                — a submenu
// Emits `select` (value), `checkedchange` ({value,checked}), `radiochange`
// ({group,value}). The menu is position:fixed (anchored to the trigger) so it
// escapes any overflow-hidden ancestor. Esc / outside click close it.

import { Component, html, css, map, when, type OnMount, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";
import type { MenuEntry } from "./context-menu.ts";

export type { MenuEntry } from "./context-menu.ts";

const CHECK = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
const DOT = html`<svg class="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>`;

@Component.define()
export class ShadDropdownMenu extends Component("shad-dropdown-menu") implements OnMount {
  static styles = [tw, css`:host { display: inline-block; }`];

  @Component.prop() items: MenuEntry[] = [];
  // Align the menu's start/end edge to the trigger.
  @Component.prop({ attribute: true }) align: "start" | "end" = "start";
  // Which side of the trigger the menu opens on.
  @Component.prop({ attribute: true }) side: "bottom" | "top" | "right" | "left" = "bottom";

  #open = this.signal(false);
  #x = this.signal(0);
  #y = this.signal(0);
  #sub = this.signal(-1);
  #subX = this.signal(0);
  #subY = this.signal(0);
  #checks = this.signal(new Set<string>());
  #radios = this.signal({} as Record<string, string>);

  onMount(): void {
    const checks = new Set<string>();
    const radios: Record<string, string> = {};
    const walk = (es: MenuEntry[]) =>
      es.forEach((e) => {
        if (e.checkbox && e.checked && e.value) checks.add(e.value);
        if (e.radio && e.checked && e.value) radios[e.radio] = e.value;
        if (e.items) walk(e.items);
      });
    walk(this.items);
    this.#checks.set(checks);
    this.#radios.set(radios);

    document.addEventListener(
      "click",
      (e) => {
        if (!this.#open()) return;
        const path = e.composedPath();
        if (path.includes(this.#trigger()!)) return; // the trigger toggles itself
        if (path.some((n) => n instanceof HTMLElement && n.hasAttribute("data-menu"))) return;
        this.#close();
      },
      { signal: this.abortSignal },
    );
    document.addEventListener("keydown", (e) => { if (this.#open() && (e as KeyboardEvent).key === "Escape") this.#close(); }, { signal: this.abortSignal });
    addEventListener("scroll", () => this.#open() && this.#close(), { capture: true, passive: true, signal: this.abortSignal });
  }

  #trigger(): HTMLElement | null {
    return (this.shadowRoot!.querySelector("slot") as HTMLSlotElement).assignedElements()[0] as HTMLElement ?? null;
  }

  #toggle(): void {
    if (this.#open()) return this.#close();
    const t = this.#trigger();
    if (!t) return;
    const r = t.getBoundingClientRect();
    this.#sub.set(-1);
    // Initial guess (refined in rAF once the menu has measurable size).
    const horiz = this.side === "right" || this.side === "left";
    this.#x.set(horiz ? (this.side === "right" ? r.right + 4 : r.left) : this.align === "end" ? r.right : r.left);
    this.#y.set(horiz ? r.top : r.bottom + 4);
    this.#open.set(true);
    requestAnimationFrame(() => {
      const m = this.shadowRoot!.querySelector("[data-menu]") as HTMLElement | null;
      if (!m) return;
      const mr = m.getBoundingClientRect();
      const gap = 4;
      let x: number, y: number;
      if (horiz) {
        // Beside the trigger; flip to the other side if it would overflow.
        x = this.side === "right" ? r.right + gap : r.left - mr.width - gap;
        if (x + mr.width > innerWidth - 8) x = r.left - mr.width - gap;
        if (x < 8) x = r.right + gap;
        y = this.align === "end" ? r.bottom - mr.height : r.top;
        y = Math.max(8, Math.min(y, innerHeight - mr.height - 8));
      } else {
        x = this.align === "end" ? r.right - mr.width : r.left;
        if (x + mr.width > innerWidth - 8) x = Math.max(8, innerWidth - mr.width - 8);
        if (x < 8) x = 8;
        y = this.side === "top" ? r.top - mr.height - gap : r.bottom + gap;
        if (this.side !== "top" && y + mr.height > innerHeight - 8) y = Math.max(8, r.top - mr.height - gap); // flip up
      }
      this.#x.set(x);
      this.#y.set(y);
    });
  }
  #close(): void {
    this.#open.set(false);
    this.#sub.set(-1);
  }
  #run(e: MenuEntry): void {
    if (e.disabled) return;
    this.emit("select", e.value ?? e.label);
    this.#close();
  }
  #toggleCheck(e: MenuEntry): void {
    if (e.disabled || !e.value) return;
    const next = new Set(this.#checks());
    next.has(e.value) ? next.delete(e.value) : next.add(e.value);
    this.#checks.set(next);
    this.emit("checkedchange", { value: e.value, checked: next.has(e.value) });
  }
  #pickRadio(e: MenuEntry): void {
    if (e.disabled || !e.radio || !e.value) return;
    this.#radios.set({ ...this.#radios(), [e.radio]: e.value });
    this.emit("radiochange", { group: e.radio, value: e.value });
  }

  #row(e: MenuEntry, i: number, top: boolean) {
    if (e.separator) return html`<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>`;
    if (e.heading) return html`<div class="px-1.5 py-1 text-xs font-medium text-muted-foreground">${e.label}</div>`;

    const base =
      "relative flex cursor-default items-center gap-1.5 rounded-md py-1 text-sm outline-none select-none data-disabled:pointer-events-none [&>svg]:h-4 [&>svg]:w-4";
    const hover = e.destructive
      ? "hover:bg-destructive/10 hover:text-destructive text-destructive"
      : "hover:bg-accent hover:text-accent-foreground";
    const dim = e.disabled ? " pointer-events-none opacity-50" : "";

    if (e.checkbox) {
      const on = !!e.value && this.#checks().has(e.value);
      return html`<div role="menuitemcheckbox" aria-checked=${String(on)} class=${base + " pl-7 pr-2 " + hover + dim} @click=${() => this.#toggleCheck(e)}>
        <span class="pointer-events-none absolute left-1.5 flex h-4 w-4 items-center justify-center">${when(on, () => CHECK)}</span>
        ${when(e.icon, () => e.icon)}${e.label}
      </div>`;
    }
    if (e.radio) {
      const on = this.#radios()[e.radio] === e.value;
      return html`<div role="menuitemradio" aria-checked=${String(on)} class=${base + " pl-7 pr-2 " + hover + dim} @click=${() => this.#pickRadio(e)}>
        <span class="pointer-events-none absolute left-1.5 flex h-4 w-4 items-center justify-center">${when(on, () => DOT)}</span>
        ${when(e.icon, () => e.icon)}${e.label}
      </div>`;
    }
    if (e.items) {
      const openSub = top && this.#sub() === i;
      return html`<div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded=${String(openSub)}
        class=${base + " px-1.5 " + hover + (openSub ? " bg-accent text-accent-foreground" : "") + dim}
        @pointerenter=${(ev: PointerEvent) => {
          if (!top) return;
          const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          this.#subX.set(rect.right - 4);
          this.#subY.set(rect.top - 4);
          this.#sub.set(i);
        }}
      >
        ${when(e.icon, () => e.icon)}
        <span class="flex-1">${e.label}</span>
        <svg class="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </div>`;
    }
    return html`<div
      role="menuitem"
      aria-disabled=${e.disabled ? "true" : null}
      class=${base + " px-1.5 " + hover + dim}
      @pointerenter=${() => top && this.#sub.set(-1)}
      @click=${() => this.#run(e)}
    >
      ${when(e.icon, () => e.icon)}
      <span class="flex-1">${e.label}</span>
      ${when(e.shortcut, () => html`<span class="ml-auto text-xs tracking-widest text-muted-foreground">${e.shortcut}</span>`)}
    </div>`;
  }

  #panel(entries: MenuEntry[], top: boolean, style: string) {
    return html`<div
      role="menu"
      data-menu
      class="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-left text-popover-foreground shadow-md"
      style=${style}
    >
      ${map(entries, (e, i) => this.#row(e, i, top))}
    </div>`;
  }

  override render() {
    const panels: TemplateResult[] = [];
    if (this.#open()) {
      panels.push(this.#panel(this.items, true, `left:${this.#x()}px;top:${this.#y()}px`));
      const sub = this.#sub();
      const subItems = sub >= 0 ? this.items[sub]?.items : undefined;
      if (subItems) panels.push(this.#panel(subItems, false, `left:${this.#subX()}px;top:${this.#subY()}px`));
    }
    return html`<slot @click=${() => this.#toggle()}></slot>${panels}`;
  }
}
