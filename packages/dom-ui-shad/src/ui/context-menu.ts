// shad <shad-context-menu> — right-click (context) menu. The default slot is the
// trigger area; `items` describes the menu (data-driven). Entry kinds:
//   { label, shortcut?, icon?, disabled?, destructive?, value? }  — an action
//   { separator: true }                                           — a divider
//   { heading: "Label" }                                          — a section label
//   { checkbox: true, label, value, checked? }                    — toggle item
//   { radio: "group", value, label, checked? }                    — radio option
//   { label, icon?, items: [...] }                                — a submenu
// Emits `select` (value), `checkedchange` ({value,checked}), `radiochange`
// ({group,value}). Menu opens at the cursor; Esc / outside click closes.

import { Component, html, css, map, when, type OnMount, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

export interface MenuEntry {
  label?: string;
  value?: string;
  shortcut?: string;
  icon?: string | TemplateResult;
  disabled?: boolean;
  destructive?: boolean;
  separator?: boolean;
  heading?: boolean;
  checkbox?: boolean;
  radio?: string;
  checked?: boolean;
  items?: MenuEntry[];
}

const CHECK = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
const DOT = html`<svg class="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>`;

@Component.define()
export class ShadContextMenu extends Component("shad-context-menu") implements OnMount {
  static styles = [tw, css`:host { display: contents; }`];

  @Component.prop() items: MenuEntry[] = [];

  #open = this.signal(false);
  #x = this.signal(0);
  #y = this.signal(0);
  #sub = this.signal(-1); // index of the open top-level submenu (-1 = none)
  #subX = this.signal(0);
  #subY = this.signal(0);
  #checks = this.signal(new Set<string>());
  #radios = this.signal({} as Record<string, string>);

  onMount(): void {
    // Seed checkbox/radio state from the items (incl. submenus).
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

    this.addEventListener("contextmenu", (e) => { e.preventDefault(); this.#openAt(e.clientX, e.clientY); }, { signal: this.abortSignal });
    document.addEventListener("click", (e) => {
      // Close on any click outside a menu panel — including a plain click on the
      // trigger area itself (it lives in `this`, so checking the host would keep
      // the menu open). Only clicks inside a [data-menu] panel are spared.
      if (this.#open() && !e.composedPath().some((n) => n instanceof HTMLElement && n.hasAttribute("data-menu"))) this.#close();
    }, { signal: this.abortSignal });
    document.addEventListener("keydown", (e) => { if (this.#open() && (e as KeyboardEvent).key === "Escape") this.#close(); }, { signal: this.abortSignal });
  }

  #openAt(x: number, y: number): void {
    this.#sub.set(-1);
    this.#x.set(x);
    this.#y.set(y);
    this.#open.set(true);
    requestAnimationFrame(() => {
      const m = this.shadowRoot!.querySelector("[data-menu]") as HTMLElement | null;
      if (!m) return;
      const r = m.getBoundingClientRect();
      if (x + r.width > innerWidth - 8) this.#x.set(Math.max(8, innerWidth - r.width - 8));
      if (y + r.height > innerHeight - 8) this.#y.set(Math.max(8, innerHeight - r.height - 8));
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
    if (e.heading) return html`<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">${e.label}</div>`;

    const base =
      "relative flex cursor-default items-center gap-1.5 rounded-md py-1 text-sm outline-none select-none data-disabled:pointer-events-none [&>svg]:h-4 [&>svg]:w-4";
    const hover = e.destructive
      ? "hover:bg-destructive/10 hover:text-destructive text-destructive"
      : "hover:bg-accent hover:text-accent-foreground";
    const dim = e.disabled ? " pointer-events-none opacity-50" : "";

    if (e.checkbox) {
      const on = !!e.value && this.#checks().has(e.value);
      return html`<div role="menuitemcheckbox" aria-checked=${String(on)} class=${base + " pl-2 pr-8 " + hover + dim} @click=${() => this.#toggleCheck(e)}>
        <span class="pointer-events-none absolute right-2 flex h-4 w-4 items-center justify-center">${when(on, () => CHECK)}</span>
        ${e.label}
      </div>`;
    }
    if (e.radio) {
      const on = this.#radios()[e.radio] === e.value;
      return html`<div role="menuitemradio" aria-checked=${String(on)} class=${base + " pl-2 pr-8 " + hover + dim} @click=${() => this.#pickRadio(e)}>
        <span class="pointer-events-none absolute right-2 flex h-4 w-4 items-center justify-center">${when(on, () => DOT)}</span>
        ${e.label}
      </div>`;
    }
    if (e.items) {
      const openSub = top && this.#sub() === i;
      return html`<div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded=${String(openSub)}
        class=${base + " px-2 " + hover + (openSub ? " bg-accent text-accent-foreground" : "") + dim}
        @pointerenter=${(ev: PointerEvent) => {
          if (!top) return;
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          this.#subX.set(r.right - 4);
          this.#subY.set(r.top - 4);
          this.#sub.set(i);
        }}
      >
        ${when(e.icon, () => e.icon)}
        <span class="flex-1">${e.label}</span>
        <svg class="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </div>`;
    }
    // plain action item
    return html`<div
      role="menuitem"
      class=${base + " px-2 " + hover + dim}
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
      class="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style=${style}
    >
      ${map(entries, (e, i) => this.#row(e, i, top))}
    </div>`;
  }

  override render() {
    // A flat array of panels (cleared atomically on close) — nesting a `when`
    // for the submenu inside the open-`when` left the submenu DOM orphaned.
    const panels: TemplateResult[] = [];
    if (this.#open()) {
      panels.push(this.#panel(this.items, true, `left:${this.#x()}px;top:${this.#y()}px`));
      const sub = this.#sub();
      const subItems = sub >= 0 ? this.items[sub]?.items : undefined;
      if (subItems) panels.push(this.#panel(subItems, false, `left:${this.#subX()}px;top:${this.#subY()}px`));
    }
    return html`<slot></slot>${panels}`;
  }
}
