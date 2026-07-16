// ── @youneed/server-plugin-queue — a durable background job queue ────────────
//
// `@youneed/server-plugin-jobs` SCHEDULES recurring work (cron/interval). This is
// the other half: a QUEUE of one-off background jobs with **retries + backoff**,
// a **dead-letter** state, **delayed** jobs and **concurrent** workers — persisted
// to a KV store so jobs survive a restart and a fleet shares one backlog.
//
//   • MemoryKV (built-in) → single instance / dev.
//   • RedisKV  (@youneed/kv-redis) → durable + shared across instances.
//
// `queue(q)` is a ServerPlugin: it starts the workers on listen, drains on
// shutdown, exposes control routes, and — with `@youneed/server-plugin-devtools`
// mounted — surfaces a Queue tab (jobs table, enqueue / retry / remove).

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";
import { MemoryKV, namespaced, type KV } from "@youneed/server-plugin-store";

export * from "@youneed/server-plugin-store"; // KV contract + MemoryKV, for convenience

/** A job's lifecycle state. */
export type JobState = "waiting" | "active" | "completed" | "failed";

/** A persisted job. `payload` is arbitrary JSON. */
export interface Job<T = unknown> {
  id: string;
  name: string;
  payload: T;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  /** Epoch ms the job becomes eligible to run (delays + backoff push it forward). */
  runAt: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

/** A handler for jobs of a given `name`. Throwing → the job is retried / dead-lettered. */
export type JobHandler<T = any> = (payload: T, job: Job<T>) => void | Promise<void>;

/** Options for {@link Queue.add}. */
export interface AddOptions {
  /** Delay before the job first becomes eligible (ms). */
  delayMs?: number;
  /** Override the queue's default `maxAttempts` for this job. */
  maxAttempts?: number;
  /** Explicit id (idempotency) — reusing an id overwrites the prior job. */
  id?: string;
}

export interface QueueOptions {
  /** Persistence backend. Default a new in-process {@link MemoryKV}. */
  store?: KV;
  /** Key namespace inside the store (so it can be shared). Default `"queue"`. */
  namespace?: string;
  /** Max jobs run at once. Default `1`. */
  concurrency?: number;
  /** Worker poll interval when running via {@link Queue.start}. Default `1000`ms. */
  pollMs?: number;
  /** Default attempts before a job is dead-lettered. Default `3`. */
  maxAttempts?: number;
  /** Backoff before the next attempt (ms), given the attempt just finished (1-based). */
  backoff?: (attempt: number) => number;
  /** Lease TTL (seconds) — a claimed job another worker may re-claim after this
   *  if the owner crashed. Default `30`. */
  visibilitySec?: number;
  /** Keep completed jobs this long (seconds) for inspection. Default `3600`. `0` = delete. */
  keepCompletedSec?: number;
  /** Handlers, `name → handler` (or register later with {@link Queue.register}). */
  handlers?: Record<string, JobHandler>;
  /** Injectable clock (tests). Default `Date.now`. */
  now?: () => number;
  /** Called when a handler throws (after state bookkeeping). */
  onError?: (err: unknown, job: Job) => void;
}

/** Aggregate counts by state. */
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}

const JOB_PREFIX = "job:";
const SEQ_KEY = "seq";
const LOCK_PREFIX = "lock:";
const defaultBackoff = (attempt: number): number => Math.min(30_000, 1000 * 2 ** (attempt - 1));

/**
 * A durable background job queue over a {@link KV} store. Enqueue with
 * {@link add}, register handlers with {@link register}, and either let the
 * ServerPlugin drive the workers ({@link start}/{@link stop}) or drain manually
 * with {@link runPending} (tests, one-shot workers).
 */
export class Queue {
  readonly #kv: KV;
  readonly #handlers = new Map<string, JobHandler>();
  readonly #concurrency: number;
  readonly #pollMs: number;
  readonly #maxAttempts: number;
  readonly #backoff: (attempt: number) => number;
  readonly #visibilitySec: number;
  readonly #keepCompletedSec: number;
  readonly #now: () => number;
  readonly #onError?: (err: unknown, job: Job) => void;
  readonly #active = new Set<Promise<void>>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #ticking = false;

  constructor(opts: QueueOptions = {}) {
    this.#kv = namespaced(opts.store ?? new MemoryKV(), opts.namespace ?? "queue");
    this.#concurrency = Math.max(1, opts.concurrency ?? 1);
    this.#pollMs = opts.pollMs ?? 1000;
    this.#maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
    this.#backoff = opts.backoff ?? defaultBackoff;
    this.#visibilitySec = opts.visibilitySec ?? 30;
    this.#keepCompletedSec = opts.keepCompletedSec ?? 3600;
    this.#now = opts.now ?? (() => Date.now());
    this.#onError = opts.onError;
    for (const [name, h] of Object.entries(opts.handlers ?? {})) this.#handlers.set(name, h);
  }

  /** Max jobs run at once. */
  get concurrency(): number {
    return this.#concurrency;
  }

  /** Register (or replace) the handler for a job `name`. Chainable. */
  register<T = unknown>(name: string, handler: JobHandler<T>): this {
    this.#handlers.set(name, handler as JobHandler);
    return this;
  }

  /** Enqueue a job. Returns the persisted job. */
  async add<T = unknown>(name: string, payload: T, opts: AddOptions = {}): Promise<Job<T>> {
    const now = this.#now();
    const id = opts.id ?? String(await this.#kv.incr(SEQ_KEY));
    const job: Job<T> = {
      id,
      name,
      payload,
      state: "waiting",
      attempts: 0,
      maxAttempts: Math.max(1, opts.maxAttempts ?? this.#maxAttempts),
      runAt: now + Math.max(0, opts.delayMs ?? 0),
      createdAt: now,
      updatedAt: now,
    };
    await this.#save(job);
    return job;
  }

  /** Load one job by id. */
  async get(id: string): Promise<Job | null> {
    const raw = await this.#kv.get(JOB_PREFIX + id);
    return raw ? (JSON.parse(raw) as Job) : null;
  }

  /** List jobs (optionally by state). Requires the store's optional `scan`. */
  async list(state?: JobState): Promise<Job[]> {
    if (!this.#kv.scan) return [];
    const keys = await this.#kv.scan(JOB_PREFIX);
    const jobs: Job[] = [];
    for (const key of keys) {
      const raw = await this.#kv.get(key);
      if (!raw) continue;
      const job = JSON.parse(raw) as Job;
      if (!state || job.state === state) jobs.push(job);
    }
    jobs.sort((a, b) => a.runAt - b.runAt || Number(a.id) - Number(b.id));
    return jobs;
  }

  /** Aggregate counts by state (`delayed` = waiting with a future `runAt`). */
  async stats(): Promise<QueueStats> {
    const jobs = await this.list();
    const now = this.#now();
    const s: QueueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: jobs.length };
    for (const j of jobs) {
      s[j.state]++;
      if (j.state === "waiting" && j.runAt > now) s.delayed++;
    }
    return s;
  }

  /** Requeue a job (e.g. a dead-lettered one) to run now, resetting its error. */
  async retry(id: string): Promise<boolean> {
    const job = await this.get(id);
    if (!job) return false;
    job.state = "waiting";
    job.runAt = this.#now();
    job.error = undefined;
    job.updatedAt = this.#now();
    await this.#save(job);
    return true;
  }

  /** Delete a job. */
  async remove(id: string): Promise<void> {
    await this.#kv.delete(JOB_PREFIX + id);
  }

  // ── worker lifecycle ──────────────────────────────────────────────────────

  /** Start the polling workers (called by the plugin on listen). */
  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.#tick(), this.#pollMs);
    if (typeof this.#timer === "object" && "unref" in this.#timer) (this.#timer as { unref(): void }).unref();
    void this.#tick();
  }

  /** Stop polling and wait for in-flight jobs to settle. */
  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await Promise.allSettled([...this.#active]);
  }

  /**
   * Process every currently-eligible job to completion (respecting `runAt` and
   * `concurrency`), looping until none remain due. Returns the number run. Use
   * for tests, one-shot workers, or draining on shutdown.
   */
  async runPending(): Promise<number> {
    let processed = 0;
    for (;;) {
      const launched = await this.#claim();
      if (launched.length === 0) break;
      await Promise.allSettled(launched);
      processed += launched.length;
    }
    return processed;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  async #save(job: Job): Promise<void> {
    const ttl = job.state === "completed" && this.#keepCompletedSec > 0 ? this.#keepCompletedSec : undefined;
    await this.#kv.set(JOB_PREFIX + job.id, JSON.stringify(job), ttl ? { ttl } : undefined);
    if (job.state === "completed" && this.#keepCompletedSec === 0) await this.#kv.delete(JOB_PREFIX + job.id);
  }

  /** One poll: claim up to the free slots and launch them (tracked in #active). */
  async #tick(): Promise<void> {
    if (this.#ticking) return;
    this.#ticking = true;
    try {
      const launched = await this.#claim();
      for (const p of launched) {
        this.#active.add(p);
        void p.finally(() => this.#active.delete(p));
      }
    } finally {
      this.#ticking = false;
    }
  }

  /** Claim eligible jobs up to the free concurrency budget; return their run promises. */
  async #claim(): Promise<Promise<void>[]> {
    const free = this.#concurrency - this.#active.size;
    if (free <= 0) return [];
    const now = this.#now();
    const due = (await this.list("waiting")).filter((j) => j.runAt <= now).slice(0, free);
    const runs: Promise<void>[] = [];
    for (const job of due) {
      // Lease the job: the first worker to `incr` to 1 owns this attempt. The
      // lease auto-expires (visibility timeout) so a crashed worker's job frees up.
      let won = false;
      try {
        won = (await this.#kv.incr(LOCK_PREFIX + job.id, { ttl: this.#visibilitySec })) === 1;
      } catch {
        won = false;
      }
      if (!won) continue;
      runs.push(this.#run(job));
    }
    return runs;
  }

  async #run(job: Job): Promise<void> {
    job.state = "active";
    job.attempts += 1;
    job.updatedAt = this.#now();
    await this.#save(job);
    const handler = this.#handlers.get(job.name);
    try {
      if (!handler) throw new Error(`no handler registered for job "${job.name}"`);
      await handler(job.payload, job);
      job.state = "completed";
      job.error = undefined;
      job.updatedAt = this.#now();
      await this.#save(job);
    } catch (err) {
      job.error = err instanceof Error ? err.message : String(err);
      job.updatedAt = this.#now();
      if (job.attempts < job.maxAttempts) {
        job.state = "waiting";
        job.runAt = this.#now() + this.#backoff(job.attempts);
      } else {
        job.state = "failed"; // dead-letter
      }
      await this.#save(job);
      this.#onError?.(err, job);
    } finally {
      await this.#kv.delete(LOCK_PREFIX + job.id); // release the lease
    }
  }
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

export interface QueuePluginOptions {
  /** Internal route prefix (default `"/__queue"`). */
  basePath?: string;
  /** Mount the devtools introspection + control routes (default true). */
  exposeDevtools?: boolean;
  /** Max jobs returned by the `/jobs` route + `inspect()` (default 100). */
  inspectLimit?: number;
}

/** The `inspect()` payload — devtools detects the queue by `kind === "queue"`. */
export interface QueueInspect {
  kind: "queue";
  concurrency: number;
  stats: QueueStats;
  jobs: Job[];
  endpoints: { jobs: string; stats: string; enqueue: string; retry: string; remove: string };
}

/**
 * Mount a {@link Queue} as a ServerPlugin: starts its workers on listen, drains
 * on shutdown, exposes control routes and an `inspect()` for the devtools Queue
 * tab. Register handlers on the queue before mounting.
 */
export function queue(q: Queue, opts: QueuePluginOptions = {}): ServerPlugin & { queue: Queue } {
  const basePath = (opts.basePath ?? "/__queue").replace(/\/$/, "");
  const limit = opts.inspectLimit ?? 100;
  const endpoints = {
    jobs: `${basePath}/jobs`,
    stats: `${basePath}/stats`,
    enqueue: `${basePath}/enqueue`,
    retry: `${basePath}/retry`,
    remove: `${basePath}/remove`,
  };

  return {
    name: "queue",
    queue: q,
    setup(app) {
      if (opts.exposeDevtools === false) return;
      app.get(endpoints.jobs, async (ctx: Context) => {
        const state = (ctx.query?.state as JobState | undefined) || undefined;
        const jobs = (await q.list(state)).slice(0, limit);
        return Response.json({ jobs });
      });
      app.get(endpoints.stats, async () => Response.json(await q.stats()));
      app.post(endpoints.enqueue, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { name?: string; payload?: unknown; delayMs?: number };
        if (!body.name) return Response.json({ error: "name is required" }, { status: 400 });
        const job = await q.add(body.name, body.payload, { delayMs: body.delayMs });
        return Response.json({ ok: true, job });
      });
      app.post(endpoints.retry, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { id?: string };
        if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
        return Response.json({ ok: await q.retry(body.id) });
      });
      app.post(endpoints.remove, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { id?: string };
        if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
        await q.remove(body.id);
        return Response.json({ ok: true });
      });
    },
    onListen() {
      q.start();
    },
    async onShutdown() {
      await q.stop();
    },
    inspect(): QueueInspect {
      // `inspect()` is sync (topology never awaits it) but the counts + jobs live
      // in the (possibly remote) KV store — so this returns config + endpoints and
      // the devtools panel fetches live `stats`/`jobs` over the routes below.
      return {
        kind: "queue",
        concurrency: q.concurrency,
        stats: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0 },
        jobs: [],
        endpoints,
      };
    },
  };
}

/** Convenience: build a {@link Queue} (and optionally register it as a plugin). */
export function createQueue(opts?: QueueOptions): Queue {
  return new Queue(opts);
}
