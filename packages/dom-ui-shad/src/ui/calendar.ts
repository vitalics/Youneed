// shad <shad-calendar> — a month date picker.
//   single: <shad-calendar value="2026-06-19"></shad-calendar>  → emits `change` (ISO)
//   range:  <shad-calendar mode="range">                        → emits `change` ({start,end})
// Props: mode, value, start, end, booked (ISO[]), weeknumbers, dropdown, cellsize.

import { Component, html, css, classMap, map, when } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** ISO 8601 week number for a Y-M-D. */
function isoWeek(y: number, m: number, d: number): number {
  const date = new Date(Date.UTC(y, m, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
}

@Component.define()
export class ShadCalendar extends Component("shad-calendar") {
  static styles = [
    tw,
    css`
      :host { display: inline-block; --cell: 2rem; }
      /* RTL: flip the prev/next chevrons (the grid mirrors on its own). */
      :host-context([dir="rtl"]) .chev { transform: scaleX(-1); }
      select { appearance: none; }
    `,
  ];

  #today = new Date();

  @Component.prop({ attribute: true }) mode: "single" | "range" = "single";
  @Component.prop({ attribute: true }) value = ""; // single selected ISO
  @Component.prop({ attribute: true }) start = ""; // range start ISO
  @Component.prop({ attribute: true }) end = ""; // range end ISO
  @Component.prop() booked: string[] = []; // disabled ISO dates
  @Component.prop({ attribute: true }) weeknumbers = false;
  @Component.prop({ attribute: true }) dropdown = false; // month/year as <select>
  @Component.prop({ attribute: true }) cellsize = 0; // px override for --cell
  @Component.prop() year = this.#today.getFullYear();
  @Component.prop() month = this.#today.getMonth(); // 0–11

  #prev(): void {
    if (this.month === 0) (this.month = 11), this.year--;
    else this.month--;
  }
  #next(): void {
    if (this.month === 11) (this.month = 0), this.year++;
    else this.month++;
  }

  #select(day: number): void {
    const d = iso(this.year, this.month, day);
    if (this.booked.includes(d)) return;
    if (this.mode === "range") {
      if (!this.start || this.end) {
        this.start = d;
        this.end = "";
      } else if (d < this.start) {
        this.end = this.start;
        this.start = d;
      } else {
        this.end = d;
      }
      this.emit("change", { start: this.start, end: this.end });
    } else {
      this.value = d;
      this.emit("change", this.value);
    }
  }

  override render() {
    const startDow = new Date(this.year, this.month, 1).getDay();
    const days = new Date(this.year, this.month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const todayIso = iso(this.#today.getFullYear(), this.#today.getMonth(), this.#today.getDate());
    const cols = `${this.weeknumbers ? "var(--cell) " : ""}repeat(7, var(--cell))`;
    const hostStyle = this.cellsize ? `--cell:${this.cellsize}px` : "";

    const cell = (c: number | null) => {
      if (c === null) return html`<div></div>`;
      const d = iso(this.year, this.month, c);
      const isStart = d === this.start;
      const isEnd = d === this.end;
      const inRange = this.start && this.end && d > this.start && d < this.end;
      const selected = this.mode === "range" ? isStart || isEnd : d === this.value;
      const isBooked = this.booked.includes(d);
      return html`<button
        class=${classMap({
          "inline-flex items-center justify-center rounded-md text-sm transition-colors": true,
          "hover:bg-accent": !isBooked && !selected,
          "bg-primary text-primary-foreground hover:bg-primary": selected,
          "rounded-none bg-accent text-accent-foreground": !!inRange,
          "text-muted-foreground line-through": isBooked,
          "ring-1 ring-ring": d === todayIso && !selected,
        })}
        style="width:var(--cell);height:var(--cell)"
        aria-current=${d === todayIso ? "date" : null}
        disabled=${isBooked}
        @click=${() => this.#select(c)}
      >
        ${c}
      </button>`;
    };

    return html`
      <div class=${cn("w-fit rounded-md border border-border bg-background p-3 text-sm")} style=${hostStyle}>
        <div class="flex items-center justify-between pb-2">
          <button class="chev rounded-md p-1 hover:bg-accent" aria-label="Previous month" @click=${() => this.#prev()}>‹</button>
          ${when(
            this.dropdown,
            () => html`<div class="flex items-center gap-1 font-medium">
              <select class="rounded-md px-1 py-0.5 hover:bg-accent" @change=${(e: Event) => (this.month = +(e.target as HTMLSelectElement).value)}>
                ${map(MONTHS, (mname, i) => html`<option value=${i} selected=${i === this.month}>${mname}</option>`)}
              </select>
              <select class="rounded-md px-1 py-0.5 hover:bg-accent" @change=${(e: Event) => (this.year = +(e.target as HTMLSelectElement).value)}>
                ${map(
                  Array.from({ length: 21 }, (_, i) => this.#today.getFullYear() - 10 + i),
                  (y) => html`<option value=${y} selected=${y === this.year}>${y}</option>`,
                )}
              </select>
            </div>`,
            () => html`<div class="font-medium">${MONTHS[this.month]} ${this.year}</div>`,
          )}
          <button class="chev rounded-md p-1 hover:bg-accent" aria-label="Next month" @click=${() => this.#next()}>›</button>
        </div>
        <div class="grid gap-1 text-center" style=${"grid-template-columns:" + cols}>
          ${when(this.weeknumbers, () => html`<div></div>`)}
          ${map(DOW, (d) => html`<div class="py-1 text-xs text-muted-foreground">${d}</div>`)}
          ${map(
            weeks,
            (week, r) => html`
              ${when(this.weeknumbers, () => {
                // ISO weeks start Monday; our rows start Sunday. Use the row's
                // Thursday (always inside the ISO week) so the number is right.
                const thu = new Date(this.year, this.month, 1 - startDow + r * 7 + 4);
                return html`<div class="flex items-center justify-center text-xs text-muted-foreground">${isoWeek(thu.getFullYear(), thu.getMonth(), thu.getDate())}</div>`;
              })}
              ${map(week, cell)}
            `,
          )}
        </div>
      </div>
    `;
  }
}
