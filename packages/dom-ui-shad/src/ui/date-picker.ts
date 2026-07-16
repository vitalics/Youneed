// shad <shad-date-picker> — a trigger that opens a popover with <shad-calendar>.
//   <shad-date-picker placeholder="Pick a date"></shad-date-picker>          single
//   <shad-date-picker mode="range"></shad-date-picker>                        range
//   <shad-date-picker dropdown placeholder="Date of birth"></shad-date-picker> month/year selects
//   <shad-date-picker variant="input" natural></shad-date-picker>            free-text + parsing
// Emits `change` — an ISO string (single) or { start, end } (range).
//
// The popover is position:fixed (anchored to the trigger via getBoundingClientRect)
// so it escapes any overflow-hidden ancestor without a portal — same approach as
// the data-table row menu. Closes on outside click, Escape, scroll, and (single
// mode) on selection.

import { Component, html, css, when, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";
import "./calendar.ts";

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const CAL_ICON = html`<svg class="h-4 w-4 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>`;
const CHEVRON = html`<svg class="h-4 w-4 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;

@Component.define()
export class ShadDatePicker extends Component("shad-date-picker") implements OnMount {
  static styles = [tw, css`:host { display: inline-block; }`];

  @Component.prop({ attribute: true }) mode: "single" | "range" = "single";
  @Component.prop({ attribute: true }) value = ""; // single ISO
  @Component.prop({ attribute: true }) start = ""; // range start ISO
  @Component.prop({ attribute: true }) end = ""; // range end ISO
  @Component.prop({ attribute: true }) placeholder = "Pick a date";
  @Component.prop({ attribute: true }) dropdown = false; // month/year selects (DOB)
  @Component.prop({ attribute: true }) variant: "button" | "input" = "button";
  @Component.prop({ attribute: true }) natural = false; // input variant: parse free text

  #open = this.signal(false);
  #x = this.signal(0);
  #y = this.signal(0);
  #text = this.signal(""); // input-variant raw text
  #hint = this.signal(""); // natural-language resolved label

  onMount(): void {
    document.addEventListener("click", (e) => { if (this.#open() && !e.composedPath().includes(this)) this.#close(); }, { signal: this.abortSignal });
    document.addEventListener("keydown", (e) => { if (this.#open() && (e as KeyboardEvent).key === "Escape") this.#close(); }, { signal: this.abortSignal });
    addEventListener("scroll", () => this.#open() && this.#close(), { capture: true, passive: true, signal: this.abortSignal });
  }

  // ---- date formatting --------------------------------------------------

  #fmt(isoStr: string): string {
    if (!isoStr) return "";
    const [y, m, d] = isoStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  #label(): string {
    if (this.mode === "range") {
      if (this.start && this.end) return `${this.#fmt(this.start)} - ${this.#fmt(this.end)}`;
      if (this.start) return this.#fmt(this.start);
      return "";
    }
    return this.#fmt(this.value);
  }

  // ---- open / close / select -------------------------------------------

  #toggle(e: Event): void {
    e.stopPropagation();
    if (this.#open()) return this.#close();
    const trigger = this.shadowRoot!.querySelector("[data-anchor]") as HTMLElement;
    const r = trigger.getBoundingClientRect();
    this.#x.set(r.left);
    this.#y.set(r.bottom + 4);
    this.#open.set(true);
    requestAnimationFrame(() => {
      const pop = this.shadowRoot!.querySelector("[data-pop]") as HTMLElement | null;
      if (!pop) return;
      const pr = pop.getBoundingClientRect();
      if (pr.right > innerWidth - 8) this.#x.set(Math.max(8, innerWidth - pr.width - 8));
      if (pr.bottom > innerHeight - 8) this.#y.set(Math.max(8, r.top - pr.height - 4));
    });
  }
  #close(): void {
    this.#open.set(false);
  }

  #onCalChange(e: Event): void {
    const detail = (e as CustomEvent).detail;
    if (this.mode === "range") {
      this.start = detail.start ?? "";
      this.end = detail.end ?? "";
      this.emit("change", { start: this.start, end: this.end });
      if (this.start && this.end) this.#close();
    } else {
      this.value = detail as string;
      this.#text.set(this.#fmt(this.value));
      this.emit("change", this.value);
      this.#close();
    }
  }

  // ---- natural language -------------------------------------------------

  #parseNatural(text: string): string {
    const t = text.trim().toLowerCase();
    if (!t) return "";
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const shift = (n: number) => { const d = new Date(base); d.setDate(d.getDate() + n); return toIso(d); };
    if (t === "today") return toIso(base);
    if (t === "tomorrow") return shift(1);
    if (t === "yesterday") return shift(-1);
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^in (\d+) days?$/))) return shift(+m[1]);
    if ((m = t.match(/^(\d+) days? ago$/))) return shift(-+m[1]);
    if ((m = t.match(/^(next|last|this)?\s*(sun|mon|tue|wed|thu|fri|sat)/))) {
      const target = WD.findIndex((w) => w.startsWith(m![2]));
      const cur = base.getDay();
      let diff = (target - cur + 7) % 7;
      if (m[1] === "next") diff = diff === 0 ? 7 : diff;
      else if (m[1] === "last") diff = diff === 0 ? -7 : diff - 7;
      else if (diff === 0) diff = 0; // "this/<weekday>" → today if it matches
      return shift(diff);
    }
    const p = Date.parse(text);
    if (!isNaN(p)) return toIso(new Date(p));
    return "";
  }
  #onInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    this.#text.set(raw);
    if (!this.natural) return;
    const isoStr = this.#parseNatural(raw);
    if (isoStr) {
      this.value = isoStr;
      this.#hint.set(this.#fmt(isoStr));
      this.emit("change", isoStr);
    } else {
      this.#hint.set("");
    }
  }

  // ---- render -----------------------------------------------------------

  override render() {
    const label = this.#label();
    const empty = !label;
    return html`
      <div class="relative inline-block">
        ${this.variant === "input" ? this.#inputTrigger() : this.#buttonTrigger(label, empty)}
        ${when(this.#open(), () => this.#popover())}
      </div>
    `;
  }

  #buttonTrigger(label: string, empty: boolean) {
    return html`<button
      type="button"
      data-anchor
      aria-haspopup="dialog"
      aria-expanded=${String(this.#open())}
      class=${"inline-flex h-10 w-[260px] cursor-pointer select-none items-center justify-start gap-2 rounded-md border border-border bg-background px-3 text-left text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-accent " +
      (empty ? "text-muted-foreground" : "")}
      @click=${(e: Event) => this.#toggle(e)}
    >
      ${CAL_ICON}
      <span class="flex-1 truncate">${empty ? this.placeholder : label}</span>
    </button>`;
  }

  #inputTrigger() {
    return html`<div class="w-[260px]">
      <div class="relative">
        <input
          data-anchor
          class="h-10 w-full rounded-md border border-border bg-background px-3 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder=${this.natural ? "Tomorrow, next monday, in 3 days…" : this.placeholder}
          .value=${this.#text()}
          @input=${(e: Event) => this.#onInput(e)}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "ArrowDown") (e.preventDefault(), this.#open() || this.#toggle(e)); }}
        />
        <button
          type="button"
          aria-label="Open calendar"
          class="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
          @click=${(e: Event) => this.#toggle(e)}
        >
          ${this.natural ? CHEVRON : CAL_ICON}
        </button>
      </div>
      ${when(this.natural && this.#hint(), () => html`<div class="mt-1 px-1 text-xs text-muted-foreground">${this.#hint()}</div>`)}
    </div>`;
  }

  #popover() {
    return html`<div
      data-pop
      role="dialog"
      class="z-50 rounded-md shadow-md"
      style=${`position:fixed;left:${this.#x()}px;top:${this.#y()}px`}
    >
      <shad-calendar
        mode=${this.mode}
        value=${this.value}
        start=${this.start}
        end=${this.end}
        dropdown=${this.dropdown}
        @change=${(e: Event) => this.#onCalChange(e)}
      ></shad-calendar>
    </div>`;
  }
}
