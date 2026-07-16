// shad <shad-menubar> — a horizontal bar of menus (File / Edit / View …), like a
// desktop app menu bar. Data-driven via `menus`; each menu's `items` use the same
// MenuEntry model as <shad-dropdown-menu> (item, separator, heading, checkbox,
// radio, submenu, shortcut, icon, disabled, destructive).
//   bar.menus = [
//     { label: "File", items: [{ label: "New Tab", shortcut: "⌘T" }, …] },
//     { label: "Edit", items: [ … ] },
//   ];
// Click a trigger to open its menu; while one is open, hovering another switches
// to it. Emits `select` / `checkedchange` / `radiochange`. Esc / outside click close.

import { Component, html, css, map, when, type OnMount, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";
import type { MenuEntry } from "./context-menu.ts";

export interface MenubarMenu {
  label: string;
  items: MenuEntry[];
}

const CHECK = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
const DOT = html`<svg class="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>`;

@Component.define()
export class ShadMenubar extends Component("shad-menubar") implements OnMount {
  static styles = [tw, css`:host { display: inline-block; }`];

  @Component.prop() menus: MenubarMenu[] = [];

  #open = this.signal(-1); // open top-level menu index (-1 = none)
  #x = this.signal(0);
  #y = this.signal(0);
  #sub = this.signal(-1); // open submenu index within the current menu
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
    this.menus.forEach((m) => walk(m.items));
    this.#checks.set(checks);
    this.#radios.set(radios);

    document.addEventListener(
      "click",
      (e) => {
        if (this.#open() < 0) return;
        const path = e.composedPath();
        if (path.some((n) => n instanceof HTMLElement && (n.hasAttribute("data-menu") || n.hasAttribute("data-mb-trigger")))) return;
        this.#close();
      },
      { signal: this.abortSignal },
    );
    document.addEventListener("keydown", (e) => { if (this.#open() >= 0 && (e as KeyboardEvent).key === "Escape") this.#close(); }, { signal: this.abortSignal });
    addEventListener("scroll", () => this.#open() >= 0 && this.#close(), { capture: true, passive: true, signal: this.abortSignal });
  }

  #openMenu(i: number): void {
    const trigger = this.shadowRoot!.querySelectorAll("[data-mb-trigger]")[i] as HTMLElement | undefined;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    this.#sub.set(-1);
    this.#x.set(r.left);
    this.#y.set(r.bottom + 6);
    this.#open.set(i);
    requestAnimationFrame(() => {
      const m = this.shadowRoot!.querySelector("[data-menu]") as HTMLElement | null;
      if (!m) return;
      const mr = m.getBoundingClientRect();
      if (r.left + mr.width > innerWidth - 8) this.#x.set(Math.max(8, innerWidth - mr.width - 8));
    });
  }
  #close(): void {
    this.#open.set(-1);
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
      "relative flex cursor-default items-center gap-1.5 rounded-md py-1 text-sm outline-none select-none [&>svg]:h-4 [&>svg]:w-4";
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
      class="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style=${style}
    >
      ${map(entries, (e, i) => this.#row(e, i, top))}
    </div>`;
  }

  override render() {
    const open = this.#open();
    const panels: TemplateResult[] = [];
    if (open >= 0) {
      const items = this.menus[open]?.items ?? [];
      panels.push(this.#panel(items, true, `left:${this.#x()}px;top:${this.#y()}px`));
      const sub = this.#sub();
      const subItems = sub >= 0 ? items[sub]?.items : undefined;
      if (subItems) panels.push(this.#panel(subItems, false, `left:${this.#subX()}px;top:${this.#subY()}px`));
    }
    return html`
      <div role="menubar" class="flex h-9 items-center gap-0.5 rounded-md border border-border bg-background p-[3px]">
        ${map(
          this.menus,
          (m, i) => html`<button
            type="button"
            role="menuitem"
            data-mb-trigger
            aria-haspopup="menu"
            aria-expanded=${String(open === i)}
            class=${"flex cursor-default items-center rounded-sm px-2 py-1 text-sm font-medium outline-none select-none hover:bg-muted " +
            (open === i ? "bg-muted" : "")}
            @click=${() => (open === i ? this.#close() : this.#openMenu(i))}
            @pointerenter=${() => open >= 0 && open !== i && this.#openMenu(i)}
          >
            ${m.label}
          </button>`,
        )}
      </div>
      ${panels}
    `;
  }
}
