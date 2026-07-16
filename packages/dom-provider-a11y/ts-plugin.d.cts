// Types for `@youneed/dom-provider-a11y/ts-plugin` (the audit ships as plain CJS in
// ts-plugin.cjs; this re-states the @youneed/ts-plugin audit contract it implements).
import type { Audit, AuditFactory, AuditSeverity } from "@youneed/ts-plugin/audit";

export type { Audit, AuditSeverity };

/** Per-check toggle + severity. */
export interface A11yAuditCheck {
  /** Run this check (default `true`). */
  enabled?: boolean;
  /** Severity of a finding (default `"warning"`). `"none"` silences it. */
  kind?: AuditSeverity;
}

export interface A11yTsPluginOptions {
  /** Flag motion with no `@media (prefers-reduced-motion: reduce)` variant.
   *  Accepts `reducedMotion` as an alias. */
  reduceMotion?: A11yAuditCheck;
  reducedMotion?: A11yAuditCheck;
  /** Flag explicit colors with no `color-scheme` awareness. */
  colorScheme?: A11yAuditCheck;
}

declare const a11yAudit: AuditFactory;
export = a11yAudit;
