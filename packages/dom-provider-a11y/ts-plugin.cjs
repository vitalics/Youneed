// @youneed/dom-provider-a11y/ts-plugin — an audit for @youneed/ts-plugin. It's the
// editor-time mirror of this package's runtime CSS audit: it statically scans a
// component's css`` templates and flags styles that aren't adaptive —
//
//   • reduceMotion — animates/transitions with no
//     `@media (prefers-reduced-motion: reduce)` variant;
//   • colorScheme  — sets explicit colors with no `color-scheme` declaration and no
//     `@media (prefers-color-scheme: …)` rule.
//
// Each check's severity ("error" | "warning" | "suggestion" | "none") is configured
// per project. Add it to the plugin's `audits`:
//
//   ["@youneed/dom-provider-a11y/ts-plugin", {
//     "reduceMotion": { "enabled": true, "kind": "warning" },
//     "colorScheme":  { "enabled": true, "kind": "warning" }
//   }]
//
// Shipped as plain CommonJS because the TS Server loads audit modules with a sync
// require(); it depends only on the `ctx` the plugin hands it (no @youneed/dom).
"use strict";

const MOTION_DOCS = "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion";
const COLOR_DOCS = "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme";

// Values that aren't a concrete colour (keyword / inherited). `var(…)` is treated
// as adaptive (a theme token), so it's excluded from "explicit colors" too.
const NON_COLORS = new Set(["inherit", "initial", "unset", "revert", "revert-layer", "currentcolor", "transparent", "none", ""]);

/** Strip `/* … *\/` comments so a commented-out declaration isn't scanned. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length)); // keep offsets stable
}

/** First meaningful `transition`/`animation` declaration (value !== none), or null. */
function firstMotion(css) {
  const re = /(?:^|[\s;{])(transition|animation)\s*:\s*([^;}]*)/g;
  let m;
  while ((m = re.exec(css))) {
    const value = m[2].trim().toLowerCase();
    if (value && value !== "none") return { prop: m[1], start: m.index + m[0].indexOf(m[1]) };
  }
  return null;
}

/** First explicit colour declaration (concrete value), or null. */
function firstColor(css) {
  const re = /(?:^|[\s;{])(color|background-color|border-color|outline-color|caret-color|fill|stroke)\s*:\s*([^;}]*)/g;
  let m;
  while ((m = re.exec(css))) {
    const value = m[2].trim().toLowerCase();
    if (value && !NON_COLORS.has(value) && !value.includes("var(")) return { prop: m[1], start: m.index + m[0].indexOf(m[1]) };
  }
  return null;
}

/** @type {(options?: unknown) => import("./ts-plugin.d.cts").Audit} */
module.exports = function a11yAudit(options) {
  const opts = options || {};
  const rm = opts.reduceMotion || opts.reducedMotion || {};
  const cs = opts.colorScheme || {};
  const rmEnabled = rm.enabled !== false;
  const csEnabled = cs.enabled !== false;
  const rmKind = rm.kind || "warning";
  const csKind = cs.kind || "warning";

  return {
    name: "a11y",
    diagnostics(ctx) {
      const out = [];
      for (const tpl of ctx.templates()) {
        if (tpl.kind !== "css") continue;
        const css = stripComments(tpl.raw);

        if (rmEnabled && !/prefers-reduced-motion/.test(css)) {
          const hit = firstMotion(css);
          if (hit)
            out.push({
              start: tpl.base + hit.start,
              length: hit.prop.length,
              severity: rmKind,
              messageText: `This component animates ('${hit.prop}') but has no \`@media (prefers-reduced-motion: reduce)\` variant — add one that disables or tones down the motion. ${MOTION_DOCS}`,
              code: 990101,
            });
        }

        if (csEnabled && !/prefers-color-scheme/.test(css) && !/(?:^|[\s;{])color-scheme\s*:/.test(css)) {
          const hit = firstColor(css);
          if (hit)
            out.push({
              start: tpl.base + hit.start,
              length: hit.prop.length,
              severity: csKind,
              messageText: `This component sets colors ('${hit.prop}') but isn't color-scheme-aware (no \`color-scheme\` and no \`@media (prefers-color-scheme: …)\`) — add a dark/light variant. ${COLOR_DOCS}`,
              code: 990102,
            });
        }
      }
      return out;
    },
  };
};
