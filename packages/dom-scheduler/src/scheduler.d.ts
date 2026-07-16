export type Priority = "render-blocking" | "background";
/** What the scheduler needs from a component to coordinate it. */
export interface SchedulerHost {
    flush(): void;
    readonly depth: number;
}
export interface Scheduler {
    request(host: SchedulerHost, priority: Priority): void;
    flushSync(): void;
    /** Optional per-frame game-loop tick (dt in ms); returns an unsubscribe. */
    frame?(callback: (dt: number) => void): () => void;
    /** Tear the scheduler down: cancel any in-flight frame/timer and forget all
     *  pending work. For a frame scheduler this also frees the timer that would
     *  otherwise keep a Node/test event loop alive. */
    stop?(): void;
    /** Same teardown as `stop()`, exposed for `using` (TC39 explicit resource
     *  management): `using sched = createFpsScheduler(60)` disposes on scope exit. */
    [Symbol.dispose]?(): void;
    /** Human-readable label for devtools (e.g. "microtask", "sync", "raf"). */
    readonly name?: string;
}
export declare function createScheduler(): Scheduler;
/** Swap the global scheduler (e.g. a synchronous one for SSR). */
export declare function setDefaultScheduler(scheduler: Scheduler): void;
/** The current global scheduler (reflects the latest setDefaultScheduler). */
export declare function getDefaultScheduler(): Scheduler;
/** A synchronous scheduler — renders run inline. Ideal for SSR/SSG. */
export declare const syncScheduler: Scheduler;
/**
 * Frame scheduler — drives BOTH rendering and an optional per-frame game loop:
 *  - request(host): coalesces renders to the frame cadence;
 *  - frame(cb): a recurring tick called with `dt` (ms since the last frame). The
 *    loop runs while there are renders pending OR frame subscribers, so a game
 *    loop ticks every frame even with no reactive change; state updated inside
 *    the tick renders in the SAME frame.
 *
 * `fps` caps the rate (omit for one tick per rAF). Driven by rAF + a time
 * accumulator (pauses on hidden tabs); falls back to a timer where rAF is
 * absent. Share ONE instance for a global, lock-step frame budget (HTML games):
 * @example
 *   const frame = createFpsScheduler(30);
 *   class Sprite extends Component("game-sprite") { static scheduler = frame; … }
 *   // or globally:  setDefaultScheduler(createFpsScheduler(30));
 */
export declare function createFpsScheduler(fps?: number): Scheduler;
/** A frame scheduler with no fps cap (one tick per rAF). */
export declare const rafScheduler: Scheduler;
