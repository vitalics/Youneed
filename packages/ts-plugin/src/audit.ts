// The audit contract — the extension point that lets a package contribute editor
// diagnostics to @youneed/ts-plugin. An audit MODULE default-exports an
// `AuditFactory`: given its per-audit options, it returns one or more `Audit`s.
// The plugin loads the modules listed under the `audits` tsconfig option:
//
//   "plugins": [{
//     "name": "@youneed/ts-plugin",
//     "audits": [
//       ["@youneed/ts-plugin/dom", { "unusedCss": { "enabled": true, "kind": "error" } }],
//       ["@youneed/dom-provider-a11y/ts-plugin", { "reduceMotion": { "kind": "warning" } }]
//     ]
//   }]
//
// Each audit's `diagnostics(ctx)` runs per file inside `getSemanticDiagnostics`,
// and its findings are merged into the editor's squiggles. Audits get the plugin's
// own pure helpers (component index, template scanner) via `ctx`, so they don't
// re-implement scanning — and they pick the severity, so the SAME check can be an
// error in one project and a warning in another.
import type * as ts from "typescript";
import type { ComponentIndex } from "./component-index.ts";
import type { TemplateText } from "./template.ts";

/** How serious a finding is. `"none"` silences it (the check still runs, e.g. for
 *  a future `--fix`, but emits nothing). Maps to a `ts.DiagnosticCategory`. */
export type AuditSeverity = "error" | "warning" | "suggestion" | "none";

/** One finding an audit reports against the current file. Offsets are file-relative. */
export interface AuditDiagnostic {
  start: number;
  length: number;
  messageText: string;
  severity: AuditSeverity;
  /** Optional custom diagnostic code; the host assigns a default if omitted. */
  code?: number;
}

/** Per-file context handed to an audit — the program slice plus the plugin's
 *  cached helpers, so an audit reads structured data instead of re-parsing. */
export interface AuditContext {
  ts: typeof ts;
  program: ts.Program;
  sourceFile: ts.SourceFile;
  /** Tag→component index for the whole program (cached per Program by the host). */
  componentIndex(): ComponentIndex;
  /** Every html``/css`` tagged template in THIS file (raw text + base offset). */
  templates(): TemplateText[];
  /** Append a line to the TS Server log (prefixed by the host). */
  log(message: string): void;
}

/** A loaded audit. `name` is for logging; `diagnostics` is the per-file check. */
export interface Audit {
  name: string;
  diagnostics?(ctx: AuditContext): AuditDiagnostic[] | undefined;
}

/** An audit module's export — a factory from its options to one or many audits.
 *  Returning `undefined` (or an empty array) contributes nothing (e.g. disabled). */
export type AuditFactory = (options?: unknown) => Audit | Audit[] | undefined;

/** A tsconfig `audits` entry: `[moduleSpecifier, options?]` (a bare string is
 *  also accepted as `[specifier]`). */
export type AuditEntry = string | [specifier: string, options?: unknown];

/** Map an audit severity to a TS diagnostic category, or `undefined` for "none". */
export function severityToCategory(tsm: typeof ts, severity: AuditSeverity): ts.DiagnosticCategory | undefined {
  switch (severity) {
    case "error":
      return tsm.DiagnosticCategory.Error;
    case "warning":
      return tsm.DiagnosticCategory.Warning;
    case "suggestion":
      return tsm.DiagnosticCategory.Suggestion;
    default:
      return undefined; // "none" → don't surface
  }
}
