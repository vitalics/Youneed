// The built-in `@youneed/dom` audit for @youneed/ts-plugin. Contributes editor
// diagnostics over a component's html``/css`` templates:
//
//   • bindings  — `.prop` / `@event` on a known component that isn't part of its
//                 declared surface (the type-safe-binding check; on by default);
//   • unusedCss — a class selector defined in css`` that's never referenced anywhere
//                 in the file (opt-in).
//
// The `preview` option (hover screenshots) is read by the plugin CORE, not here —
// hover isn't a diagnostic — so this module ignores it.
import type { Audit, AuditDiagnostic, AuditFactory, AuditSeverity } from "../audit.ts";
import { checkBindings } from "../html.ts";
import { cssClassSelectors, stringLiteralTokens } from "../css-usage.ts";

interface ToggleKind {
  enabled?: boolean;
  kind?: AuditSeverity;
}

interface DomAuditOptions {
  /** Type-safe `.prop` / `@event` bindings (default on; prop=error, event=warning). */
  bindings?: { enabled?: boolean; propKind?: AuditSeverity; eventKind?: AuditSeverity };
  /** Flag css`` class selectors never referenced in the file (default off). */
  unusedCss?: ToggleKind;
  /** Consumed by the plugin core (hover previews) — ignored by the audit. */
  preview?: unknown;
}

const CODE_UNKNOWN_PROP = 990001;
const CODE_UNKNOWN_EVENT = 990002;
const CODE_UNUSED_CSS = 990003;

const domAudit: AuditFactory = (options) => {
  const opts = (options ?? {}) as DomAuditOptions;
  const bindings = opts.bindings ?? {};
  const bindingsEnabled = bindings.enabled !== false;
  const propKind: AuditSeverity = bindings.propKind ?? "error";
  const eventKind: AuditSeverity = bindings.eventKind ?? "warning";
  const unusedCssEnabled = opts.unusedCss?.enabled === true;
  const unusedKind: AuditSeverity = opts.unusedCss?.kind ?? "warning";

  const audit: Audit = {
    name: "dom",
    diagnostics(ctx) {
      const out: AuditDiagnostic[] = [];
      const templates = ctx.templates();

      // ── type-safe bindings ──
      if (bindingsEnabled) {
        const index = ctx.componentIndex();
        for (const tpl of templates) {
          if (tpl.kind !== "html") continue;
          for (const d of checkBindings(tpl.raw, tpl.base, index)) {
            out.push({
              start: d.start,
              length: d.length,
              messageText: d.messageText,
              severity: d.kind === "prop" ? propKind : eventKind,
              code: d.kind === "prop" ? CODE_UNKNOWN_PROP : CODE_UNKNOWN_EVENT,
            });
          }
        }
      }

      // ── unused css classes ──
      if (unusedCssEnabled) {
        const css = templates.filter((t) => t.kind === "css");
        if (css.length) {
          // Exclude the css`` templates themselves so a class's definition doesn't
          // count as a use. `base` is the template-content start; widen by 1 to also
          // cover the opening backtick of the literal node.
          const skip = css.map((t) => ({ start: t.base - 1, end: t.base + t.raw.length + 1 }));
          const used = stringLiteralTokens(ctx.ts, ctx.sourceFile, skip);
          for (const tpl of css) {
            const seen = new Set<string>();
            for (const sel of cssClassSelectors(tpl.raw)) {
              if (seen.has(sel.name)) continue; // report each class once
              seen.add(sel.name);
              if (!used.has(sel.name)) {
                out.push({
                  start: tpl.base + sel.start,
                  length: sel.name.length,
                  messageText: `CSS class '.${sel.name}' is defined but never used in this file.`,
                  severity: unusedKind,
                  code: CODE_UNUSED_CSS,
                });
              }
            }
          }
        }
      }

      return out;
    },
  };
  return audit;
};

export default domAudit;
