// ── @youneed/jobs — a zero-dependency job scheduler ───────────────────────────
//
// Schedule work by cron expression, fixed interval, or a one-off delay/instant.
// Distinct from the DOM microtask scheduler: this fires *clock-time* jobs.
//
// Everything is DETERMINISTIC: the package never touches `Date.now()` or
// `setTimeout` directly — those live only behind the injectable defaults of
// `createScheduler`. Inject a fake clock + timer registry and tests run instantly.
//
// All cron computation is in UTC (see `nextRun`). An optional `LockStore`
// (satisfied structurally by `@youneed/kv`'s `KV`) gives a fleet a leader-lock so
// exactly one instance runs each occurrence.

// ── cron parsing ──────────────────────────────────────────────────────────────

/** A parsed cron expression: the set of allowed values for each field. */
export interface CronFields {
  /** 0–59. Empty/absent for 5-field expressions (treated as `[0]`). */
  second: number[];
  minute: number[];
  hour: number[];
  /** day-of-month, 1–31. */
  dom: number[];
  /** month, 1–12. */
  month: number[];
  /** day-of-week, 0–6 (Sunday = 0). */
  dow: number[];
  /** Whether the original expression constrained day-of-month (not `*`). */
  domRestricted: boolean;
  /** Whether the original expression constrained day-of-week (not `*`). */
  dowRestricted: boolean;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface FieldSpec {
  min: number;
  max: number;
  names?: string[];
  /** Map a parsed value into the canonical range (e.g. dow 7 → 0). */
  normalize?: (n: number) => number;
}

function parseField(raw: string, spec: FieldSpec): { values: number[]; restricted: boolean } {
  const restricted = raw.trim() !== "*";
  const out = new Set<number>();
  const resolveName = (token: string): number => {
    const upper = token.toUpperCase();
    if (spec.names) {
      const idx = spec.names.indexOf(upper);
      if (idx !== -1) return idx + spec.min;
    }
    const n = Number(token);
    if (!Number.isInteger(n)) throw new Error(`cron: invalid value "${token}"`);
    return n;
  };

  for (const part of raw.split(",")) {
    if (part === "") throw new Error(`cron: empty field segment in "${raw}"`);
    // step: <range-or-*>/<n>
    let stepStr: string | undefined;
    let body = part;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      body = part.slice(0, slash);
      stepStr = part.slice(slash + 1);
    }
    const step = stepStr === undefined ? 1 : Number(stepStr);
    if (stepStr !== undefined && (!Number.isInteger(step) || step <= 0))
      throw new Error(`cron: invalid step "${stepStr}"`);

    let lo: number;
    let hi: number;
    if (body === "*") {
      lo = spec.min;
      hi = spec.max;
    } else if (body.includes("-")) {
      const [a, b] = body.split("-");
      lo = resolveName(a);
      hi = resolveName(b);
    } else {
      lo = resolveName(body);
      // A bare value with a step (e.g. `5/10`) means "from 5 to max".
      hi = stepStr === undefined ? lo : spec.max;
    }

    if (lo > hi) throw new Error(`cron: range out of order "${body}"`);
    for (let v = lo; v <= hi; v += step) {
      const norm = spec.normalize ? spec.normalize(v) : v;
      if (norm < spec.min || norm > spec.max)
        throw new Error(`cron: value ${v} out of range [${spec.min}, ${spec.max}]`);
      out.add(norm);
    }
  }
  return { values: [...out].sort((a, b) => a - b), restricted };
}

/** Parse a standard 5-field cron (`minute hour day-of-month month day-of-week`),
 *  or a 6-field expression with a leading seconds field. Supports `*`, lists,
 *  ranges, steps, and month/weekday names. Throws on anything malformed. */
export function parseCron(expr: string): CronFields {
  if (typeof expr !== "string") throw new Error("cron: expression must be a string");
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6)
    throw new Error(`cron: expected 5 or 6 fields, got ${parts.length} in "${expr}"`);

  const hasSeconds = parts.length === 6;
  const [sec, min, hr, dom, mon, dow] = hasSeconds
    ? parts
    : (["0", ...parts] as string[]);

  const second = parseField(sec, { min: 0, max: 59 });
  const minute = parseField(min, { min: 0, max: 59 });
  const hour = parseField(hr, { min: 0, max: 23 });
  const domF = parseField(dom, { min: 1, max: 31 });
  const month = parseField(mon, { min: 1, max: 12, names: MONTHS });
  // dow allows 0–7 with 7 normalized to 0 (both Sunday).
  const dowF = parseField(dow, { min: 0, max: 7, names: WEEKDAYS, normalize: (n) => (n === 7 ? 0 : n) });

  return {
    second: second.values,
    minute: minute.values,
    hour: hour.values,
    dom: domF.values,
    month: month.values,
    dow: dowF.values,
    domRestricted: domF.restricted,
    dowRestricted: dowF.restricted,
  };
}

/** Compute the next instant strictly after `after` that matches `expr`. All
 *  matching is done in **UTC**. Returns a `Date`. Throws on an invalid `expr`.
 *
 *  Vixie-cron day semantics: when BOTH day-of-month and day-of-week are
 *  restricted, a day matches if EITHER matches (OR); otherwise the restricted
 *  one applies. */
export function nextRun(expr: string, after: Date): Date {
  const f = parseCron(expr);
  // Start one second past `after` (we want strictly-after).
  const d = new Date(after.getTime() + 1000);
  d.setUTCMilliseconds(0);

  const dayMatches = (date: Date): boolean => {
    if (!f.month.includes(date.getUTCMonth() + 1)) return false;
    const domOk = f.dom.includes(date.getUTCDate());
    const dowOk = f.dow.includes(date.getUTCDay());
    if (f.domRestricted && f.dowRestricted) return domOk || dowOk;
    if (f.domRestricted) return domOk;
    if (f.dowRestricted) return dowOk;
    return true; // both `*`
  };

  // Bounded search: at most a few years of seconds is overkill; iterate by the
  // coarsest field that can be advanced. Walk forward field-by-field.
  const LIMIT = 366 * 4; // days to scan before giving up (covers leap cycles)
  let dayCursor = 0;
  while (dayCursor <= LIMIT) {
    if (dayMatches(d)) {
      // Find the next matching time within this day.
      for (;;) {
        if (
          f.hour.includes(d.getUTCHours()) &&
          f.minute.includes(d.getUTCMinutes()) &&
          f.second.includes(d.getUTCSeconds())
        ) {
          return new Date(d.getTime());
        }
        // advance by one second, but skip whole minutes/hours when possible
        if (!f.hour.includes(d.getUTCHours())) {
          d.setUTCMinutes(0, 0, 0);
          d.setUTCHours(d.getUTCHours() + 1);
        } else if (!f.minute.includes(d.getUTCMinutes())) {
          d.setUTCSeconds(0, 0);
          d.setUTCMinutes(d.getUTCMinutes() + 1);
        } else {
          d.setUTCSeconds(d.getUTCSeconds() + 1);
        }
        if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) break; // rolled to next day
      }
    } else {
      // jump to next day at 00:00:00
      d.setUTCHours(24, 0, 0, 0);
    }
    dayCursor++;
  }
  throw new Error(`cron: no matching time found for "${expr}" within search window`);
}

// ── schedule kinds ────────────────────────────────────────────────────────────

/** A fixed interval, in milliseconds. */
export interface EverySchedule {
  every: number;
}
/** A one-off at an absolute instant. */
export interface AtSchedule {
  at: Date;
}
/** A one-off after a delay, in milliseconds. */
export interface AfterSchedule {
  after: number;
}

/** A job's schedule: a cron string, a fixed interval, or a one-off. */
export type Schedule = string | EverySchedule | AtSchedule | AfterSchedule;

// ── jobs + scheduler options ──────────────────────────────────────────────────

/** A unit of scheduled work. */
export interface Job {
  /** Unique name (used for the lock key + introspection). */
  name: string;
  schedule: Schedule;
  handler: () => unknown | Promise<unknown>;
  /** Fire the handler immediately on `start()` in addition to its schedule. */
  runOnStart?: boolean;
  /** Allow a new run to start while a previous one is still in flight.
   *  Default `false` (skip the occurrence). */
  overlap?: boolean;
}

/** Opaque timer handle returned by `setTimer`. */
export type TimerHandle = unknown;

/** A distributed counter store — structurally satisfied by `@youneed/kv`'s `KV`.
 *  Only the atomic `incr` is needed for the leader-lock. */
export interface LockStore {
  /** Atomically increment `key` (creating at 0). Returns the new value;
   *  `1` means this caller created the key = won the lock for that slot. */
  incr(key: string, opts?: { ttl?: number }): Promise<number>;
}

export interface SchedulerOptions {
  /** Clock in epoch ms (default `Date.now`). Injectable for tests. */
  now?: () => number;
  /** Schedule `cb` after `ms`; returns a handle. Default wraps `setTimeout` (unref'd). */
  setTimer?: (cb: () => void, ms: number) => TimerHandle;
  /** Cancel a handle from `setTimer`. Default wraps `clearTimeout`. */
  clearTimer?: (h: TimerHandle) => void;
  /** Called when a handler rejects/throws; the job is rescheduled regardless. */
  onError?: (err: unknown, job: Job) => void;
  /** A fleet-wide lock store. When set, each occurrence is gated by an atomic
   *  `incr` keyed by `job:<name>:<slot-ms>` so exactly one instance runs it. */
  store?: LockStore;
  /** TTL (seconds) for lock keys. Default `30`. */
  lockTtl?: number;
}

/** A single job's introspection snapshot. */
export interface JobInfo {
  name: string;
  nextRun: Date | null;
  running: boolean;
}

interface JobState {
  job: Job;
  timer: TimerHandle | undefined;
  /** Scheduled fire time (epoch ms) of the currently-armed timer, or null. */
  nextRunMs: number | null;
  running: boolean;
}

// ── scheduler ─────────────────────────────────────────────────────────────────

export class Scheduler {
  #now: () => number;
  #setTimer: (cb: () => void, ms: number) => TimerHandle;
  #clearTimer: (h: TimerHandle) => void;
  #onError: (err: unknown, job: Job) => void;
  #store?: LockStore;
  #lockTtl: number;
  #jobs = new Map<string, JobState>();
  #started = false;

  constructor(opts: SchedulerOptions = {}) {
    this.#now = opts.now ?? (() => Date.now());
    this.#setTimer =
      opts.setTimer ??
      ((cb, ms) => {
        const h = setTimeout(cb, ms);
        (h as { unref?: () => void }).unref?.();
        return h;
      });
    this.#clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.#onError = opts.onError ?? (() => {});
    this.#store = opts.store;
    this.#lockTtl = opts.lockTtl ?? 30;
  }

  /** Register a job. Rejects duplicate names. Chainable. */
  add(job: Job): this {
    if (this.#jobs.has(job.name)) throw new Error(`jobs: duplicate job name "${job.name}"`);
    validateSchedule(job.schedule);
    const state: JobState = { job, timer: undefined, nextRunMs: null, running: false };
    this.#jobs.set(job.name, state);
    if (this.#started) this.#arm(state);
    return this;
  }

  /** Compute the next fire time (epoch ms) strictly after `fromMs`, or `null`
   *  for a one-off that's already in the past. */
  #computeNext(schedule: Schedule, fromMs: number): number | null {
    if (typeof schedule === "string") {
      return nextRun(schedule, new Date(fromMs)).getTime();
    }
    if ("every" in schedule) {
      return fromMs + schedule.every;
    }
    if ("at" in schedule) {
      const t = schedule.at.getTime();
      return t > fromMs ? t : null;
    }
    // { after }
    return fromMs + schedule.after;
  }

  #isOneOff(schedule: Schedule): boolean {
    return typeof schedule !== "string" && ("at" in schedule || "after" in schedule);
  }

  #arm(state: JobState): void {
    if (state.timer !== undefined) {
      this.#clearTimer(state.timer);
      state.timer = undefined;
    }
    const now = this.#now();
    const next = this.#computeNext(state.job.schedule, now);
    if (next === null) {
      state.nextRunMs = null;
      return;
    }
    state.nextRunMs = next;
    const delay = Math.max(0, next - now);
    state.timer = this.#setTimer(() => {
      this.#fire(state, next);
    }, delay);
  }

  /** Fire `state` for its scheduled slot. Re-arms the NEXT occurrence right away
   *  (independent of how long this run takes), then runs the handler. */
  #fire(state: JobState, slotMs: number): void {
    state.timer = undefined;
    const oneOff = this.#isOneOff(state.job.schedule);

    // Re-arm the next occurrence immediately, so a slow handler never stalls the
    // schedule. One-offs don't re-arm.
    if (!oneOff) this.#arm(state);
    else state.nextRunMs = null;

    // Overlap policy: skip if still running and overlap not allowed.
    if (state.running && !state.job.overlap) return;

    void this.#maybeRun(state, slotMs);
  }

  /** Acquire the lock (if configured) for this slot, then run the handler. */
  async #maybeRun(state: JobState, slotMs: number): Promise<void> {
    if (this.#store) {
      const key = `job:${state.job.name}:${slotMs}`;
      let won = false;
      try {
        const v = await this.#store.incr(key, { ttl: this.#lockTtl });
        won = v === 1;
      } catch (err) {
        this.#onError(err, state.job);
        return;
      }
      if (!won) return; // another instance owns this occurrence
    }
    await this.#run(state);
  }

  /** Invoke the handler, tracking `running` and routing errors to `onError`. */
  async #run(state: JobState): Promise<unknown> {
    state.running = true;
    try {
      return await state.job.handler();
    } catch (err) {
      this.#onError(err, state.job);
      return undefined;
    } finally {
      state.running = false;
    }
  }

  /** Schedule every registered job to its next fire. `runOnStart` jobs also
   *  fire immediately (still respecting lock + overlap). Idempotent. */
  start(): this {
    if (this.#started) return this;
    this.#started = true;
    for (const state of this.#jobs.values()) {
      this.#arm(state);
      if (state.job.runOnStart) {
        // Fire now against the current slot; do not disturb the armed timer.
        void this.#maybeRun(state, this.#now());
      }
    }
    return this;
  }

  /** Clear all timers. In-flight handlers are left to settle. */
  stop(): this {
    this.#started = false;
    for (const state of this.#jobs.values()) {
      if (state.timer !== undefined) {
        this.#clearTimer(state.timer);
        state.timer = undefined;
      }
      state.nextRunMs = null;
    }
    return this;
  }

  /** Run a job's handler now, out of band. Returns the handler's result/promise.
   *  Bypasses the overlap policy and the leader-lock (it's a manual action). */
  trigger(name: string): Promise<unknown> {
    const state = this.#jobs.get(name);
    if (!state) throw new Error(`jobs: no job named "${name}"`);
    return this.#run(state);
  }

  /** Snapshot of each job's name, next scheduled run, and running flag. */
  list(): JobInfo[] {
    return [...this.#jobs.values()].map((s) => ({
      name: s.job.name,
      nextRun: s.nextRunMs === null ? null : new Date(s.nextRunMs),
      running: s.running,
    }));
  }
}

function validateSchedule(schedule: Schedule): void {
  if (typeof schedule === "string") {
    parseCron(schedule); // throws if invalid
    return;
  }
  if (schedule && typeof schedule === "object") {
    if ("every" in schedule && typeof schedule.every === "number" && schedule.every > 0) return;
    if ("at" in schedule && schedule.at instanceof Date) return;
    if ("after" in schedule && typeof schedule.after === "number" && schedule.after >= 0) return;
  }
  throw new Error("jobs: invalid schedule");
}

/** Create a `Scheduler`. See {@link SchedulerOptions}. */
export function createScheduler(opts?: SchedulerOptions): Scheduler {
  return new Scheduler(opts);
}

// ── @youneed/server plugin wrapper ────────────────────────────────────────────

import type { ServerPlugin } from "@youneed/server";

/** Options for the {@link jobs} server plugin: every {@link SchedulerOptions}
 *  knob, plus an optional list of jobs to register up front. */
export interface JobsPluginOptions extends SchedulerOptions {
  /** Jobs added to the scheduler before the server starts. */
  jobs?: Job[];
}

/**
 * A {@link ServerPlugin} that owns a {@link Scheduler} and binds it to the
 * server lifecycle: the scheduler `start()`s once the server is listening
 * (`onListen`) and `stop()`s during graceful drain (`onShutdown`).
 *
 *   const cron = jobs({ jobs: [{ name: "cleanup", schedule: "0 *\/6 * * *", handler: purge }] });
 *   app.plugin(cron).listen(3000, () => {});
 *   cron.scheduler.add({ name: "extra", schedule: { every: 1000 }, handler });
 *
 * The owned {@link Scheduler} is exposed as `.scheduler` so callers can
 * `add`/`trigger`/`list` after registration.
 */
export function jobs(opts: JobsPluginOptions = {}): ServerPlugin & { scheduler: Scheduler } {
  const scheduler = createScheduler(opts);
  for (const job of opts.jobs ?? []) scheduler.add(job);
  return {
    name: "jobs",
    scheduler,
    onListen() {
      scheduler.start();
    },
    onShutdown() {
      scheduler.stop();
    },
    // Surface the schedule for the devtools Infra view (JSON-safe: Date → ISO).
    inspect() {
      return {
        kind: "jobs",
        jobs: scheduler.list().map((j) => ({ name: j.name, nextRun: j.nextRun ? j.nextRun.toISOString() : null, running: j.running })),
      };
    },
  };
}
