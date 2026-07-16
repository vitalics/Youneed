// shad <shad-chart> — a dependency-free SVG chart (bar / line / area). Configured
// like shadcn's ChartConfig but rendered natively (no Recharts/React):
//   chart.type = "bar";
//   chart.xkey = "month";
//   chart.data = [{ month: "Jan", desktop: 186, mobile: 80 }, …];
//   chart.config = {
//     desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },
//     mobile:  { label: "Mobile",  color: "hsl(var(--chart-2))" },
//   };
//
// The SVG is built as a string and written via innerHTML — @youneed/dom doesn't
// namespace interpolated SVG children, so templating <rect>/<line> directly
// would create non-rendering HTML elements.

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

export interface ChartSeriesConfig {
  label: string;
  color: string;
}
export type ChartConfig = Record<string, ChartSeriesConfig>;

const H = 240;
const PAD_T = 8;
const PAD_B = 24;
const PAD_X = 8;

const esc = (v: unknown): string =>
  String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

@Component.define()
export class ShadChart extends Component("shad-chart") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: block; }
      svg { display: block; width: 100%; }
      .grid { stroke: hsl(var(--border)); stroke-dasharray: 3 3; }
      .xlabel { fill: hsl(var(--muted-foreground)); font-size: 11px; }
      .guide { stroke: hsl(var(--border)); }
    `,
  ];

  @Component.prop({ attribute: true }) type: "bar" | "line" | "area" = "bar";
  @Component.prop({ attribute: true }) xkey = "";
  @Component.prop({ attribute: true }) legend = true; // render the legend (legend="false" to hide)
  @Component.prop({ attribute: true }) interactive = false; // click legend to toggle series
  @Component.prop({ attribute: true }) totals = false; // show per-series sums in the legend
  @Component.prop() data: Record<string, string | number>[] = [];
  @Component.prop() config: ChartConfig = {};

  #w = this.signal(0);
  #hover = this.signal(-1);
  #hidden = this.signal(new Set<string>()); // series toggled off via the legend

  onMount(): void {
    const root = this.shadowRoot!.querySelector(".chart") as HTMLElement;
    const ro = new ResizeObserver(([e]) => this.#w.set(Math.round(e.contentRect.width)));
    ro.observe(root);
    this.abortSignal.addEventListener("abort", () => ro.disconnect());

    root.addEventListener(
      "pointermove",
      (e) => {
        const n = this.data.length;
        const band = n ? (this.#w() - PAD_X * 2) / n : 0;
        const svg = root.querySelector("svg");
        if (!band || !svg) return;
        const rect = svg.getBoundingClientRect();
        this.#hover.set(Math.min(n - 1, Math.max(0, Math.floor(((e as PointerEvent).clientX - rect.left - PAD_X) / band))));
      },
      { signal: this.abortSignal },
    );
    root.addEventListener("pointerleave", () => this.#hover.set(-1), { signal: this.abortSignal });

    // Click a legend item to toggle that series on/off.
    root.addEventListener(
      "click",
      (e) => {
        if (!this.interactive) return;
        const item = (e.target as Element).closest("[data-series]");
        if (!item) return;
        const key = item.getAttribute("data-series")!;
        const next = new Set(this.#hidden());
        next.has(key) ? next.delete(key) : next.add(key);
        this.#hidden.set(next);
      },
      { signal: this.abortSignal },
    );

    // Rebuild the chart markup whenever width / hover (or data) change. The
    // #hover signal coalesces same-index writes, so this only re-runs per band.
    this.effect(() => {
      root.innerHTML = this.#markup();
    });
  }

  override render() {
    return html`<div class="chart"></div>`;
  }

  #markup(): string {
    const W = this.#w();
    if (W <= 0) return "";
    const series = Object.keys(this.config);
    const hidden = this.#hidden();
    const visible = series.filter((s) => !hidden.has(s));
    const n = this.data.length;
    const plotW = Math.max(0, W - PAD_X * 2);
    const plotH = H - PAD_T - PAD_B;
    const max = Math.max(1, ...this.data.flatMap((d) => visible.map((s) => Number(d[s]) || 0)));
    const band = n ? plotW / n : 0;
    const yOf = (v: number) => PAD_T + plotH * (1 - v / max);
    const xc = (i: number) => PAD_X + band * i + band / 2;
    const baseline = PAD_T + plotH;
    const hover = this.#hover();

    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((t) => {
        const y = PAD_T + plotH * t;
        return `<line class="grid" x1="${PAD_X}" x2="${W - PAD_X}" y1="${y}" y2="${y}"/>`;
      })
      .join("");

    let marks = "";
    if (this.type === "bar") {
      const groupW = band * 0.7;
      const barW = visible.length ? groupW / visible.length : 0;
      marks = this.data
        .map((d, i) =>
          visible
            .map((s, j) => {
              const y = yOf(Number(d[s]) || 0);
              const x = xc(i) - groupW / 2 + j * barW;
              return `<rect x="${x + 1}" y="${y}" width="${Math.max(0, barW - 2)}" height="${baseline - y}" rx="3" fill="${this.config[s].color}"/>`;
            })
            .join(""),
        )
        .join("");
    } else {
      marks = visible
        .map((s) => {
          const line = "M" + this.data.map((d, i) => `${xc(i)},${yOf(Number(d[s]) || 0)}`).join(" L");
          const area =
            this.type === "area"
              ? `<path d="${line} L${xc(n - 1)},${baseline} L${xc(0)},${baseline} Z" fill="${this.config[s].color}" fill-opacity="0.15"/>`
              : "";
          return `${area}<path d="${line}" fill="none" stroke="${this.config[s].color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        })
        .join("");
    }

    const guide = hover >= 0 ? `<line class="guide" x1="${xc(hover)}" x2="${xc(hover)}" y1="${PAD_T}" y2="${baseline}"/>` : "";
    const labels = this.data
      .map((d, i) => `<text class="xlabel" x="${xc(i)}" y="${H - 7}" text-anchor="middle">${esc(d[this.xkey])}</text>`)
      .join("");

    const svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}">${grid}${guide}${marks}${labels}</svg>`;
    const tooltip = hover >= 0 && this.data[hover] && visible.length ? this.#tooltip(visible, hover, xc(hover)) : "";
    const legend = this.legend ? this.#legend(series, hidden) : "";

    return `<div class="plot relative" style="height:${H}px">${svg}${tooltip}</div>${legend}`;
  }

  #legend(series: string[], hidden: Set<string>): string {
    const items = series
      .map((s) => {
        const off = hidden.has(s);
        const total = this.totals
          ? ` <span class="font-mono font-semibold text-foreground">${this.data.reduce((a, d) => a + (Number(d[s]) || 0), 0)}</span>`
          : "";
        const inner = `<span class="h-2.5 w-2.5 rounded-[2px]" style="background:${this.config[s].color}"></span><span class="text-muted-foreground">${esc(this.config[s].label)}</span>${total}`;
        // Interactive → a button that toggles the series; otherwise a static label.
        return this.interactive
          ? `<button type="button" data-series="${esc(s)}" class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent${off ? " opacity-40" : ""}">${inner}</button>`
          : `<span class="inline-flex items-center gap-1.5 px-2 py-1 text-xs">${inner}</span>`;
      })
      .join("");
    return `<div class="mt-3 flex flex-wrap items-center justify-center gap-1">${items}</div>`;
  }

  #tooltip(series: string[], i: number, x: number): string {
    const row = this.data[i];
    const rows = series
      .map(
        (s) =>
          `<div class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-[2px]" style="background:${this.config[s].color}"></span><span class="text-muted-foreground">${esc(this.config[s].label)}</span><span class="ml-auto font-mono font-medium">${esc(row[s])}</span></div>`,
      )
      .join("");
    return `<div class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md" style="left:${x}px;top:8px"><div class="mb-1 font-medium">${esc(row[this.xkey])}</div>${rows}</div>`;
  }
}
