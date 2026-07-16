// shad <shad-carousel> — a slide carousel (scroll-snap based, no deps). Slides
// are slotted; prev/next buttons scroll by one. Emits `scroll` (detail: -1|1).
//   <shad-carousel style="--slide-basis: 50%">      ← show ~2 slides (Sizes)
//   <shad-carousel style="--slide-gap: 1.5rem">     ← Spacing
//   <shad-carousel orientation="vertical">          ← Orientation

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

/** A carousel plugin: `init` runs once on mount with the carousel element and
 *  wires behavior via its public API (next/prev/scrollToStart/canScroll*).
 *  Tie listeners/timers to `carousel.abortSignal` so they clean up on unmount. */
export interface CarouselPlugin {
  init(carousel: ShadCarousel): void;
}

/** Autoplay plugin — advances every `delay` ms, loops at the end, and pauses on
 *  hover/focus. Usage: `carousel.plugins = [autoplay({ delay: 2000 })]`. */
export function autoplay(opts: { delay?: number } = {}): CarouselPlugin {
  const delay = opts.delay ?? 3000;
  return {
    init(carousel) {
      let timer: ReturnType<typeof setInterval> | undefined;
      const stop = () => timer !== undefined && (clearInterval(timer), (timer = undefined));
      const start = () => {
        stop();
        timer = setInterval(() => {
          if (carousel.canScrollNext()) carousel.next();
          else carousel.scrollToStart();
        }, delay);
      };
      const sig = carousel.abortSignal;
      carousel.addEventListener("mouseenter", stop, { signal: sig });
      carousel.addEventListener("mouseleave", start, { signal: sig });
      carousel.addEventListener("focusin", stop, { signal: sig });
      carousel.addEventListener("focusout", start, { signal: sig });
      sig.addEventListener("abort", stop);
      start();
    },
  };
}

@Component.define()
export class ShadCarousel extends Component("shad-carousel") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: block; --slide-basis: 100%; --slide-gap: 1rem; --carousel-height: 14rem; }
      .viewport { overflow: hidden; }
      .track { display: flex; gap: var(--slide-gap); scroll-snap-type: x mandatory; }
      slot { display: contents; }
      ::slotted(*) { flex: 0 0 var(--slide-basis); min-width: 0; scroll-snap-align: start; }
      :host([orientation="vertical"]) .viewport { height: var(--carousel-height); }
      :host([orientation="vertical"]) .track { flex-direction: column; scroll-snap-type: y mandatory; }
      :host-context([dir="rtl"]) .chev { transform: scaleX(-1); }
    `,
  ];

  @Component.prop({ attribute: true }) orientation: "horizontal" | "vertical" = "horizontal";
  @Component.prop() plugins: CarouselPlugin[] = [];
  canPrev = this.signal(false);
  canNext = this.signal(true);

  // ── Public API (used by buttons and plugins) ──
  next(): void {
    this.#scroll(1);
  }
  prev(): void {
    this.#scroll(-1);
  }
  canScrollNext(): boolean {
    return this.canNext();
  }
  canScrollPrev(): boolean {
    return this.canPrev();
  }
  scrollToStart(): void {
    const vp = this.#vp();
    if (this.orientation === "vertical") vp.scrollTo({ top: 0, behavior: "smooth" });
    else vp.scrollTo({ left: 0, behavior: "smooth" });
  }

  #vp(): HTMLElement {
    return this.shadowRoot!.querySelector(".viewport") as HTMLElement;
  }

  #update = (): void => {
    const vp = this.#vp();
    const horiz = this.orientation !== "vertical";
    const pos = Math.abs(horiz ? vp.scrollLeft : vp.scrollTop); // abs: RTL scrollLeft is negative
    const max = horiz ? vp.scrollWidth - vp.clientWidth : vp.scrollHeight - vp.clientHeight;
    this.canPrev.set(pos > 1);
    this.canNext.set(pos < max - 1);
  };

  #scroll(dir: 1 | -1): void {
    const vp = this.#vp();
    const horiz = this.orientation !== "vertical";
    const slide = this.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(this.shadowRoot!.querySelector(".track")!).columnGap) || 0;
    if (horiz) {
      // RTL scrolls towards negative scrollLeft, so invert the direction.
      const rtl = getComputedStyle(this).direction === "rtl";
      vp.scrollBy({ left: dir * (rtl ? -1 : 1) * ((slide?.offsetWidth ?? vp.clientWidth) + gap), behavior: "smooth" });
    } else {
      vp.scrollBy({ top: dir * ((slide?.offsetHeight ?? vp.clientHeight) + gap), behavior: "smooth" });
    }
    this.emit("scroll", dir);
  }

  onMount(): void {
    const vp = this.#vp();
    vp.addEventListener("scroll", this.#update, { passive: true, signal: this.abortSignal });
    requestAnimationFrame(this.#update); // after slides lay out
    for (const plugin of this.plugins) plugin.init(this);
  }

  override render() {
    const vertical = this.orientation === "vertical";
    // Buttons sit fully OUTSIDE the viewport (above/below or left/right) so they
    // never cover slide content — shadcn-style.
    // Horizontal uses logical insets (start/end + margin) so prev/next swap
    // sides automatically in RTL.
    const prevPos = vertical ? "left-1/2 bottom-full mb-2 -translate-x-1/2" : "top-1/2 end-full me-2 -translate-y-1/2";
    const nextPos = vertical ? "left-1/2 top-full mt-2 -translate-x-1/2" : "top-1/2 start-full ms-2 -translate-y-1/2";
    const btn =
      "absolute z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-opacity hover:bg-accent disabled:pointer-events-none disabled:opacity-40";
    return html`
      <div class="relative">
        <div class="viewport"><div class="track"><slot></slot></div></div>
        <button
          class=${btn + " " + prevPos}
          aria-label="Previous slide"
          disabled=${!this.canPrev()}
          @click=${() => this.#scroll(-1)}
        >
          <svg class="chev h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d=${vertical ? "m18 15-6-6-6 6" : "m15 18-6-6 6-6"} />
          </svg>
        </button>
        <button
          class=${btn + " " + nextPos}
          aria-label="Next slide"
          disabled=${!this.canNext()}
          @click=${() => this.#scroll(1)}
        >
          <svg class="chev h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d=${vertical ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6"} />
          </svg>
        </button>
      </div>
    `;
  }
}
