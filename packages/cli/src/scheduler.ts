// @youneed/cli — the per-command scheduler, the terminal twin of dom's scheduler.
//
// A command's animated elements each want their own cadence: a spectrum at
// ~12fps, a clock every second, a spinner every 80ms. Instead of every element
// rolling its own `setInterval` + repaint + cleanup, they register a tick on
// `this.scheduler`; it runs the tick and asks the host to repaint (coalesced by
// the live renderer), and the runtime disposes every timer when the command ends.
//
//   constructor() {
//     super();
//     this.scheduler.frame((dt) => this.player.tick(dt), 12);  // 12fps transport
//     this.scheduler.every(1000, () => this.clock.refresh());   // 1s clock
//   }

/** The minimum a scheduler needs from its owner: a way to ask for a repaint. */
export interface SchedulerHost {
  requestUpdate(): void;
}

/** Schedules recurring ticks at independent rates and repaints after each. */
export interface Scheduler {
  /** Run `tick` every `intervalMs`, repainting after each. Returns a stop fn. */
  every(intervalMs: number, tick: () => void): () => void;
  /**
   * Run `tick(dt)` ~`fps` times/second (default 30), where `dt` is seconds since
   * the last frame — for time-based animation. Repaints after each. Returns a
   * stop fn.
   */
  frame(tick: (dt: number) => void, fps?: number): () => void;
  /** Request a coalesced repaint now, without a recurring tick. */
  requestUpdate(): void;
  /** Stop every timer this scheduler owns. */
  dispose(): void;
}

/** Create a {@link Scheduler} bound to `host`. */
export function createScheduler(host: SchedulerHost): Scheduler {
  const timers = new Set<ReturnType<typeof setInterval>>();

  const every = (intervalMs: number, tick: () => void): (() => void) => {
    const id = setInterval(() => {
      tick();
      host.requestUpdate();
    }, Math.max(1, intervalMs));
    (id as { unref?: () => void }).unref?.(); // never keep the process alive
    timers.add(id);
    return () => {
      clearInterval(id);
      timers.delete(id);
    };
  };

  const frame = (tick: (dt: number) => void, fps = 30): (() => void) => {
    let last = Date.now();
    return every(Math.round(1000 / Math.max(1, fps)), () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      tick(dt);
    });
  };

  return {
    every,
    frame,
    requestUpdate: () => host.requestUpdate(),
    dispose() {
      for (const id of timers) clearInterval(id);
      timers.clear();
    },
  };
}
