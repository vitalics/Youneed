// shad <shad-select> + <shad-option> — a dropdown select. Emits `change` (value).
//   <shad-select placeholder="Select a fruit">
//     <shad-option value="apple" group="Fruits">Apple</shad-option>
//     <shad-option value="banana" group="Fruits">Banana</shad-option>
//   </shad-select>
// Options are data-only children (value / disabled / group). The listbox is
// position:fixed (anchored to the trigger) so it escapes overflow-hidden; `position`
// chooses below-trigger ("popper") or selected-item-over-trigger ("item").

import { Component, html, css, when, map, type OnMount } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

const CHECK = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
const CHEVRON = html`<svg class="chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;

@Component.define()
export class ShadOption extends Component("shad-option") {
  // Data-only: never rendered directly — shad-select reads its attributes + text.
  static styles = [css`:host { display: none }`];
  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) group = "";
  override render() {
    return html``;
  }
}

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
  group: string;
}

@Component.define()
export class ShadSelect extends Component("shad-select") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; min-width: 9rem; }
      /* Chevron points up while the listbox is open (visible in popper mode). */
      button[aria-expanded="true"] .chevron { transform: rotate(180deg); }
    `,
  ];

  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) placeholder = "Select…";
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;
  // Default "item" (Radix-style): the selected option opens over the trigger.
  // "popper" aligns the popup to the trigger's bottom edge instead.
  @Component.prop({ attribute: true }) position: "popper" | "item" = "item";
  @Component.prop() open = false;

  #x = this.signal(0);
  #y = this.signal(0);
  #w = this.signal(0);
  #active = this.signal(-1); // keyboard-highlighted index (into the enabled items)

  #options(): Opt[] {
    return [...this.querySelectorAll("shad-option")].map((o) => ({
      value: o.getAttribute("value") ?? "",
      label: o.textContent?.trim() ?? "",
      disabled: o.hasAttribute("disabled") && o.getAttribute("disabled") !== "false",
      group: o.getAttribute("group") ?? "",
    }));
  }

  onMount(): void {
    document.addEventListener("click", (e) => { if (this.open && !e.composedPath().includes(this)) this.#close(); }, { signal: this.abortSignal });
    document.addEventListener("keydown", (e) => this.#onKey(e as KeyboardEvent), { signal: this.abortSignal });
    addEventListener("scroll", () => this.open && this.#close(), { capture: true, passive: true, signal: this.abortSignal });
  }

  #toggle(): void {
    if (this.disabled) return;
    this.open ? this.#close() : this.#openMenu();
  }
  #openMenu(): void {
    const trigger = this.shadowRoot!.querySelector("button")!;
    const r = trigger.getBoundingClientRect();
    this.#x.set(r.left);
    this.#w.set(r.width);
    this.#y.set(r.bottom + 4);
    const enabled = this.#options().filter((o) => !o.disabled);
    this.#active.set(Math.max(0, enabled.findIndex((o) => o.value === this.value)));
    this.open = true;
    requestAnimationFrame(() => this.#position(r));
  }
  #position(triggerRect: DOMRect): void {
    const panel = this.shadowRoot!.querySelector("[data-listbox]") as HTMLElement | null;
    if (!panel) return;
    const pr = panel.getBoundingClientRect();
    const sel = this.position === "item" ? (panel.querySelector('[aria-selected="true"]') as HTMLElement | null) : null;
    if (sel) {
      // Align the selected item over the trigger (Radix "item-aligned"). The panel
      // top is clamped so the panel always COVERS the trigger row (not just the
      // viewport), then the list is scrolled so the selected item lands there —
      // otherwise a tall list pins to the top edge, away from the trigger.
      const off = sel.offsetTop, itemH = sel.offsetHeight, ph = pr.height;
      const minTop = Math.max(8, triggerRect.top - ph + itemH);
      const maxTop = Math.min(innerHeight - ph - 8, triggerRect.top);
      const top = Math.max(minTop, Math.min(triggerRect.top - off, maxTop));
      this.#y.set(top);
      panel.scrollTop = Math.max(0, top + off - triggerRect.top);
      return;
    }
    // popper, or item-aligned with no selection → open below the trigger.
    let y = triggerRect.bottom + 4;
    if (y + pr.height > innerHeight - 8) y = Math.max(8, innerHeight - pr.height - 8);
    if (y < 8) y = 8;
    this.#y.set(y);
  }
  #close(): void {
    this.open = false;
  }
  #pick(o: Opt): void {
    if (o.disabled) return;
    this.value = o.value;
    this.open = false;
    this.emit("change", o.value);
  }
  #onKey(e: KeyboardEvent): void {
    if (!this.open) return;
    const enabled = this.#options().filter((o) => !o.disabled);
    if (e.key === "Escape") return this.#close();
    if (e.key === "ArrowDown") (e.preventDefault(), this.#active.set(Math.min(this.#active() + 1, enabled.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), this.#active.set(Math.max(this.#active() - 1, 0)));
    else if (e.key === "Enter") (e.preventDefault(), enabled[this.#active()] && this.#pick(enabled[this.#active()]));
  }

  override render() {
    const opts = this.#options();
    const selected = opts.find((o) => o.value === this.value);
    const enabled = opts.filter((o) => !o.disabled);
    return html`
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded=${String(this.open)}
        aria-invalid=${this.invalid ? "true" : "false"}
        data-placeholder=${selected ? null : ""}
        class=${cn(
          "flex h-9 w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border bg-background px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          this.invalid ? "border-destructive focus-visible:ring-destructive/30" : "border-input focus-visible:border-ring",
        )}
        .disabled=${this.disabled}
        @click=${() => this.#toggle()}
      >
        <span class=${"line-clamp-1 " + (selected ? "" : "text-muted-foreground")}>${selected?.label || this.placeholder}</span>
        ${CHEVRON}
      </button>
      ${when(
        this.open,
        () => html`<div
          data-listbox
          role="listbox"
          class="fixed z-50 max-h-80 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style=${`left:${this.#x()}px;top:${this.#y()}px;min-width:${this.#w()}px`}
        >
          ${map(opts, (o, i) => this.#row(o, opts[i - 1], enabled))}
        </div>`,
      )}
    `;
  }

  #row(o: Opt, prev: Opt | undefined, enabled: Opt[]) {
    const showLabel = o.group && o.group !== prev?.group;
    const sel = o.value === this.value;
    const active = enabled.indexOf(o) === this.#active() && !o.disabled;
    return html`
      ${when(showLabel, () => html`<div class="px-1.5 py-1 text-xs text-muted-foreground">${o.group}</div>`)}
      <div
        role="option"
        aria-selected=${String(sel)}
        aria-disabled=${o.disabled ? "true" : null}
        class=${cn(
          "relative flex w-full cursor-default items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none select-none",
          o.disabled ? "pointer-events-none opacity-50" : "hover:bg-accent hover:text-accent-foreground",
          active ? "bg-accent text-accent-foreground" : "",
        )}
        @pointerenter=${() => !o.disabled && this.#active.set(enabled.indexOf(o))}
        @click=${() => this.#pick(o)}
      >
        <span class="line-clamp-1">${o.label}</span>
        <span class="absolute right-2 flex h-4 w-4 items-center justify-center">${when(sel, () => CHECK)}</span>
      </div>
    `;
  }
}
