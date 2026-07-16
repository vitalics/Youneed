// @youneed/cli-middleware-oscillator — a synthetic spectrum source and a
// cava-style bar renderer for terminal audio visualisers.
//
//   class Vis extends Command("vis", { middleware: [oscillator({ bands: 32 })] }) {
//     render() { return text`${spectrumBars(this.oscillator.sample(this.t))}`; }
//   }
//
// `this.oscillator.sample(time)` returns per-band magnitudes (0..1) for a given
// time in seconds. It's a *synthetic* signal (a sum of sines, bass-biased), not
// a real FFT — deterministic, dependency-free, and perfect for a stylised
// visualiser. `spectrumBars` turns those magnitudes into multi-row block bars.

import { contribute, type CliMiddleware } from "@youneed/cli";

/** A spectrum source: magnitudes per frequency band over time. */
export interface Oscillator {
  /** Number of frequency bands (columns). */
  readonly bands: number;
  /** Magnitudes (0..1) for each band at `time` seconds. */
  sample(time: number): number[];
}

/** Options for {@link oscillator} / {@link createOscillator}. */
export interface OscillatorOptions {
  /** Number of bands. Default 24. */
  bands?: number;
  /** Animation speed multiplier. Default 1. */
  speed?: number;
}

/** Create a synthetic {@link Oscillator} (deterministic — testable). */
export function createOscillator(opts: OscillatorOptions = {}): Oscillator {
  const bands = opts.bands ?? 24;
  const speed = opts.speed ?? 1;
  return {
    bands,
    sample(time) {
      const out: number[] = [];
      for (let i = 0; i < bands; i++) {
        // Two sines at band-specific rates, biased so low bands read louder.
        const slow = (Math.sin(time * speed * (0.7 + i * 0.13) + i) + 1) / 2;
        const fast = (Math.sin(time * speed * (1.9 + i * 0.07) + i * 1.7) + 1) / 2;
        const bass = 1 - i / bands;
        const v = (slow * 0.65 + fast * 0.35) * (0.45 + 0.55 * bass);
        out.push(Math.max(0, Math.min(1, v)));
      }
      return out;
    },
  };
}

/** Oscillator middleware. Adds `this.oscillator`. */
export function oscillator(opts: OscillatorOptions = {}): CliMiddleware<{ readonly oscillator: Oscillator }> {
  return {
    name: "oscillator",
    install(ctx) {
      contribute(ctx.command, "oscillator", createOscillator(opts));
    },
  };
}

// ── spectrumBars: cava-style block bars ───────────────────────────────────────

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Options for {@link spectrumBars}. */
export interface SpectrumOptions {
  /** Bar height in rows. Default 8. */
  height?: number;
  /** Colour/transform a cell given its bar value (0..1) and row index. */
  color?: (cell: string, value: number, row: number) => string;
}

/**
 * Render magnitudes as vertical block bars (like `cava`): one column per value,
 * `height` rows tall, with sub-row resolution via the eighth-block glyphs.
 * Returns a multi-line string (top row first).
 */
export function spectrumBars(values: readonly number[], opts: SpectrumOptions = {}): string {
  const height = opts.height ?? 8;
  const paint = opts.color ?? ((cell: string) => cell);
  const rows: string[] = [];
  for (let r = height - 1; r >= 0; r--) {
    let line = "";
    for (const v of values) {
      const fill = v * height - r; // how much of this row this bar fills (0..1+)
      let cell: string;
      if (fill >= 1) cell = "█";
      else if (fill <= 0) cell = " ";
      else cell = BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, Math.floor(fill * BLOCKS.length)))]!;
      line += cell === " " ? " " : paint(cell, v, r);
    }
    rows.push(line);
  }
  return rows.join("\n");
}
