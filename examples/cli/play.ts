import { Command, task, text } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";
import { formatTime, music } from "@youneed/cli-middleware-music";
import { oscillator, spectrumBars } from "@youneed/cli-middleware-oscillator";

const NOW_PLAYING = {
  title: "Midnight City",
  artist: "M83",
  album: "Hurry Up, We're Dreaming",
  duration: 30,
};

export class PlayCommand extends Command("play", {
  description:
    "Play a track with a cava-style spectrum visualiser (run in a real terminal)",
  // music() = transport (elapsed clock); oscillator() = the synthetic spectrum.
  middleware: [
    color(),
    music(NOW_PLAYING, { autoplay: true }),
    oscillator({ bands: 48 }),
  ],
}) {
  // A task that stays pending for the whole track — keeps the live region alive
  // until the song ends, at which point the runtime tears the command down.
  // The first poll is deferred: middleware (and so `this.player`) is installed
  // after construction, not before it.
  #ended = task(
    this,
    () =>
      new Promise<void>((resolve) => {
        const poll = (): void =>
          void (this.player?.ended || this.abortSignal.aborted
            ? resolve()
            : setTimeout(poll, 100));
        setTimeout(poll, 100);
      }),
  );

  constructor() {
    super();
    this.#ended.run();
    // Drive the transport from the scheduler: a 12fps time-based tick that
    // repaints after each frame. The runtime disposes the timer when the run
    // ends — no manual setInterval/clearInterval.
    this.scheduler.frame((dt) => this.player?.tick(dt), 12);
  }

  override render() {
    const c = this.color;
    const p = this.player;
    const spectrum = spectrumBars(this.oscillator.sample(p.elapsed), {
      height: 10,
      color: (cell, v) =>
        v > 0.7 ? c.red(cell) : v > 0.4 ? c.yellow(cell) : c.green(cell),
    });
    const width = 40;
    const filled = Math.round(p.progress * width);
    const bar =
      c.cyan("━".repeat(filled) + "●") +
      c.dim("━".repeat(Math.max(0, width - filled)));
    return text`${spectrum}
${c.bold(p.track.title)} ${c.dim("· " + (p.track.artist ?? ""))}
${bar} ${c.dim(formatTime(p.elapsed) + " / " + formatTime(p.duration))}`;
  }
}
