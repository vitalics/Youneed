// ── @youneed/logger — a Winston-style structured logger (zero runtime deps) ────
//
// Universal core: this module touches NO Node-only API (no `node:fs`, no
// `process`), so the same bundle runs unchanged in the browser/DOM, in SSR/SSG,
// on the server, in workers and at the edge. The only built-in destination is a
// `ConsoleTransport` backed by the universal `console` global. Environment-
// specific destinations (Node `process.stdout`, files, HTTP/beacon shipping)
// live in companion packages — `@youneed/logger-transport-<name>` — exactly as
// server middleware lives in `@youneed/server-middleware-<name>`.
//
// Two extension points, like Winston:
//   • transports — pluggable destinations (console, stream, or your own).
//     Each may carry its own `level` and `format`. `logger.add(...)` appends one.
//   • formats — composable transforms over the log record (`combine`, `json`,
//     `timestamp`, `printf`, `colorize`, `redact`, …). `format.json()` etc.
//
// The record (`TransformableInfo`) flows: build → logger.format → per transport:
// transport.format → transport.log. The well-known symbols `LEVEL`/`MESSAGE`
// (Symbol.for, so they interoperate with Winston/triple-beam) carry the immutable
// level used for filtering and the final rendered output string.
/** Immutable level (survives a format rewriting `info.level`, e.g. colorize). */
export const LEVEL = Symbol.for("level");
/** The final rendered string a transport writes. */
export const MESSAGE = Symbol.for("message");
/** Default npm levels (lower number = higher severity). */
export const NPM_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
};
// Everything on the record except `level`/`message` (the symbols are non-string
// keys, so Object.keys already skips them) — i.e. the user meta.
function meta(info) {
    const out = {};
    for (const k of Object.keys(info)) {
        if (k === "level" || k === "message")
            continue;
        out[k] = info[k];
    }
    return out;
}
/** Wrap a transform function into a reusable `Format` factory (à la `winston.format`). */
function makeFormat(fn) {
    return () => ({ transform: fn });
}
function combine(...formats) {
    return {
        transform(info) {
            let cur = info;
            for (const f of formats) {
                if (cur === false)
                    return false;
                cur = f.transform(cur);
            }
            return cur;
        },
    };
}
function timestamp(opts = {}) {
    const key = opts.key ?? "timestamp";
    const fmt = opts.format ?? (() => new Date().toISOString());
    return {
        transform(info) {
            info[key] = fmt();
            return info;
        },
    };
}
function label(opts) {
    return {
        transform(info) {
            if (opts.message)
                info.message = `[${opts.label}] ${String(info.message)}`;
            else
                info.label = opts.label;
            return info;
        },
    };
}
function json(opts = {}) {
    return {
        transform(info) {
            info[MESSAGE] = JSON.stringify({ level: info.level, message: info.message, ...meta(info) }, undefined, opts.space);
            return info;
        },
    };
}
function simple() {
    return {
        transform(info) {
            const rest = meta(info);
            const tail = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
            info[MESSAGE] = `${info.level}: ${String(info.message)}${tail}`;
            return info;
        },
    };
}
function printf(fn) {
    return {
        transform(info) {
            info[MESSAGE] = fn(info);
            return info;
        },
    };
}
const COLORS = {
    error: "\x1b[31m",
    warn: "\x1b[33m",
    info: "\x1b[32m",
    http: "\x1b[35m",
    verbose: "\x1b[36m",
    debug: "\x1b[34m",
    silly: "\x1b[90m",
};
const RESET = "\x1b[0m";
function colorize(opts = {}) {
    const doLevel = opts.level !== false;
    return {
        transform(info) {
            const lvl = (info[LEVEL] ?? info.level);
            const color = COLORS[lvl];
            if (doLevel && color)
                info.level = `${color}${info.level}${RESET}`; // does NOT touch info[LEVEL]
            return info;
        },
    };
}
const DEFAULT_REDACT = [
    "authorization", "password", "passwd", "pwd", "token", "accesstoken",
    "refreshtoken", "cookie", "set-cookie", "secret", "apikey", "api_key", "x-api-key",
];
function redact(keys = [], opts = {}) {
    const set = new Set([...DEFAULT_REDACT, ...keys].map((k) => k.toLowerCase()));
    const mask = opts.replacement ?? "[REDACTED]";
    const walk = (val, seen) => {
        if (val === null || typeof val !== "object")
            return val;
        if (seen.has(val))
            return "[Circular]";
        seen.add(val);
        if (Array.isArray(val))
            return val.map((v) => walk(v, seen));
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            out[k] = set.has(k.toLowerCase()) ? mask : walk(v, seen);
        }
        return out;
    };
    return {
        transform(info) {
            const seen = new WeakSet();
            const masked = walk(meta(info), seen);
            // Rebuild the record, preserving level/message/symbols, with redacted meta.
            const next = { level: info.level, message: info.message, ...masked };
            next[LEVEL] = info[LEVEL];
            if (info[MESSAGE] !== undefined)
                next[MESSAGE] = info[MESSAGE];
            return next;
        },
    };
}
export const format = Object.assign(makeFormat, {
    combine,
    timestamp,
    label,
    json,
    simple,
    printf,
    colorize,
    redact,
});
/** Base class to extend for a custom destination. Override `log`; if the
 *  transport owns a resource (file handle, socket, buffer) override `close()`
 *  too — the base wires `close()` to both `Symbol.dispose` (fire-and-forget)
 *  and `Symbol.asyncDispose` (awaited), so subclasses get `using` / `await
 *  using` support for free. */
export class Transport {
    level;
    format;
    constructor(opts = {}) {
        this.level = opts.level;
        this.format = opts.format;
    }
    /** Release resources. Default no-op; override when the transport owns one. */
    close() { }
    [Symbol.dispose]() {
        void this.close();
    }
    [Symbol.asyncDispose]() {
        return Promise.resolve(this.close());
    }
}
/** Functional shorthand for an ad-hoc transport. Pass `close` to clean up under
 *  `using` / `logger.close()`; the disposal symbols are wired automatically. */
export function createTransport(opts) {
    const t = { level: opts.level, format: opts.format, log: opts.log };
    if (opts.close) {
        const close = opts.close;
        t.close = close;
        t[Symbol.dispose] = () => void close();
        t[Symbol.asyncDispose] = () => Promise.resolve(close());
    }
    return t;
}
/** The final string a transport writes — exported so companion transport
 *  packages render records identically to the built-ins. */
export const rendered = (info) => info[MESSAGE] !== undefined ? info[MESSAGE] : typeof info.message === "string" ? info.message : JSON.stringify(info.message);
/** The effective level used for routing — `LEVEL` symbol wins over `info.level`
 *  (which colorize may have rewritten). Exported for companion transports. */
export const levelOf = (info) => (info[LEVEL] ?? info.level);
/** Whether ANSI color should be emitted, decided from the environment without a
 *  static Node dependency (feature-detected via `globalThis`, so the core stays
 *  DOM-safe). Honors the de-facto conventions: `NO_COLOR` disables (any value),
 *  `FORCE_COLOR` enables (unless `0`), otherwise on only when stdout is a TTY.
 *  In the browser/edge (no `process`) ANSI isn't rendered, so it returns false. */
export function supportsColor() {
    const proc = globalThis.process;
    const env = proc?.env;
    if (env) {
        if (env.NO_COLOR !== undefined)
            return false;
        if (env.FORCE_COLOR !== undefined)
            return env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
    }
    return proc?.stdout?.isTTY === true;
}
/** Universal default destination: writes via the `console` global, so the same
 *  logger works in the browser/DOM, SSR/SSG, the server, workers and the edge.
 *  Levels route to the matching `console` method (and thus the right stream and
 *  devtools styling): error→error, warn→warn, info/http→info,
 *  debug/verbose/silly→debug, everything else→log. Pass `{ console }` to target
 *  a custom surface; the runtime `globalThis.console` is the default. */
export class ConsoleTransport extends Transport {
    #console;
    #color;
    constructor(opts = {}) {
        super(opts);
        this.#console = opts.console ?? globalThis.console;
        // `color` tints the whole rendered line by severity (best with `simple()` /
        // `printf` formats). "auto" (the default) detects TTY/NO_COLOR/FORCE_COLOR.
        this.#color = opts.color === undefined || opts.color === "auto" ? supportsColor() : opts.color;
    }
    log(info, next) {
        const c = this.#console;
        const lvl = levelOf(info);
        let line = rendered(info);
        if (this.#color) {
            const color = COLORS[lvl];
            if (color)
                line = color + line + RESET;
        }
        switch (lvl) {
            case "error":
                (c.error ?? c.log).call(c, line);
                break;
            case "warn":
                (c.warn ?? c.log).call(c, line);
                break;
            case "info":
            case "http":
                (c.info ?? c.log).call(c, line);
                break;
            case "debug":
            case "verbose":
            case "silly":
                (c.debug ?? c.log).call(c, line);
                break;
            default:
                c.log(line);
        }
        next?.();
    }
}
/** Writes the rendered line (newline-terminated) to any `WritableLike` sink —
 *  e.g. a Node stream, a string accumulator, or a custom buffer. */
export class StreamTransport extends Transport {
    #stream;
    constructor(opts) {
        super(opts);
        this.#stream = opts.stream;
    }
    log(info, next) {
        this.#stream.write(rendered(info) + "\n");
        next?.();
    }
}
// ── Logger ────────────────────────────────────────────────────────────────────
const LEVEL_METHODS = ["error", "warn", "info", "http", "verbose", "debug", "silly"];
class LoggerImpl {
    level;
    #levels;
    #format;
    #defaultMeta;
    #pluginDisposables = [];
    transports;
    constructor(opts = {}) {
        this.level = opts.level ?? "info";
        this.#levels = opts.levels ?? NPM_LEVELS;
        this.#format = opts.format ?? combine(timestamp(), json());
        // Copy so a plugin's `defaults()` never mutates the caller's object.
        this.#defaultMeta = { ...opts.defaultMeta };
        this.transports = opts.transports ?? [new ConsoleTransport()];
        // Install plugins last — `this` is fully constructed (transports/meta ready).
        if (opts.plugins)
            for (const p of opts.plugins)
                this.use(p);
    }
    // A record at `recordLevel` is enabled for a transport when its severity is at
    // least as high (numerically <=) as the effective threshold.
    #enabled(recordLevel, transportLevel) {
        const r = this.#levels[recordLevel];
        const t = this.#levels[transportLevel];
        if (r === undefined || t === undefined)
            return true;
        return r <= t;
    }
    log(level, message, meta = {}) {
        let info = { level, message, ...this.#defaultMeta, ...meta };
        info[LEVEL] = level;
        if (this.#format) {
            const out = this.#format.transform(info);
            if (out === false)
                return this;
            info = out;
        }
        for (const transport of this.transports) {
            const effective = transport.level ?? this.level;
            if (!this.#enabled(level, effective))
                continue;
            let clone = { ...info };
            clone[LEVEL] = info[LEVEL];
            if (info[MESSAGE] !== undefined)
                clone[MESSAGE] = info[MESSAGE];
            if (transport.format) {
                const out = transport.format.transform(clone);
                if (out === false)
                    continue;
                clone = out;
            }
            transport.log(clone);
        }
        return this;
    }
    child(meta) {
        return new LoggerImpl({
            level: this.level,
            levels: this.#levels,
            format: this.#format,
            defaultMeta: { ...this.#defaultMeta, ...meta },
            transports: this.transports, // share the same transport instances
        });
    }
    add(transport) {
        this.transports.push(transport);
        return this;
    }
    remove(transport) {
        const i = this.transports.indexOf(transport);
        if (i >= 0)
            this.transports.splice(i, 1);
        return this;
    }
    clear() {
        this.transports.length = 0;
        return this;
    }
    use(plugin) {
        const disposable = plugin.install(this);
        if (disposable)
            this.#pluginDisposables.push(disposable);
        return this;
    }
    defaults(meta) {
        Object.assign(this.#defaultMeta, meta);
        return this;
    }
    useFormat(format) {
        this.#format = this.#format ? combine(format, this.#format) : format;
        return this;
    }
    // `splice(0)` detaches every transport (and empties the array children share),
    // so disposal is idempotent and never runs a transport's cleanup twice. Plugins
    // are torn down first (e.g. to detach process handlers) before transports flush.
    async close() {
        const plugins = this.#pluginDisposables.splice(0);
        for (const d of plugins) {
            const asyncDispose = d[Symbol.asyncDispose];
            if (asyncDispose)
                await asyncDispose.call(d);
            else
                d[Symbol.dispose]?.();
        }
        const ts = this.transports.splice(0);
        for (const t of ts) {
            const asyncDispose = t[Symbol.asyncDispose];
            if (asyncDispose)
                await asyncDispose.call(t);
            else if (t.close)
                await t.close();
            else
                t[Symbol.dispose]?.();
        }
    }
    [Symbol.dispose]() {
        for (const d of this.#pluginDisposables.splice(0))
            d[Symbol.dispose]?.();
        const ts = this.transports.splice(0);
        for (const t of ts) {
            const dispose = t[Symbol.dispose];
            if (dispose)
                dispose.call(t);
            else
                void t.close?.();
        }
    }
    [Symbol.asyncDispose]() {
        return this.close();
    }
}
// Attach the per-level convenience methods (info/error/…) onto the prototype.
for (const name of LEVEL_METHODS) {
    LoggerImpl.prototype[name] = function (message, metaArg) {
        return this.log(name, message, metaArg);
    };
}
export function createLogger(opts = {}) {
    return new LoggerImpl(opts);
}
