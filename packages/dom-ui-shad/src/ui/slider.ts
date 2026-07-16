// shad <shad-slider> — a range slider with one or more thumbs.
//   <shad-slider .value=${[75]} max="100" step="1"></shad-slider>   single
//   <shad-slider .value=${[25, 75]}></shad-slider>                  range (two thumbs)
//   <shad-slider orientation="vertical" .value=${[40]}></shad-slider>
// `value` is an array of numbers; emits `change` (the new array) on drag / arrow keys.

import { Component, html, css, map, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadSlider extends Component("shad-slider") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: block; }
      :host([orientation="vertical"]) { height: 100%; min-height: 10rem; width: auto; }
      [data-disabled] { opacity: 0.5; pointer-events: none; }
    `,
  ];

  @Component.prop() value: number[] = [50];
  @Component.prop({ attribute: true }) min = 0;
  @Component.prop({ attribute: true }) max = 100;
  @Component.prop({ attribute: true }) step = 1;
  @Component.prop({ attribute: true }) orientation: "horizontal" | "vertical" = "horizontal";
  @Component.prop({ attribute: true }) disabled = false;

  onMount(): void {
    this.addEventListener("keydown", (e) => this.#onKey(e as KeyboardEvent), { signal: this.abortSignal });
  }

  #vertical(): boolean {
    return this.orientation === "vertical";
  }
  #rtl(): boolean {
    return !this.#vertical() && getComputedStyle(this).direction === "rtl";
  }
  #pct(v: number): number {
    return ((v - this.min) / (this.max - this.min)) * 100;
  }
  #setThumb(i: number, raw: number): void {
    let v = Math.round((raw - this.min) / this.step) * this.step + this.min;
    v = Math.max(this.min, Math.min(this.max, v));
    // keep thumbs from crossing their neighbours
    const lo = i > 0 ? this.value[i - 1] : this.min;
    const hi = i < this.value.length - 1 ? this.value[i + 1] : this.max;
    v = Math.max(lo, Math.min(hi, v));
    if (v === this.value[i]) return;
    const next = [...this.value];
    next[i] = v;
    this.value = next;
    this.emit("change", next);
  }

  #fromPointer(e: PointerEvent): number {
    const track = this.shadowRoot!.querySelector("[data-track]")!.getBoundingClientRect();
    let frac = this.#vertical()
      ? 1 - (e.clientY - track.top) / track.height
      : (e.clientX - track.left) / track.width;
    if (this.#rtl()) frac = 1 - frac;
    frac = Math.max(0, Math.min(1, frac));
    return this.min + frac * (this.max - this.min);
  }
  #startDrag(i: number, e: PointerEvent): void {
    if (this.disabled) return;
    e.preventDefault();
    const move = (ev: PointerEvent) => this.#setThumb(i, this.#fromPointer(ev));
    const up = () => document.removeEventListener("pointermove", move);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  }
  #onTrack(e: PointerEvent): void {
    if (this.disabled) return;
    const v = this.#fromPointer(e);
    // move the nearest thumb, then keep dragging it
    let nearest = 0, best = Infinity;
    this.value.forEach((tv, i) => { const d = Math.abs(tv - v); if (d < best) (best = d, nearest = i); });
    this.#setThumb(nearest, v);
    this.#startDrag(nearest, e);
  }
  #onKey(e: KeyboardEvent): void {
    if (this.disabled) return;
    const thumb = e.composedPath().find((n) => (n as HTMLElement)?.dataset?.thumb != null) as HTMLElement | undefined;
    if (!thumb) return;
    const i = Number(thumb.dataset.thumb);
    const dec = this.#vertical() ? "ArrowDown" : this.#rtl() ? "ArrowRight" : "ArrowLeft";
    const inc = this.#vertical() ? "ArrowUp" : this.#rtl() ? "ArrowLeft" : "ArrowRight";
    if (e.key !== inc && e.key !== dec) return;
    e.preventDefault();
    this.#setThumb(i, this.value[i] + (e.key === inc ? this.step : -this.step));
    // The thumb node is re-created on re-render, so restore focus for repeat keys.
    requestAnimationFrame(() => (this.shadowRoot!.querySelectorAll("[data-thumb]")[i] as HTMLElement)?.focus());
  }

  override render() {
    const vertical = this.#vertical();
    const rtl = this.#rtl();
    const pcts = this.value.map((v) => this.#pct(v));
    const rangeStart = this.value.length === 1 ? 0 : Math.min(...pcts);
    const rangeEnd = Math.max(...pcts);
    // start/end inset of the range fill along the main axis
    const startEdge = vertical ? "bottom" : rtl ? "right" : "left";
    const endEdge = vertical ? "top" : rtl ? "left" : "right";
    const rangeStyle = `${startEdge}:${rangeStart}%;${endEdge}:${100 - rangeEnd}%`;

    return html`<span
      data-orientation=${this.orientation}
      data-disabled=${this.disabled ? "" : null}
      class=${"relative flex touch-none select-none items-center " + (vertical ? "h-full min-h-40 flex-col" : "w-full")}
    >
      <span
        data-track
        class=${"relative grow overflow-hidden rounded-full bg-muted " + (vertical ? "h-full w-1.5" : "h-1.5 w-full")}
        @pointerdown=${(e: PointerEvent) => this.#onTrack(e)}
      >
        <span class=${"absolute bg-primary " + (vertical ? "w-full" : "h-full")} style=${rangeStyle}></span>
      </span>
      ${map(this.value, (_, i) => {
        const pos = `${pcts[i]}%`;
        const style = vertical ? `bottom:${pos};transform:translateY(50%)` : `${rtl ? "right" : "left"}:${pos};transform:translateX(${rtl ? "50%" : "-50%"})`;
        return html`<span
          role="slider"
          data-thumb=${String(i)}
          tabindex=${this.disabled ? "-1" : "0"}
          aria-valuemin=${String(this.min)}
          aria-valuemax=${String(this.max)}
          aria-valuenow=${String(this.value[i])}
          aria-orientation=${this.orientation}
          class="absolute block size-4 shrink-0 cursor-grab rounded-full border border-primary bg-background outline-none transition-colors hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/40 active:cursor-grabbing"
          style=${style}
          @pointerdown=${(e: PointerEvent) => this.#startDrag(i, e)}
        ></span>`;
      })}
    </span>`;
  }
}
