// Shared helpers every shad component imports. The `shad` CLI copies this file
// into your project (as `lib/shad.ts`) alongside the components you add, so you
// own it and can tweak it — the shadcn way.

import { css } from "@youneed/dom";
import { buildCriticalCss } from "./critical.ts";

/**
 * One constructable stylesheet holding your compiled Tailwind CSS. Components
 * adopt it (`static styles = [tw, …]`) so utility classes work INSIDE their
 * shadow roots (global CSS can't cross a shadow boundary).
 *
 * Call `registerTailwind(text)` ONCE at startup with your compiled Tailwind,
 * imported as text (esbuild `loader: { ".css": "text" }`, or Vite `?raw`):
 *
 *   import tw from "./tailwind.gen.css";   // bundled as a string
 *   registerTailwind(tw);
 */
export const tw = new CSSStyleSheet();

/**
 * How SSR serializes the shared Tailwind sheet into each Declarative Shadow Root.
 * The trade-off is HTML size vs. when styles paint (FOUC) vs. network:
 *
 *   • `"critical"` (default) — inline ONLY the utilities each root uses (+ the
 *      prerequisites). Self-contained, no fetch, NO FOUC. The sweet spot.
 *   • `"fouc"` — declarative adopted: emit the CSS ONCE per document and have
 *      every root reference it (`shadowrootadoptedstylesheets`). Zero duplication,
 *      smallest HTML — but styles paint at hydration (and pre-paint once browsers
 *      ship the attribute), so a FOUC is possible until then. Hence the name.
 *   • `"lazy"` — emit a shadow-scoped `<link href>` (needs `href`). The sheet is
 *      fetched lazily over the network (once, then cached across roots).
 *   • `"inline"` — inline the full CSS verbatim into every root (largest; no FOUC).
 *
 * After hydration components use the shared constructable sheet regardless.
 */
export type TailwindStrategy = "critical" | "fouc" | "lazy" | "inline";

export function registerTailwind(
  cssText: string,
  opts: {
    /** Serialization strategy (default `"critical"`). */
    strategy?: TailwindStrategy;
    /** URL the sheet is served at — required for `"lazy"`. */
    href?: string;
    /** Shared-sheet id for `"fouc"` (default `"tw"`). */
    id?: string;
  } = {},
): void {
  tw.replaceSync(cssText);
  const sheet = tw as CSSStyleSheet & {
    __id?: string;
    __cssText?: string;
    __href?: string;
    __critical?: (used: Set<string>) => string;
  };
  // Reset prior strategy markers so re-registering switches cleanly.
  sheet.__cssText = cssText;
  sheet.__id = sheet.__href = sheet.__critical = undefined;

  switch (opts.strategy ?? "critical") {
    case "fouc":
      sheet.__id = opts.id ?? "tw";
      break;
    case "lazy":
      if (!opts.href) throw new Error('registerTailwind: strategy "lazy" requires an `href`.');
      sheet.__href = opts.href;
      break;
    case "inline":
      break; // __cssText alone → full verbatim inline
    case "critical":
    default:
      sheet.__critical = buildCriticalCss(cssText);
  }

  registerProperties(cssText);
}

/**
 * Pull Tailwind v4's `@property` registrations out of compiled CSS.
 *
 * These MUST live at the DOCUMENT level. A registered custom property is
 * document-global, so `var(--tw-border-style)` then resolves to its
 * `initial-value` ("solid") even inside shadow roots. An `@property` rule that
 * sits ONLY in a shadow/constructable stylesheet is ignored by Chromium — so
 * the var has no value, `border-style: var(--tw-border-style)` collapses to
 * `none`, and every Tailwind `border` silently disappears in the shadow DOM.
 * Tailwind ships a non-`@property` fallback too, but gates it behind an
 * `@supports` that is false in Chromium (it "supports" `@property`).
 */
export function tailwindProperties(cssText: string = (tw as { __cssText?: string }).__cssText ?? ""): string {
  return (cssText.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) ?? []).join("");
}

let docPropsSheet: CSSStyleSheet | undefined;

/** Register Tailwind's `@property` rules once at the document level so they
 *  resolve inside every shadow root (see {@link tailwindProperties}). On the
 *  server this is a harmless no-op — SSR emits them in `<head>` instead. */
function registerProperties(cssText: string): void {
  if (typeof document === "undefined") return;
  try {
    const css = tailwindProperties(cssText);
    if (!css) return;
    (docPropsSheet ??= new CSSStyleSheet()).replaceSync(css);
    if (!document.adoptedStyleSheets.includes(docPropsSheet))
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, docPropsSheet];
  } catch {
    /* no constructable-stylesheet support — SSR <head> covers it */
  }
}

/** A tiny per-component reset so the custom element lays out predictably. */
export const base = css`
  :host {
    display: inline-block;
  }
  :host([block]) {
    display: block;
  }
`;

type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | Record<string, unknown>
  | ClassValue[];

/**
 * Merge class names (clsx-lite): strings/numbers pass through, arrays flatten,
 * objects include keys whose value is truthy. Conditional variants → one string.
 *
 *   cn("p-2", isActive && "bg-zinc-900", { "opacity-50": disabled })
 *
 * Note: this doesn't de-duplicate conflicting Tailwind utilities like
 * `tailwind-merge` does — order your classes so the intended one wins, or swap in
 * `twMerge` here if you need it.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const key in v) if (v[key]) out.push(key);
  };
  inputs.forEach(walk);
  return out.join(" ");
}

/**
 * cva-lite: build a class resolver from a base + named variant groups.
 *
 *   const button = variants("inline-flex …", {
 *     variant: { default: "bg-zinc-900 …", outline: "border …" },
 *     size:    { default: "h-10 px-4",     sm: "h-9 px-3" },
 *   }, { variant: "default", size: "default" });
 *   button({ variant: "outline" });  // → "inline-flex … border … h-10 px-4"
 */
export function variants<G extends Record<string, Record<string, string>>>(
  base: string,
  groups: G,
  defaults: { [K in keyof G]: keyof G[K] },
) {
  return (props: Partial<{ [K in keyof G]: keyof G[K] }> = {}): string => {
    const picked = Object.keys(groups).map((g) => {
      const key = (props[g] ?? defaults[g]) as string;
      return groups[g][key];
    });
    return cn(base, ...picked);
  };
}
