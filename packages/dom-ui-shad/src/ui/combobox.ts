// shad <shad-combobox> — a searchable select (Popover + filterable list). Data-
// driven via `options`; single or `multiple` (chips); optional `clearable`.
//   combobox.options = [{ value: "next", label: "Next.js" }, …];
//   combobox.value = "next";              // single
//   <shad-combobox multiple clearable></shad-combobox>
// Emits `change` (string for single, string[] for multiple).

import { Component, html, css, map, when, type OnMount } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

export interface ComboOption {
  value: string;
  label: string;
  group?: string;
}

@Component.define()
export class ShadCombobox extends Component("shad-combobox") implements OnMount {
  static styles = [tw, css`:host { display: block; position: relative; }`];

  @Component.prop() options: ComboOption[] = [];
  @Component.prop({ attribute: true }) value = "";
  @Component.prop() values: string[] = [];
  @Component.prop({ attribute: true }) multiple = false;
  @Component.prop({ attribute: true }) placeholder = "Select…";
  @Component.prop({ attribute: true }) clearable = false;
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;

  #open = this.signal(false);
  #query = this.signal("");
  #active = this.signal(0);
  #maxH = this.signal(240); // list height capped to available viewport space
  #flip = this.signal(false); // open upward when there's more room above

  onMount(): void {
    document.addEventListener(
      "click",
      (e) => {
        if (this.#open() && !e.composedPath().includes(this)) this.#close();
      },
      { signal: this.abortSignal },
    );
  }

  #close(): void {
    this.#open.set(false);
    this.#query.set("");
  }
  #toggle(): void {
    if (this.disabled) return;
    const next = !this.#open();
    if (next) {
      this.#query.set("");
      this.#active.set(0);
      // Size the list to the available space (and flip up if there's more room
      // above) so the popup never runs off-screen — items stay reachable.
      const r = this.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 16;
      const above = r.top - 16;
      const flip = below < 220 && above > below;
      this.#flip.set(flip);
      this.#maxH.set(Math.max(120, Math.min(288, (flip ? above : below) - 52)));
      requestAnimationFrame(() => this.shadowRoot!.querySelector("input")?.focus());
    }
    this.#open.set(next);
  }
  #filtered(): ComboOption[] {
    const q = this.#query().toLowerCase();
    return this.options.filter((o) => o.label.toLowerCase().includes(q));
  }
  #isSelected(v: string): boolean {
    return this.multiple ? this.values.includes(v) : this.value === v;
  }
  #select(o: ComboOption): void {
    if (this.multiple) {
      const set = new Set(this.values);
      set.has(o.value) ? set.delete(o.value) : set.add(o.value);
      this.values = [...set];
      this.emit("change", this.values);
    } else {
      this.value = o.value;
      this.emit("change", this.value);
      this.#close();
    }
  }
  #clear(e: Event): void {
    e.stopPropagation();
    if (this.multiple) this.values = [];
    else this.value = "";
    this.emit("change", this.multiple ? [] : "");
  }
  #onKey(e: KeyboardEvent): void {
    const f = this.#filtered();
    if (e.key === "ArrowDown") (e.preventDefault(), this.#active.set(Math.min(this.#active() + 1, f.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), this.#active.set(Math.max(this.#active() - 1, 0)));
    else if (e.key === "Enter") {
      e.preventDefault();
      const o = f[this.#active()];
      if (o) this.#select(o);
    } else if (e.key === "Escape") this.#close();
  }

  #row(o: ComboOption, i: number) {
    return html`<div
      role="option"
      aria-selected=${String(this.#isSelected(o.value))}
      class=${cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
        i === this.#active() && "bg-accent text-accent-foreground",
      )}
      @click=${() => this.#select(o)}
      @pointerenter=${() => this.#active.set(i)}
    >
      <svg
        class=${"h-4 w-4 " + (this.#isSelected(o.value) ? "opacity-100" : "opacity-0")}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span class="flex-1">${o.label}</span>
    </div>`;
  }

  override render() {
    const open = this.#open();
    const filtered = this.#filtered();
    const grouped = this.options.some((o) => o.group);
    const hasValue = this.multiple ? this.values.length > 0 : !!this.value;
    const selectedLabel = this.options.find((o) => o.value === this.value)?.label;

    return html`
      <button
        type="button"
        aria-expanded=${String(open)}
        class=${cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          this.invalid ? "border-destructive focus-visible:ring-destructive" : "border-border",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        .disabled=${this.disabled}
        @click=${() => this.#toggle()}
      >
        <span class="flex flex-1 flex-wrap items-center gap-1 overflow-hidden text-left">
          ${this.multiple
            ? this.values.length
              ? map(
                  this.values,
                  (v) => html`<span class="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground">
                    ${this.options.find((o) => o.value === v)?.label ?? v}
                    <span
                      class="cursor-pointer text-muted-foreground hover:text-foreground"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        this.values = this.values.filter((x) => x !== v);
                        this.emit("change", this.values);
                      }}
                      >✕</span
                    >
                  </span>`,
                )
              : html`<span class="text-muted-foreground">${this.placeholder}</span>`
            : selectedLabel
              ? html`<span class="truncate">${selectedLabel}</span>`
              : html`<span class="text-muted-foreground">${this.placeholder}</span>`}
        </span>
        <span class="flex shrink-0 items-center gap-1">
          ${when(
            this.clearable && hasValue,
            () => html`<span class="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Clear" @click=${(e: Event) => this.#clear(e)}>✕</span>`,
          )}
          <svg class="h-4 w-4 shrink-0 text-muted-foreground opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      ${when(
        open,
        () => html`<div class=${cn(
          "absolute left-0 z-50 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md",
          this.#flip() ? "bottom-full mb-1" : "top-full mt-1",
        )}>
          <div class="flex items-center gap-2 border-b border-border px-3">
            <svg class="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              class="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search…"
              .value=${this.#query()}
              @input=${(e: Event) => (this.#query.set((e.target as HTMLInputElement).value), this.#active.set(0))}
              @keydown=${(e: KeyboardEvent) => this.#onKey(e)}
            />
          </div>
          <div class="overflow-auto p-1" style=${"max-height:" + this.#maxH() + "px"}>
            ${filtered.length === 0
              ? html`<div class="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</div>`
              : grouped
                ? this.#groups(filtered)
                : map(filtered, (o, i) => this.#row(o, i))}
          </div>
        </div>`,
      )}
    `;
  }

  #groups(filtered: ComboOption[]) {
    const names = [...new Set(filtered.map((o) => o.group ?? ""))];
    return map(
      names,
      (g) => html`
        ${when(g, () => html`<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">${g}</div>`)}
        ${map(
          filtered.filter((o) => (o.group ?? "") === g),
          (o) => this.#row(o, filtered.indexOf(o)),
        )}
      `,
    );
  }
}
