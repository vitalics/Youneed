/** Immutable level (survives a format rewriting `info.level`, e.g. colorize). */
export declare const LEVEL: unique symbol;
/** The final rendered string a transport writes. */
export declare const MESSAGE: unique symbol;
/** The log record threaded through formats and into transports. */
export interface TransformableInfo {
    level: string;
    message: unknown;
    [key: string]: unknown;
    [LEVEL]?: string;
    [MESSAGE]?: string;
}
/** Default npm levels (lower number = higher severity). */
export declare const NPM_LEVELS: Record<string, number>;
export interface Format {
    transform(info: TransformableInfo): TransformableInfo | false;
}
type FormatFn = (info: TransformableInfo) => TransformableInfo | false;
/** Winston-style `format` — a callable factory (`format(fn)`) that also exposes the
 *  built-in combinators as properties (`format.json()`, `format.combine(...)`, …). */
export interface FormatApi {
    (fn: FormatFn): () => Format;
    combine(...formats: Format[]): Format;
    timestamp(opts?: {
        key?: string;
        format?: () => string;
    }): Format;
    label(opts: {
        label: string;
        message?: boolean;
    }): Format;
    json(opts?: {
        space?: number;
    }): Format;
    simple(): Format;
    printf(fn: (info: TransformableInfo) => string): Format;
    colorize(opts?: {
        level?: boolean;
    }): Format;
    redact(keys?: string[], opts?: {
        replacement?: string;
    }): Format;
}
export declare const format: FormatApi;
export interface LogTransport {
    level?: string;
    format?: Format;
    log(info: TransformableInfo, next?: () => void): void;
    /** Release any resources (flush buffers, close files/sockets). Optional — a
     *  transport with nothing to release omits it. May be sync or async. */
    close?(): void | Promise<void>;
    /** TC39 explicit resource management — supports `using` / `await using`. */
    [Symbol.dispose]?(): void;
    [Symbol.asyncDispose]?(): Promise<void>;
}
export interface TransportOptions {
    level?: string;
    format?: Format;
}
/** Base class to extend for a custom destination. Override `log`; if the
 *  transport owns a resource (file handle, socket, buffer) override `close()`
 *  too — the base wires `close()` to both `Symbol.dispose` (fire-and-forget)
 *  and `Symbol.asyncDispose` (awaited), so subclasses get `using` / `await
 *  using` support for free. */
export declare abstract class Transport implements LogTransport, Disposable, AsyncDisposable {
    level?: string;
    format?: Format;
    constructor(opts?: TransportOptions);
    abstract log(info: TransformableInfo, next?: () => void): void;
    /** Release resources. Default no-op; override when the transport owns one. */
    close(): void | Promise<void>;
    [Symbol.dispose](): void;
    [Symbol.asyncDispose](): Promise<void>;
}
/** Functional shorthand for an ad-hoc transport. Pass `close` to clean up under
 *  `using` / `logger.close()`; the disposal symbols are wired automatically. */
export declare function createTransport(opts: TransportOptions & {
    log: (info: TransformableInfo, next?: () => void) => void;
    close?: () => void | Promise<void>;
}): LogTransport;
/** The final string a transport writes — exported so companion transport
 *  packages render records identically to the built-ins. */
export declare const rendered: (info: TransformableInfo) => string;
/** The effective level used for routing — `LEVEL` symbol wins over `info.level`
 *  (which colorize may have rewritten). Exported for companion transports. */
export declare const levelOf: (info: TransformableInfo) => string;
/** Minimal structural Writable — anything with a string-accepting `write`.
 *  Node's `WritableStream`, a custom sink, or a test double all satisfy it,
 *  without dragging in `NodeJS.*` typings (keeps the core DOM-safe). */
export interface WritableLike {
    write(chunk: string): unknown;
}
/** A `console` surface — the platform global in every JS runtime (browser,
 *  Node, workers, Deno, edge). Only the methods we route to are required. */
export interface ConsoleLike {
    log(...args: unknown[]): void;
    info?(...args: unknown[]): void;
    warn?(...args: unknown[]): void;
    error?(...args: unknown[]): void;
    debug?(...args: unknown[]): void;
}
/** Whether ANSI color should be emitted, decided from the environment without a
 *  static Node dependency (feature-detected via `globalThis`, so the core stays
 *  DOM-safe). Honors the de-facto conventions: `NO_COLOR` disables (any value),
 *  `FORCE_COLOR` enables (unless `0`), otherwise on only when stdout is a TTY.
 *  In the browser/edge (no `process`) ANSI isn't rendered, so it returns false. */
export declare function supportsColor(): boolean;
/** Universal default destination: writes via the `console` global, so the same
 *  logger works in the browser/DOM, SSR/SSG, the server, workers and the edge.
 *  Levels route to the matching `console` method (and thus the right stream and
 *  devtools styling): error→error, warn→warn, info/http→info,
 *  debug/verbose/silly→debug, everything else→log. Pass `{ console }` to target
 *  a custom surface; the runtime `globalThis.console` is the default. */
export declare class ConsoleTransport extends Transport {
    #private;
    constructor(opts?: TransportOptions & {
        console?: ConsoleLike;
        color?: boolean | "auto";
    });
    log(info: TransformableInfo, next?: () => void): void;
}
/** Writes the rendered line (newline-terminated) to any `WritableLike` sink —
 *  e.g. a Node stream, a string accumulator, or a custom buffer. */
export declare class StreamTransport extends Transport {
    #private;
    constructor(opts: TransportOptions & {
        stream: WritableLike;
    });
    log(info: TransformableInfo, next?: () => void): void;
}
/** A cross-cutting extension installed once on a logger — for concerns that
 *  aren't a single transport or format: enriching every record with default
 *  fields, wiring process-level error handlers, sampling, etc. `install` runs at
 *  registration; anything it returns (a `Disposable`/`AsyncDisposable`) is torn
 *  down with the logger on `close()`. Ship reusable plugins as
 *  `@youneed/logger-plugin-<name>`, mirroring the transport packages. */
export interface LoggerPlugin {
    name: string;
    install(logger: Logger): void | Disposable | AsyncDisposable;
}
export interface Logger extends Disposable, AsyncDisposable {
    error(message: unknown, meta?: Record<string, unknown>): Logger;
    warn(message: unknown, meta?: Record<string, unknown>): Logger;
    info(message: unknown, meta?: Record<string, unknown>): Logger;
    http(message: unknown, meta?: Record<string, unknown>): Logger;
    verbose(message: unknown, meta?: Record<string, unknown>): Logger;
    debug(message: unknown, meta?: Record<string, unknown>): Logger;
    silly(message: unknown, meta?: Record<string, unknown>): Logger;
    log(level: string, message: unknown, meta?: Record<string, unknown>): Logger;
    child(meta: Record<string, unknown>): Logger;
    add(transport: LogTransport): Logger;
    remove(transport: LogTransport): Logger;
    clear(): Logger;
    /** Install a plugin now (the constructor's `plugins` option does this for you). */
    use(plugin: LoggerPlugin): Logger;
    /** Merge fields into the default meta stamped on every record (and inherited
     *  by future children). Per-call meta still wins. Plugins use this to enrich. */
    defaults(meta: Record<string, unknown>): Logger;
    /** Prepend a format to the pipeline so it runs *before* the existing one — so
     *  a field it adds is still present when a serializing format (`json`, …) runs.
     *  Plugins use this to inject per-record data (call site, correlation id, …). */
    useFormat(format: Format): Logger;
    /** Dispose every transport (await async ones) and detach them, and tear down
     *  installed plugins. Idempotent — a second call is a no-op. Children share
     *  their parent's transports, so close the root logger; closing a child tears
     *  down the shared destinations. */
    close(): Promise<void>;
    level: string;
    readonly transports: LogTransport[];
}
export interface LoggerOptions {
    level?: string;
    levels?: Record<string, number>;
    format?: Format;
    defaultMeta?: Record<string, unknown>;
    transports?: LogTransport[];
    /** Plugins installed (in order) once the logger is constructed. */
    plugins?: LoggerPlugin[];
}
export declare function createLogger(opts?: LoggerOptions): Logger;
export {};
