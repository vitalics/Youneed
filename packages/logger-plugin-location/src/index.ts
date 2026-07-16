// ── @youneed/logger-plugin-location — stamp the call site on each record ─────
//
// Adds where a log was emitted from — `file:line:column` — to every record, e.g.
//
//   [2026-06-22T15:36:00Z] app.ts:24:7 starting up
//
// Capturing the call site means reading a stack trace at log time, which is a
// per-record concern — so the mechanism is a `Format` (`location()`), and the
// plugin (`locationPlugin()`) just prepends it via `logger.useFormat(...)` so the
// `location` field is present before a serializing format (`json`) renders.
//
// Stack inspection uses V8's `Error.prepareStackTrace` / `captureStackTrace`
// (Node, Chromium). On engines without it the field is simply omitted.

import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Format, LoggerPlugin, TransformableInfo } from "@youneed/logger";

export interface LocationOptions {
  /** Record field to write. Default `"location"`. */
  key?: string;
  /** Base directory for relative paths. Default `process.cwd()`. */
  root?: string;
  /** Emit a path relative to `root` (vs. absolute). Default `true`. */
  relative?: boolean;
  /** Include `:column`. Default `true`. */
  column?: boolean;
  /** Prepend `"file:line:col "` to the message instead of adding a field. Default `false`. */
  message?: boolean;
  /** Frames whose filename matches are treated as logger internals and skipped.
   *  Default matches the `@youneed/logger` core (but not sibling packages). */
  internal?: RegExp;
}

// Matches the logger *core* — `@youneed/logger/…` (published) or `packages/logger/…`
// (monorepo) — the trailing slash after `logger` excludes `logger-plugin-*` etc.
const DEFAULT_INTERNAL = /[\\/](?:@youneed[\\/]logger|packages[\\/]logger)[\\/]/;

// This module's own file — its `transform`/`callsite` frames must be skipped too.
const SELF = fileURLToPath(import.meta.url);

interface Site {
  file: string;
  line: number;
  column: number;
}

const toPath = (file: string): string => (file.startsWith("file://") ? fileURLToPath(file) : file);

/** Walk the stack and return the first frame outside this module and the logger
 *  core. Returns `undefined` on non-V8 engines or if no user frame is found. */
function callsite(internal: RegExp): Site | undefined {
  const capture = Error.captureStackTrace;
  if (typeof capture !== "function") return undefined;
  const orig = Error.prepareStackTrace;
  Error.prepareStackTrace = (_err, stack) => stack;
  const holder: { stack?: unknown } = {};
  capture(holder, callsite); // drop `callsite` and the Error machinery above it
  const frames = holder.stack as NodeJS.CallSite[] | undefined;
  Error.prepareStackTrace = orig;
  if (!Array.isArray(frames)) return undefined;
  for (const f of frames) {
    const raw = f.getFileName?.();
    if (!raw) continue;
    const file = toPath(raw);
    if (file.startsWith("node:") || file === SELF || internal.test(file)) continue;
    return { file, line: f.getLineNumber?.() ?? 0, column: f.getColumnNumber?.() ?? 0 };
  }
  return undefined;
}

function format(site: Site, opts: LocationOptions): string {
  const path = opts.relative === false ? site.file : relative(opts.root ?? process.cwd(), site.file) || site.file;
  return opts.column === false ? `${path}:${site.line}` : `${path}:${site.line}:${site.column}`;
}

/** A `Format` that adds the call site to each record. Place it before a
 *  serializing format: `format.combine(location(), timestamp(), json())`. */
export function location(opts: LocationOptions = {}): Format {
  const key = opts.key ?? "location";
  const internal = opts.internal ?? DEFAULT_INTERNAL;
  return {
    transform(info: TransformableInfo) {
      const site = callsite(internal);
      if (site) {
        const loc = format(site, opts);
        if (opts.message) info.message = `${loc} ${String(info.message)}`;
        else info[key] = loc;
      }
      return info;
    },
  };
}

/** Plugin: prepend the `location()` format so every record carries its call site. */
export function locationPlugin(opts: LocationOptions = {}): LoggerPlugin {
  return { name: "location", install: (logger) => void logger.useFormat(location(opts)) };
}
