# @youneed/cli-middleware-oscillator

A synthetic spectrum source and a `cava`-style bar renderer for
[`@youneed/cli`](../cli). The middleware adds **`this.oscillator`** — a
deterministic, dependency-free signal (a sum of sines, bass-biased) whose
`sample(time)` returns per-band magnitudes (`0..1`) — and `spectrumBars()` turns
those magnitudes into multi-row block bars. It's not a real FFT, it's a stylised
visualiser: perfect for a demo, a loading screen, or a music-player UI, and
testable because the same `time` always yields the same frame.

```ts
import { Application, Command, task, text } from "@youneed/cli";
import { oscillator, spectrumBars } from "@youneed/cli-middleware-oscillator";

class Vis extends Command("vis", { middleware: [oscillator({ bands: 32, speed: 1.5 })] }) {
  t = 0;

  execute() {
    // animate: bump `t` on a timer and repaint via a task/render loop
    task(this, async () => {
      for (let i = 0; i < 300; i++) {
        this.t = i / 30;
        this.requestUpdate?.();
        await new Promise((r) => setTimeout(r, 33));
      }
    }).run();
  }

  render() {
    return text`${spectrumBars(this.oscillator.sample(this.t), { height: 10 })}`;
  }
}

const app = Application({ name: "demo", commands: [Vis] });
app.run(["vis"]);
```

## Exports

- **`oscillator(opts?)`** — middleware. Contributes `this.oscillator`, an
  `Oscillator` built from `createOscillator(opts)`.
- **`createOscillator(opts?)`** — build a standalone `Oscillator` (no middleware;
  handy for tests).
- **`spectrumBars(values, opts?)`** — render an array of `0..1` magnitudes as
  vertical block bars, top row first, returned as a multi-line string.

## Options

- **`OscillatorOptions`** — `{ bands?, speed? }`. `bands` is the number of
  columns (default `24`); `speed` is the animation multiplier (default `1`).
- **`Oscillator`** — `{ bands, sample(time) }`. `sample(time)` returns the per-band
  magnitudes for `time` in seconds.
- **`SpectrumOptions`** — `{ height?, color? }`. `height` is the bar height in rows
  (default `8`); `color(cell, value, row)` transforms each non-blank glyph (e.g.
  to add ANSI colour).
