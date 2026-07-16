// ── @youneed/http-client — resilient outbound HTTP over the global `fetch` ─────
//
// A zero-dependency, universal (Node ≥ 18 / Deno / Bun / browser) wrapper around
// `fetch` that adds the three things every real outbound call needs:
//
//   • a per-request TIMEOUT     (AbortController, composed with the caller's signal)
//   • RETRY with backoff+jitter (honors `Retry-After`, idempotent-only by default)
//   • a CIRCUIT BREAKER         (fail fast while a dependency is down)
//
// `createClient()` returns a callable that is a drop-in for `fetch`, with extra
// `.get/.post/.put/.patch/.delete` helpers and a `.breaker` for introspection.
// Everything non-deterministic (clock, jitter, sleep, even `fetch` itself) is
// injectable so the behaviour is fully testable without touching the network.

/** Thrown when an attempt exceeds its timeout (and the caller didn't abort). */
export class TimeoutError extends Error {
  constructor(message = "request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Thrown by the circuit breaker when it's OPEN — fetch is NOT called. */
export class CircuitOpenError extends Error {
  constructor(message = "circuit breaker is open") {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export type CircuitState = "closed" | "open" | "half-open";

// ── Circuit breaker ───────────────────────────────────────────────────────────

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker OPEN (default 5). */
  failureThreshold?: number;
  /** How long (ms) to stay OPEN before allowing a half-open trial (default 30000). */
  resetTimeout?: number;
  /** Clock in epoch ms (default `Date.now`). Injectable for tests. */
  now?: () => number;
}

/** A standalone circuit breaker. Wrap any async fn with {@link exec}: while OPEN
 *  it fails fast with {@link CircuitOpenError} without invoking the fn. */
export class CircuitBreaker {
  #failures = 0;
  #state: CircuitState = "closed";
  /** Epoch ms at which an OPEN breaker may attempt a half-open trial. */
  #openedUntil = 0;
  readonly #threshold: number;
  readonly #resetTimeout: number;
  readonly #now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.#threshold = opts.failureThreshold ?? 5;
    this.#resetTimeout = opts.resetTimeout ?? 30_000;
    this.#now = opts.now ?? (() => Date.now());
  }

  /** Current state, lazily transitioning OPEN → half-open once the cooldown elapses. */
  get state(): CircuitState {
    if (this.#state === "open" && this.#now() >= this.#openedUntil) {
      this.#state = "half-open";
    }
    return this.#state;
  }

  /** Force the breaker back to CLOSED and clear the failure count. */
  reset(): void {
    this.#failures = 0;
    this.#state = "closed";
    this.#openedUntil = 0;
  }

  /** Run `fn` through the breaker. In OPEN state throws {@link CircuitOpenError}
   *  without calling `fn`. A resolved value (or `isFailure(value) === false`)
   *  counts as success; a thrown error (or `isFailure(value) === true`) as failure. */
  async exec<T>(fn: () => Promise<T>, isFailure?: (value: T) => boolean): Promise<T> {
    if (this.state === "open") throw new CircuitOpenError();
    try {
      const value = await fn();
      if (isFailure?.(value)) this.#onFailure();
      else this.#onSuccess();
      return value;
    } catch (err) {
      this.#onFailure();
      throw err;
    }
  }

  #onSuccess(): void {
    this.#failures = 0;
    this.#state = "closed";
    this.#openedUntil = 0;
  }

  #onFailure(): void {
    this.#failures++;
    // A failed half-open trial, or hitting the threshold while closed, opens us.
    if (this.#state === "half-open" || this.#failures >= this.#threshold) {
      this.#state = "open";
      this.#openedUntil = this.#now() + this.#resetTimeout;
    }
  }
}

// ── Client ──────────────────────────────────────────────────────────────────

/** Info passed to a custom retry decision. */
export interface RetryInfo {
  /** The thrown error, if the attempt rejected. */
  error?: unknown;
  /** The response, if the attempt resolved. */
  response?: Response;
  /** Zero-based attempt index that just completed. */
  attempt: number;
}

export interface ClientOptions {
  /** Per-attempt timeout in ms (default 10000). `0` disables the timeout. */
  timeout?: number;
  /** Max retries AFTER the first attempt (default 2 → up to 3 attempts total). */
  retries?: number;
  /** Base backoff in ms; delay = min(maxBackoff, base * 2^attempt) (default 200). */
  backoff?: number;
  /** Upper bound on a single backoff delay in ms (default 10000). */
  maxBackoff?: number;
  /** Response statuses that trigger a retry (default [408,429,500,502,503,504]). */
  retryStatuses?: number[];
  /** Methods eligible for retry (default GET/HEAD/PUT/DELETE/OPTIONS — idempotent). */
  retryMethods?: string[];
  /** Retry non-idempotent methods too (POST/PATCH). Overrides the default safe set. */
  retryNonIdempotent?: boolean;
  /** Custom retry decision; when provided it fully replaces the default logic. */
  retryOn?: (info: RetryInfo) => boolean;
  /** Decide if a settled attempt counts as a breaker failure (default: retryable). */
  isFailure?: (info: RetryInfo) => boolean;
  /** Consecutive failures to trip the breaker OPEN (default 5). */
  failureThreshold?: number;
  /** Cooldown (ms) before a tripped breaker tries half-open (default 30000). */
  resetTimeout?: number;
  /** Derive a breaker key per request (e.g. per host). Omit for one shared breaker. */
  breakerKey?: (input: string | URL | Request) => string;
  /** The underlying fetch implementation (default global `fetch`). Injectable for tests. */
  fetch?: typeof fetch;
  /** Clock in epoch ms (default `Date.now`). Injectable for tests. */
  now?: () => number;
  /** Jitter source in [0,1) (default `Math.random`). Injectable for tests. */
  random?: () => number;
  /** Sleep `ms`, rejecting if `signal` aborts (default a real, abortable timer). */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** A callable resilient client — invoke like `fetch`, plus method helpers. */
export interface HttpClient {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
  get(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  post(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  put(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  patch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  delete(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** The circuit breaker (a representative one when keyed per-host). */
  readonly breaker: CircuitBreaker;
}

const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);
const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

/** Default real timer that rejects (with no value) if `signal` aborts first. */
function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Compose a caller signal with a fresh per-attempt timeout signal. Returns the
 *  combined signal and a cleanup to drop the timer + listeners. */
function withTimeout(timeout: number, caller?: AbortSignal | null): { signal: AbortSignal; cleanup: () => void } {
  if (!timeout || timeout <= 0) {
    return { signal: caller ?? new AbortController().signal, cleanup: () => {} };
  }
  const timeoutCtl = new AbortController();
  const timer = setTimeout(() => timeoutCtl.abort(new TimeoutError()), timeout);
  const cleanup = () => clearTimeout(timer);

  if (!caller) return { signal: timeoutCtl.signal, cleanup };

  // Prefer the native combinator when present.
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") {
    return { signal: anyFn([caller, timeoutCtl.signal]), cleanup };
  }

  // Fallback: manually mirror either signal into a combined controller.
  const combined = new AbortController();
  const onCaller = () => combined.abort(caller.reason);
  const onTimeout = () => combined.abort(timeoutCtl.signal.reason);
  if (caller.aborted) combined.abort(caller.reason);
  else if (timeoutCtl.signal.aborted) combined.abort(timeoutCtl.signal.reason);
  else {
    caller.addEventListener("abort", onCaller, { once: true });
    timeoutCtl.signal.addEventListener("abort", onTimeout, { once: true });
  }
  return {
    signal: combined.signal,
    cleanup: () => {
      cleanup();
      caller.removeEventListener("abort", onCaller);
      timeoutCtl.signal.removeEventListener("abort", onTimeout);
    },
  };
}

/** Parse a `Retry-After` header into ms relative to `now`, or `undefined`. */
function parseRetryAfter(response: Response | undefined, now: number): number | undefined {
  const raw = response?.headers.get("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/** Create a resilient HTTP client. See {@link ClientOptions}. */
export function createClient(opts: ClientOptions = {}): HttpClient {
  const timeout = opts.timeout ?? 10_000;
  const retries = opts.retries ?? 2;
  const base = opts.backoff ?? 200;
  const maxBackoff = opts.maxBackoff ?? 10_000;
  const retryStatuses = opts.retryStatuses ?? DEFAULT_RETRY_STATUSES;
  const retryStatusSet = new Set(retryStatuses);
  const fetchImpl = opts.fetch ?? fetch;
  const now = opts.now ?? (() => Date.now());
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? realSleep;

  const retryMethods = new Set(
    (opts.retryMethods ?? (opts.retryNonIdempotent ? [...IDEMPOTENT, "POST", "PATCH"] : [...IDEMPOTENT])).map((m) =>
      m.toUpperCase(),
    ),
  );

  // One breaker per key (or a single shared one).
  const breakers = new Map<string, CircuitBreaker>();
  const newBreaker = () =>
    new CircuitBreaker({ failureThreshold: opts.failureThreshold, resetTimeout: opts.resetTimeout, now });
  const sharedBreaker = newBreaker();
  const breakerFor = (input: string | URL | Request): CircuitBreaker => {
    if (!opts.breakerKey) return sharedBreaker;
    const key = opts.breakerKey(input);
    let b = breakers.get(key);
    if (!b) breakers.set(key, (b = newBreaker()));
    return b;
  };

  /** Default per-attempt retry decision (used when `opts.retryOn` is absent). */
  const defaultShouldRetry = (info: RetryInfo): boolean => {
    if (info.error !== undefined) return true; // network error / timeout
    if (info.response) return retryStatusSet.has(info.response.status);
    return false;
  };
  const shouldRetry = opts.retryOn ?? defaultShouldRetry;

  /** Default breaker-failure decision: a retryable outcome is a failure. */
  const isFailure =
    opts.isFailure ??
    ((info: RetryInfo): boolean => {
      if (info.error !== undefined) return true;
      if (info.response) return retryStatusSet.has(info.response.status) || info.response.status >= 500;
      return false;
    });

  const methodOf = (input: string | URL | Request, init?: RequestInit): string =>
    (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

  /** Run the full retry sequence for one logical request. */
  async function attemptSequence(input: string | URL | Request, init: RequestInit | undefined): Promise<Response> {
    const method = methodOf(input, init);
    const methodRetryable = retryMethods.has(method);
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const perCallTimeout = (init as RequestInit & { timeout?: number } | undefined)?.timeout ?? timeout;

    let lastResponse: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      // Caller may have aborted between retries.
      if (callerSignal?.aborted) throw callerSignal.reason ?? new Error("aborted");

      const { signal, cleanup } = withTimeout(perCallTimeout, callerSignal);
      let response: Response | undefined;
      let error: unknown;
      try {
        response = await fetchImpl(input, { ...init, signal });
      } catch (err) {
        // Distinguish "our timeout fired" from "the caller aborted".
        if (signal.reason instanceof TimeoutError && !callerSignal?.aborted) {
          error = signal.reason;
        } else if (callerSignal?.aborted) {
          cleanup();
          throw callerSignal.reason ?? err;
        } else {
          error = err;
        }
      } finally {
        cleanup();
      }

      const info: RetryInfo = { error, response, attempt };
      lastResponse = response;
      lastError = error;

      const isLast = attempt >= retries;
      const wantRetry = methodRetryable && !isLast && shouldRetry(info);
      if (!wantRetry) {
        if (error !== undefined) throw error;
        return response!;
      }

      // Backoff before the next attempt (full jitter), honoring Retry-After.
      const computed = Math.min(maxBackoff, base * 2 ** attempt);
      let delay = random() * computed;
      const retryAfter = parseRetryAfter(response, now());
      if (retryAfter !== undefined && retryAfter > delay) delay = retryAfter;

      try {
        await sleep(delay, callerSignal ?? undefined);
      } catch (e) {
        // Caller aborted while we were waiting → stop and surface the abort.
        throw callerSignal?.reason ?? e;
      }
    }

    // Loop exhausted (only reachable when the last attempt resolved & wasn't returned).
    if (lastError !== undefined) throw lastError;
    return lastResponse!;
  }

  const run = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const breaker = breakerFor(input);
    return breaker.exec(
      () => attemptSequence(input, init),
      // A breaker failure is decided on the FINAL response of the sequence.
      (response) => isFailure({ response, attempt: retries }),
    );
  };

  const client = run as HttpClient;
  const withMethod =
    (method: string) =>
    (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      run(input, { ...init, method });

  client.get = withMethod("GET");
  client.post = withMethod("POST");
  client.put = withMethod("PUT");
  client.patch = withMethod("PATCH");
  client.delete = withMethod("DELETE");
  Object.defineProperty(client, "breaker", { value: sharedBreaker, enumerable: true });

  return client;
}
