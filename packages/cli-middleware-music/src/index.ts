// @youneed/cli-middleware-music — a music transport for @youneed/cli.
//
//   class Play extends Command("play", { middleware: [music(track)] }) {
//     constructor() { super(); this.player.play(); }
//     render() { return text`${this.player.track.title} ${formatTime(this.player.elapsed)}`; }
//   }
//
// `this.player` is a TRANSPORT — track metadata plus a play/pause clock
// (`elapsed`, `duration`, `progress`). It does not decode audio itself: the
// clock advances when you call `tick(dt)` (so it's deterministic and testable).
// Pass a `backend` (e.g. {@link systemPlayer}) to also drive real playback.

import { contribute, type CliMiddleware } from "@youneed/cli";

/** Track metadata. `duration` is in seconds. */
export interface Track {
  title: string;
  artist?: string;
  album?: string;
  duration: number;
}

/** Optional real-playback backend driven by the transport's play/pause/stop. */
export interface PlayerBackend {
  play(track: Track): void;
  pause(): void;
  stop(): void;
}

/** The transport surface contributed as `this.player`. */
export interface Player {
  readonly track: Track;
  readonly duration: number;
  /** Seconds played so far. */
  readonly elapsed: number;
  readonly playing: boolean;
  /** `elapsed / duration`, clamped to 0..1. */
  readonly progress: number;
  /** True once `elapsed` reaches `duration`. */
  readonly ended: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Jump to `seconds` (clamped to the track). */
  seek(seconds: number): void;
  /** Advance the clock by `dt` seconds — only while playing. */
  tick(dt: number): void;
}

/** Format seconds as `m:ss`. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Create a {@link Player} transport for `track`. */
export function createPlayer(track: Track, opts: { backend?: PlayerBackend } = {}): Player {
  const backend = opts.backend;
  let elapsed = 0;
  let playing = false;
  const clamp = (s: number): number => Math.max(0, Math.min(track.duration, s));
  return {
    track,
    get duration() {
      return track.duration;
    },
    get elapsed() {
      return elapsed;
    },
    get playing() {
      return playing;
    },
    get progress() {
      return track.duration > 0 ? clamp(elapsed) / track.duration : 0;
    },
    get ended() {
      return elapsed >= track.duration;
    },
    play() {
      if (elapsed >= track.duration) return;
      if (!playing) {
        playing = true;
        backend?.play(track);
      }
    },
    pause() {
      if (playing) {
        playing = false;
        backend?.pause();
      }
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    seek(seconds) {
      elapsed = clamp(seconds);
    },
    tick(dt) {
      if (!playing) return;
      elapsed = clamp(elapsed + dt);
      if (elapsed >= track.duration) {
        playing = false;
        backend?.stop();
      }
    },
  };
}

/** Options for {@link music}. */
export interface MusicOptions {
  /** Real-playback backend (e.g. {@link systemPlayer}). Default: none (silent transport). */
  backend?: PlayerBackend;
  /** Start playing on install. Default false. */
  autoplay?: boolean;
}

/** Music middleware. Adds `this.player` (a {@link Player} transport). */
export function music(track: Track, opts: MusicOptions = {}): CliMiddleware<{ readonly player: Player }> {
  return {
    name: "music",
    install(ctx) {
      const player = createPlayer(track, { backend: opts.backend });
      if (opts.autoplay) player.play();
      contribute(ctx.command, "player", player);
    },
  };
}

/**
 * A best-effort {@link PlayerBackend} that plays an audio file with a system
 * command — `afplay` (macOS), PowerShell SoundPlayer (Windows), or `ffplay`
 * (Linux/other). CLI players can't pause, so `pause` stops the process. If the
 * command is missing it fails silently — the transport keeps running regardless.
 */
export function systemPlayer(file: string): PlayerBackend {
  let child: import("node:child_process").ChildProcess | undefined;
  const command = (): [string, string[]] => {
    if (process.platform === "darwin") return ["afplay", [file]];
    if (process.platform === "win32")
      return ["powershell", ["-c", `(New-Object Media.SoundPlayer '${file}').PlaySync()`]];
    return ["ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", file]];
  };
  const stop = (): void => {
    child?.kill();
    child = undefined;
  };
  return {
    play() {
      if (child) return;
      void import("node:child_process")
        .then(({ spawn }) => {
          const [bin, args] = command();
          child = spawn(bin, args, { stdio: "ignore" });
          child.on("error", () => (child = undefined));
        })
        .catch(() => undefined);
    },
    pause: stop,
    stop,
  };
}
