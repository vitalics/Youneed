# @youneed/cli-middleware-music

A music **transport** for [`@youneed/cli`](../cli) commands. Install the
middleware and your command gains **`this.player`** — track metadata plus a
play/pause clock (`elapsed`, `duration`, `progress`, `ended`). It does **not**
decode audio itself: the clock advances when you call `tick(dt)`, which makes it
deterministic and easy to test, and lets you drive a progress bar / visualiser
from a scheduler frame. Pass a `backend` (e.g. `systemPlayer`) to also fire real
audio playback alongside the clock.

```ts
import { Command, task, text } from "@youneed/cli";
import { formatTime, music, systemPlayer } from "@youneed/cli-middleware-music";

const TRACK = { title: "Midnight City", artist: "M83", duration: 30 };

export class Play extends Command("play", {
  middleware: [music(TRACK, { autoplay: true, backend: systemPlayer("track.mp3") })],
}) {
  // Keep the live region alive until the track ends.
  #ended = task(this, () =>
    new Promise<void>((resolve) => {
      const poll = () =>
        void (this.player?.ended || this.abortSignal.aborted ? resolve() : setTimeout(poll, 100));
      setTimeout(poll, 100);
    }),
  );

  constructor() {
    super();
    this.#ended.run();
    // Advance the transport clock at 12fps; the runtime disposes the timer on exit.
    this.scheduler.frame((dt) => this.player?.tick(dt), 12);
  }

  render() {
    const p = this.player;
    return text`${p.track.title} — ${formatTime(p.elapsed)} / ${formatTime(p.duration)}`;
  }
}
```

## `this.player` (a `Player` transport)

- **`track`**, **`duration`** — the track metadata (`duration` in seconds).
- **`elapsed`** — seconds played so far.
- **`progress`** — `elapsed / duration`, clamped to `0..1`.
- **`playing`** / **`ended`** — clock state.
- **`play()`** / **`pause()`** / **`toggle()`** — start/stop the clock (and the
  backend, if any).
- **`seek(seconds)`** — jump to a position (clamped to the track).
- **`tick(dt)`** — advance the clock by `dt` seconds, but only while playing. The
  clock stops (and the backend's `stop` fires) once `elapsed` reaches `duration`.

## Options

`music(track, options?)`:

- **`backend`** — a `PlayerBackend` (`play`/`pause`/`stop`) driven by the
  transport. Default: none (a silent clock-only transport).
- **`autoplay`** — start playing on install. Default `false`.

## Exports

- **`music(track, options?)`** — the middleware factory. Contributes `this.player`.
- **`createPlayer(track, { backend? })`** — build a `Player` transport directly
  (what the middleware uses internally).
- **`systemPlayer(file)`** — a best-effort `PlayerBackend` that plays an audio
  file with a system command: `afplay` (macOS), PowerShell `SoundPlayer`
  (Windows), or `ffplay` (Linux/other). CLI players can't pause, so `pause` stops
  the process; a missing command fails silently and the transport keeps running.
- **`formatTime(seconds)`** — format seconds as `m:ss`.
- **`Track`**, **`Player`**, **`PlayerBackend`**, **`MusicOptions`** — types.
