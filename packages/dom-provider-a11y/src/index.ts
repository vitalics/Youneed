// ── @youneed/dom-provider-a11y — accessibility helpers for components ────────
//
// A composable `@youneed/dom` provider that adds accessibility primitives under a
// single namespaced object, `this.a11y` — so they're clearly the provider's, not
// native `HTMLElement` / `Component` members (the same shape as `this.i18n`):
//
//   • this.a11y.announce(msg)   — speak a message to screen readers via a shared
//                                 ARIA live region;
//   • this.a11y.trapFocus()     — keep Tab focus inside the component (dialogs);
//   • this.a11y.roving(items)    — roving-tabindex keyboard nav (arrows move focus
//                                 across a widget — mouse-free interaction);
//   • this.a11y.setTabIndex / makeFocusable / makeUnfocusable — manage tabindex;
//   • this.a11y.prefersReducedMotion — the OS "reduce motion" preference, reactive.
//
//   import { Component, html } from "@youneed/dom";
//   import { a11yProvider } from "@youneed/dom-provider-a11y";
//
//   class Dialog extends Component("x-dialog", { providers: [a11yProvider()] }) {
//     onMount() {
//       this.onCleanup(this.a11y.trapFocus());
//       this.a11y.announce("Dialog opened");
//     }
//     render() { return html`<button>OK</button><button>Cancel</button>`; }
//   }
//
// Plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to the
// other providers (i18n, direction, color-scheme), composed in one array.

import type { ComponentProvider } from "@youneed/dom";

/** ARIA live-region urgency: `polite` waits for a pause, `assertive` interrupts. */
export type Politeness = "polite" | "assertive";

/** Which arrow keys drive a roving-tabindex group. */
export type Orientation = "horizontal" | "vertical" | "both";

export interface RovingOptions {
  /** Arrows that navigate: `horizontal` = ←/→, `vertical` = ↑/↓, `both` (default). */
  orientation?: Orientation;
  /** Wrap around at the ends (default `true`). */
  loop?: boolean;
  /** Index focusable initially (gets `tabindex=0`; default `0`). */
  initial?: number;
}

/** Controls a roving-tabindex group created by {@link A11yApi.roving}. */
export interface RovingController {
  /** The currently active (tabbable) item index. */
  readonly activeIndex: number;
  /** Make `index` the active item and focus it. */
  setActive(index: number): void;
  /** Remove the key handler (the items keep their current tabindex). */
  destroy(): void;
}

/** The provider's contribution, exposed as `this.a11y`. */
export interface A11yApi {
  /** Announce `message` to screen readers via a shared live region. */
  announce(message: string, politeness?: Politeness): void;
  /** Trap Tab focus within the component; returns a release that also restores
   *  focus to the previously-focused element. Auto-released on disconnect. */
  trapFocus(): () => void;
  /** Release a focus trap set by {@link A11yApi.trapFocus} (no-op if none). */
  releaseFocus(): void;
  /** Focus the first focusable element in the component; `false` if none. */
  focusFirst(): boolean;
  /** Set `tabindex` on `target` (default the host). */
  setTabIndex(value: number, target?: HTMLElement): void;
  /** `tabindex=0` — put `target` (default the host) in the Tab order. */
  makeFocusable(target?: HTMLElement): void;
  /** `tabindex=-1` — remove `target` (default the host) from the Tab order
   *  (still focusable programmatically). */
  makeUnfocusable(target?: HTMLElement): void;
  /** Wire roving-tabindex keyboard navigation across `items` (a CSS selector
   *  resolved within the component, or an explicit element list): one item is
   *  tabbable at a time and arrow keys move focus between them. */
  roving(items: Iterable<HTMLElement> | string, options?: RovingOptions): RovingController;
  /** Whether the OS prefers reduced motion (reactive — re-renders on change). */
  readonly prefersReducedMotion: boolean;
}

export interface A11yOptions {
  /** Reflect `data-reduced-motion` and re-render when the OS preference changes
   *  (default `true`). */
  reducedMotion?: boolean;
  /**
   * Dev-time CSS audit of the component's scoped styles. When the component
   * animates (or transitions) it should also ship a
   * `@media (prefers-reduced-motion: reduce)` variant; when it sets explicit
   * colors it should be `color-scheme`-aware (a `color-scheme` declaration or a
   * `@media (prefers-color-scheme: …)` rule). A miss is reported via `console.warn`
   * (or a custom `warn`) shortly after mount.
   *
   * `true` enables both checks; pass an object to toggle one or redirect the
   * output. Off by default — opt in during development.
   */
  audit?: boolean | A11yAuditOptions;
}

/** Toggles + sink for the dev-time CSS audit (see {@link A11yOptions.audit}). */
export interface A11yAuditOptions {
  /** Flag animation/transition without a `prefers-reduced-motion` variant (default `true`). */
  reducedMotion?: boolean;
  /** Flag explicit colors without `color-scheme` awareness (default `true`). */
  colorScheme?: boolean;
  /** Where findings go (default `console.warn`). */
  warn?: (message: string) => void;
}

/** One thing the CSS audit flagged on a component's scoped styles. */
export interface A11yAuditFinding {
  kind: "reduced-motion" | "color-scheme";
  /** Ready-to-log message (includes the component label + an MDN link). */
  message: string;
  /** MDN reference for the relevant `@media` feature. */
  docs: string;
}

// ── screen-reader announcements (shared live regions) ────────────────────────────

const regions = new Map<Politeness, HTMLElement>();

function liveRegion(politeness: Politeness): HTMLElement {
  let region = regions.get(politeness);
  if (!region) {
    region = document.createElement("div");
    region.setAttribute("aria-live", politeness);
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("role", politeness === "assertive" ? "alert" : "status");
    region.setAttribute("data-youneed-a11y-live", politeness);
    Object.assign(region.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      margin: "-1px",
      padding: "0",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      clipPath: "inset(50%)",
      whiteSpace: "nowrap",
      border: "0",
    });
    document.body.appendChild(region);
    regions.set(politeness, region);
  }
  return region;
}

/** A screen-reader announcement, as seen by an {@link onAnnounce} listener. */
export interface AnnounceEvent {
  message: string;
  politeness: Politeness;
}

// A no-op-until-subscribed bus so tooling (the devtools plugin) can tail
// announcements without the live-region core depending on it.
const announceListeners = new Set<(event: AnnounceEvent) => void>();

/** Observe every {@link announce} call. Returns an unsubscribe. Used by the
 *  devtools plugin (`@youneed/dom-provider-a11y/devtools`). */
export function onAnnounce(listener: (event: AnnounceEvent) => void): () => void {
  announceListeners.add(listener);
  return () => void announceListeners.delete(listener);
}

/** Announce a message to screen readers via the shared live region. Usable
 *  outside a component too. Clears first so an identical repeat re-announces. */
export function announce(message: string, politeness: Politeness = "polite"): void {
  const region = liveRegion(politeness);
  region.textContent = "";
  region.textContent = message;
  for (const fn of [...announceListeners]) fn({ message, politeness });
}

/** Remove the shared live regions (mainly for tests). */
export function clearAnnouncer(): void {
  for (const region of regions.values()) region.remove();
  regions.clear();
}

// ── focus management ─────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

const renderRoot = (host: HTMLElement): ParentNode => host.shadowRoot ?? host;

function focusables(host: HTMLElement): HTMLElement[] {
  return [...renderRoot(host).querySelectorAll<HTMLElement>(FOCUSABLE)];
}

function activeWithin(host: HTMLElement): HTMLElement | null {
  return (host.shadowRoot?.activeElement ?? document.activeElement) as HTMLElement | null;
}

function focusFirst(host: HTMLElement): boolean {
  const first = focusables(host)[0];
  first?.focus();
  return Boolean(first);
}

function trapFocus(host: HTMLElement): () => void {
  const previously = document.activeElement as HTMLElement | null;
  focusFirst(host);
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const items = focusables(host);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = activeWithin(host);
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };
  host.addEventListener("keydown", onKeydown);
  return () => {
    host.removeEventListener("keydown", onKeydown);
    previously?.focus?.();
  };
}

// ── roving tabindex (keyboard navigation across a widget) ────────────────────────

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

function createRoving(
  host: HTMLElement,
  itemsInput: Iterable<HTMLElement> | string,
  options: RovingOptions = {},
): RovingController {
  const orientation = options.orientation ?? "both";
  const loop = options.loop !== false;
  const items =
    typeof itemsInput === "string"
      ? [...renderRoot(host).querySelectorAll<HTMLElement>(itemsInput)]
      : [...itemsInput];
  let active = items.length ? clamp(options.initial ?? 0, 0, items.length - 1) : 0;

  const applyTabIndex = (): void =>
    items.forEach((el, i) => el.setAttribute("tabindex", i === active ? "0" : "-1"));
  applyTabIndex();

  const move = (index: number, focus: boolean): void => {
    if (index < 0 || index >= items.length) return;
    active = index;
    applyTabIndex();
    if (focus) items[index]?.focus();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (!items.length) return;
    const horizontal = orientation !== "vertical";
    const vertical = orientation !== "horizontal";
    let next = active;
    if ((vertical && event.key === "ArrowDown") || (horizontal && event.key === "ArrowRight"))
      next = active + 1;
    else if ((vertical && event.key === "ArrowUp") || (horizontal && event.key === "ArrowLeft"))
      next = active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    if (next < 0) next = loop ? items.length - 1 : 0;
    if (next >= items.length) next = loop ? 0 : items.length - 1;
    move(next, true);
  };

  host.addEventListener("keydown", onKeydown);
  return {
    get activeIndex(): number {
      return active;
    },
    setActive: (index) => move(index, true),
    destroy: () => host.removeEventListener("keydown", onKeydown),
  };
}

// ── reduced motion ───────────────────────────────────────────────────────────────

/** Whether the OS prefers reduced motion (false where `matchMedia` is absent). */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches === true
  );
}

// ── CSS audit (reduced-motion / color-scheme adaptiveness) ───────────────────────

const MOTION_DOCS = "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion";
const COLOR_SCHEME_DOCS = "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme";

// Color properties whose value is a colour (so a concrete value means the
// component paints something that ought to adapt to the OS scheme).
const COLOR_PROPS = [
  "color", "background-color", "border-color", "outline-color", "caret-color",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "fill", "stroke",
];
// Values that aren't a concrete colour (inherited/keyword) — and thus don't pin a
// component to one scheme. `var(…)` is treated as adaptive (likely a theme token).
const NON_COLORS = new Set(["", "inherit", "initial", "unset", "revert", "revert-layer", "currentcolor", "transparent", "none"]);

const meaningful = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return v !== "" && v !== "none";
};

/** A rule declares motion if it sets a non-`none` animation or transition. */
function declaresMotion(style: CSSStyleDeclaration): boolean {
  return (
    meaningful(style.getPropertyValue("animation") || style.getPropertyValue("animation-name")) ||
    meaningful(style.getPropertyValue("transition") || style.getPropertyValue("transition-property"))
  );
}

/** A rule declares a concrete colour (not a keyword and not a `var(…)` token). */
function declaresColor(style: CSSStyleDeclaration): boolean {
  for (const prop of COLOR_PROPS) {
    const v = style.getPropertyValue(prop).trim().toLowerCase();
    if (v && !NON_COLORS.has(v) && !v.includes("var(")) return true;
  }
  return false;
}

interface Scan {
  animates: boolean;
  reducedMotionQuery: boolean;
  colors: boolean;
  colorSchemeAware: boolean;
}

// Walk a rule list, tracking whether we're already inside a reduced-motion /
// color-scheme media block (so motion/colours declared THERE don't count as
// "unguarded" — they're the adaptation). A rule can be BOTH a style rule (has
// `.style`) and a container (`.cssRules`, e.g. CSS nesting), so handle each facet
// independently rather than as an either/or — note CSSStyleRule exposes an empty
// `cssRules` in some engines, so only recurse when there are actually children.
function scanRules(rules: CSSRuleList, ctx: { inReducedMotion: boolean; inColorScheme: boolean }, acc: Scan): void {
  for (const rule of rules as unknown as Iterable<CSSRule>) {
    const r = rule as CSSStyleRule & Partial<CSSGroupingRule & CSSConditionRule & CSSMediaRule>;
    const style = r.style;
    if (style) {
      if (meaningful(style.getPropertyValue("color-scheme"))) acc.colorSchemeAware = true;
      if (!ctx.inReducedMotion && declaresMotion(style)) acc.animates = true;
      if (!ctx.inColorScheme && declaresColor(style)) acc.colors = true;
    }
    if (r.cssRules && r.cssRules.length) {
      const condition = (r.media?.mediaText ?? r.conditionText ?? "").toLowerCase();
      const hitsRM = condition.includes("prefers-reduced-motion");
      const hitsCS = condition.includes("prefers-color-scheme");
      if (hitsRM) acc.reducedMotionQuery = true;
      if (hitsCS) acc.colorSchemeAware = true;
      scanRules(r.cssRules, { inReducedMotion: ctx.inReducedMotion || hitsRM, inColorScheme: ctx.inColorScheme || hitsCS }, acc);
    }
  }
}

/**
 * Audit a component's scoped stylesheets for motion / color-scheme adaptiveness.
 * Pure (no DOM mounting) so it's unit-testable: pass `css`-built `CSSStyleSheet`s.
 * Returns a finding when the styles animate without a `prefers-reduced-motion`
 * variant, or set colours without being `color-scheme`-aware.
 */
export function auditStyleSheets(
  sheets: Iterable<CSSStyleSheet>,
  options: { reducedMotion?: boolean; colorScheme?: boolean; label?: string } = {},
): A11yAuditFinding[] {
  const acc: Scan = { animates: false, reducedMotionQuery: false, colors: false, colorSchemeAware: false };
  for (const sheet of sheets) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules; // cross-origin sheets throw on access — skip them
    } catch {
      continue;
    }
    if (rules) scanRules(rules, { inReducedMotion: false, inColorScheme: false }, acc);
  }

  const label = options.label ?? "component";
  const findings: A11yAuditFinding[] = [];
  if (options.reducedMotion !== false && acc.animates && !acc.reducedMotionQuery) {
    findings.push({
      kind: "reduced-motion",
      docs: MOTION_DOCS,
      message: `[a11y] ${label} animates (animation/transition) but defines no \`@media (prefers-reduced-motion: reduce)\` rule — add a reduced-motion variant that disables or tones down the motion. ${MOTION_DOCS}`,
    });
  }
  if (options.colorScheme !== false && acc.colors && !acc.colorSchemeAware) {
    findings.push({
      kind: "color-scheme",
      docs: COLOR_SCHEME_DOCS,
      message: `[a11y] ${label} sets explicit colors but declares no \`color-scheme\` and no \`@media (prefers-color-scheme: …)\` rule — add a dark/light variant. ${COLOR_SCHEME_DOCS}`,
    });
  }
  return findings;
}

// ── provider ─────────────────────────────────────────────────────────────────────

/**
 * A composable `Component` provider that contributes a single `this.a11y` object:
 * `announce`, `trapFocus` / `releaseFocus` / `focusFirst`, tabindex helpers
 * (`setTabIndex` / `makeFocusable` / `makeUnfocusable`), roving-tabindex keyboard
 * navigation (`roving`), and a reactive `prefersReducedMotion` (reflected as
 * `data-reduced-motion`). All teardown is auto-removed on disconnect.
 *
 * With `{ audit: true }` it also runs a dev-time CSS audit after mount and warns
 * when the component animates without a `@media (prefers-reduced-motion: reduce)`
 * variant, or sets colours without being `color-scheme`-aware.
 */
export function a11yProvider(
  options: A11yOptions = {},
): ComponentProvider<{ readonly a11y: A11yApi }> {
  const reflectReducedMotion = options.reducedMotion !== false;
  // Normalize the audit option: `true` → both checks; an object toggles each.
  const auditCfg =
    options.audit === true
      ? { reducedMotion: true, colorScheme: true, warn: undefined as ((m: string) => void) | undefined }
      : options.audit && typeof options.audit === "object"
        ? { reducedMotion: options.audit.reducedMotion !== false, colorScheme: options.audit.colorScheme !== false, warn: options.audit.warn }
        : undefined;
  return {
    install(host) {
      let release: (() => void) | undefined;

      const api: A11yApi = {
        announce: (message, politeness) => announce(message, politeness),
        trapFocus: () => {
          release?.();
          release = trapFocus(host);
          return release;
        },
        releaseFocus: () => {
          release?.();
          release = undefined;
        },
        focusFirst: () => focusFirst(host),
        setTabIndex: (value, target = host) => void target.setAttribute("tabindex", String(value)),
        makeFocusable: (target = host) => void target.setAttribute("tabindex", "0"),
        makeUnfocusable: (target = host) => void target.setAttribute("tabindex", "-1"),
        roving: (items, opts) => {
          const controller = createRoving(host, items, opts);
          host.onCleanup(controller.destroy);
          return controller;
        },
        get prefersReducedMotion(): boolean {
          return prefersReducedMotion();
        },
      };

      Object.defineProperty(host, "a11y", { configurable: true, value: api });
      host.onCleanup(() => release?.());

      // Dev-time CSS audit: run once after mount (a microtask, by which point the
      // styles are adopted) — only for a connected host with scoped styles.
      if (auditCfg) {
        const warn = auditCfg.warn ?? ((m: string) => console.warn(m));
        queueMicrotask(() => {
          if (!host.isConnected) return;
          const findings = auditStyleSheets(host.getStyles(), {
            reducedMotion: auditCfg.reducedMotion,
            colorScheme: auditCfg.colorScheme,
            label: `<${host.localName}>`,
          });
          for (const finding of findings) warn(finding.message);
        });
      }

      if (reflectReducedMotion) {
        const apply = (): void =>
          void host.setAttribute("data-reduced-motion", String(prefersReducedMotion()));
        // `install` runs in the constructor, and the Custom Elements spec forbids a
        // constructor from setting attributes on its element (real browsers throw
        // "the result must not have attributes" and the element fails to upgrade).
        // Defer the first reflect to a microtask so it lands just after construction.
        queueMicrotask(apply);
        const mq =
          typeof matchMedia === "function"
            ? matchMedia("(prefers-reduced-motion: reduce)")
            : undefined;
        if (mq?.addEventListener) {
          const onChange = (): void => {
            apply();
            host.requestUpdate();
          };
          mq.addEventListener("change", onChange);
          host.onCleanup(() => mq.removeEventListener("change", onChange));
        }
      }
    },
  };
}
