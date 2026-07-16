// @youneed/dom-scheduler — a prioritized, batching render scheduler. DOM- and
// Node-agnostic: it only coordinates "hosts" (anything with a `flush()` + a
// `depth`), and uses requestAnimationFrame / requestIdleCallback when present,
// falling back to setTimeout otherwise. The same schedulers drive components on
// the client (real DOM) and during SSR/SSG (`syncScheduler`).
//
// Instead of opaque callbacks, the scheduler tracks dirty *hosts*. This lets it:
//   • dedupe       — one flush per host per batch;
//   • escalate     — a render-blocking request beats a queued background one
//                    (fixes priority inversion);
//   • order        — flush parents before children (by depth), so a parent
//                    re-render that updates child props happens first;
//   • cascade      — hosts dirtied *during* a flush are drained in the same pass.
// Render-blocking flushes on the microtask queue; background on idle/macrotask;
// `flushSync` drains everything synchronously (SSR/SSG, tests).
export function createScheduler() {
    const pending = new Map();
    let microQueued = false;
    let idleQueued = false;
    const flushBucket = (wanted) => {
        let guard = 0;
        for (;;) {
            const hosts = [];
            for (const [host, prio] of pending)
                if (prio === wanted)
                    hosts.push(host);
            if (hosts.length === 0)
                break;
            for (const host of hosts)
                pending.delete(host);
            hosts.sort((a, b) => a.depth - b.depth); // parents first
            // Contain a throwing host so the rest of the batch still flushes. (Hosts
            // like @youneed/dom already catch their own render errors; this is
            // defense-in-depth for any host whose flush() throws unexpectedly.)
            for (const host of hosts) {
                try {
                    host.flush();
                }
                catch (error) {
                    console.error("scheduler: host flush failed:", error);
                }
            }
            if (++guard > 1000)
                throw new Error("scheduler: flush did not converge");
        }
    };
    const queueMicro = () => {
        if (microQueued)
            return;
        microQueued = true;
        queueMicrotask(() => {
            microQueued = false;
            flushBucket("render-blocking");
        });
    };
    const queueIdle = () => {
        if (idleQueued)
            return;
        idleQueued = true;
        const run = () => {
            idleQueued = false;
            flushBucket("background");
        };
        if (typeof requestIdleCallback === "function")
            requestIdleCallback(run);
        else
            setTimeout(run, 0);
    };
    return {
        name: "microtask",
        request(host, priority) {
            const current = pending.get(host);
            // escalate: render-blocking always wins over background
            const next = current === "render-blocking" || priority === "render-blocking"
                ? "render-blocking"
                : "background";
            pending.set(host, next);
            if (next === "render-blocking")
                queueMicro();
            else
                queueIdle();
        },
        flushSync() {
            let guard = 0;
            while (pending.size) {
                flushBucket("render-blocking");
                flushBucket("background");
                if (++guard > 1000)
                    throw new Error("scheduler: flushSync did not converge");
            }
        },
        // Drop pending work; an already-queued microtask/idle callback then flushes
        // an empty set (a no-op) and clears its own flag — nothing left scheduled.
        stop() {
            pending.clear();
        },
        [Symbol.dispose]() {
            pending.clear();
        },
    };
}
let defaultScheduler = createScheduler();
/** Swap the global scheduler (e.g. a synchronous one for SSR). */
export function setDefaultScheduler(scheduler) {
    defaultScheduler = scheduler;
}
/** The current global scheduler (reflects the latest setDefaultScheduler). */
export function getDefaultScheduler() {
    return defaultScheduler;
}
/** A synchronous scheduler — renders run inline. Ideal for SSR/SSG. */
export const syncScheduler = {
    name: "sync",
    request: (host) => host.flush(),
    flushSync: () => { },
};
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
export function createFpsScheduler(fps) {
    const pending = new Set();
    const frames = new Set();
    const minInterval = fps ? 1000 / fps : 0;
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    // rAF where available, else a timer. CRUCIAL: keep the returned handle so the
    // in-flight frame can be cancelled — otherwise the fallback `setTimeout` is
    // un-cancellable and keeps a Node/test event loop alive (and `stop()` can't
    // tear the loop down). The loop already self-terminates when idle (the chain
    // isn't rescheduled), so this isn't an unbounded accumulation — but a single
    // dangling timer is still a real handle we must be able to release.
    const hasRaf = typeof requestAnimationFrame === "function";
    const schedule = (cb) => hasRaf ? requestAnimationFrame(cb) : setTimeout(() => cb(now()), minInterval || 16);
    const unschedule = (id) => hasRaf ? cancelAnimationFrame(id) : clearTimeout(id);
    let frameId; // the in-flight frame/timer handle (if any)
    let looping = false;
    let last = -Infinity;
    const flush = () => {
        let guard = 0;
        while (pending.size) {
            const hosts = [...pending];
            pending.clear();
            hosts.sort((a, b) => a.depth - b.depth);
            for (const host of hosts)
                host.flush();
            if (++guard > 1000)
                throw new Error("fpsScheduler: flush did not converge");
        }
    };
    const tick = (t) => {
        frameId = undefined; // this frame has fired; nothing scheduled right now
        if (pending.size === 0 && frames.size === 0) {
            looping = false; // idle: stop until the next request/frame subscription
            return;
        }
        frameId = schedule(tick);
        if (t - last < minInterval)
            return; // cap not reached yet -> skip this rAF
        const dt = last === -Infinity ? 0 : t - last;
        last = t;
        if (frames.size)
            for (const cb of [...frames])
                cb(dt); // game tick -> may dirty hosts
        flush(); // render everything dirtied this frame
    };
    const ensureLoop = () => {
        if (looping)
            return;
        looping = true;
        frameId = schedule(tick);
    };
    // Cancel the in-flight frame/timer and forget all work — the loop is fully
    // torn down (no dangling timer left running).
    const stop = () => {
        if (frameId !== undefined)
            unschedule(frameId);
        frameId = undefined;
        looping = false;
        last = -Infinity;
        pending.clear();
        frames.clear();
    };
    return {
        name: fps ? `fps(${fps})` : "raf",
        request(host) {
            pending.add(host);
            ensureLoop();
        },
        frame(callback) {
            frames.add(callback);
            ensureLoop();
            return () => {
                frames.delete(callback);
            };
        },
        flushSync: flush,
        stop,
        [Symbol.dispose]: stop, // `using sched = createFpsScheduler(...)`
    };
}
/** A frame scheduler with no fps cap (one tick per rAF). */
export const rafScheduler = createFpsScheduler();
