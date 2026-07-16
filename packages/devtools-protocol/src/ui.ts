// @youneed/devtools-protocol/ui — the domain-keyed UI EXTENSION registry.
//
// The protocol is one; the UI is pluggable. Each surface (server / dom / ssr /
// cli) ships a `/devtools` module that registers an EXTENSION for the DOMAIN(s)
// it implements. The unified shell asks the attached target which domains it
// advertises (`Target.getInfo().domains`), then renders a tab per domain that
// has a registered extension — handing each one a LIVE, domain-scoped client.
//
// This generalises `@youneed/server-plugin-devtools`'s `kind`-keyed renderer
// registry: keyed by `domain` (not plugin kind) and given a `DevtoolsClient`
// (live commands + events) instead of a static `inspect()` snapshot.

import { html } from "@youneed/dom";
import type { DevtoolsClient, TargetInfo } from "./index.ts";

/** What `html` produces — a renderable view. */
export type View = ReturnType<typeof html>;

/** Handed to every extension surface. The client is scoped to the attached target. */
export interface ExtensionContext {
  /** Live protocol client for the attached target (commands + event subscriptions). */
  client: DevtoolsClient;
  /** The attached target (kind/title/url/domains). */
  target: TargetInfo;
  /** Navigate the shell's hash router (closes any open drawer). */
  goto(hash: string): void;
  /** Request a re-render of this extension's surface (after async state changes). */
  refresh(): void;
}

/**
 * How a DOMAIN draws itself across the devtools shell. Everything but `domain`
 * is optional — an extension implements only the surfaces it has. Registered by
 * the surface's `/devtools` module; the shell looks it up by domain.
 */
export interface DevtoolsExtension {
  /** The domain this renders, e.g. `"Components"`, `"Topology"`, `"RPC"`. */
  domain: string;
  /** Header-tab label. Presence ⇒ a tab is shown when a target advertises `domain`. */
  label?: string;
  icon?: string;
  /** Docs URL — used as the CTA in empty states. */
  docs?: string;
  /** Sort hint for tab order (lower first; default 100). */
  order?: number;
  /** Full page for the domain's tab. */
  panel?(ctx: ExtensionContext): View | Promise<View>;
  /** Compact card for the overview page. */
  card?(ctx: ExtensionContext): View | Promise<View>;
}

const REGISTRY = new Map<string, DevtoolsExtension>();

/** Register (or override) the UI extension for a domain. Idempotent by `domain`. */
export function registerExtension(ext: DevtoolsExtension): void {
  REGISTRY.set(ext.domain, ext);
}

/** Look up the extension for a domain. */
export function getExtension(domain: string): DevtoolsExtension | undefined {
  return REGISTRY.get(domain);
}

/** All registered extensions, in tab order. */
export function extensions(): DevtoolsExtension[] {
  return [...REGISTRY.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** The extensions that apply to a target (it advertises the domain AND a label
 *  is registered → it earns a tab), in tab order. The shell calls this to build
 *  the tab bar for the attached target. */
export function extensionsFor(target: TargetInfo): DevtoolsExtension[] {
  const advertised = new Set(target.domains);
  return extensions().filter((e) => e.label && advertised.has(e.domain));
}

/** A `<shad-empty>`-style state with an optional docs link — the fallback when a
 *  domain has no registered extension (or an extension lacks a surface). */
export function emptyState(opts: { title?: string; message?: string; docs?: string } = {}): View {
  return html`
    <shad-empty variant="outline">
      <shad-empty-header>
        <shad-empty-title>${opts.title ?? "Nothing to render"}</shad-empty-title>
        <shad-empty-description>${opts.message ?? "No devtools extension is registered for this domain."}</shad-empty-description>
      </shad-empty-header>
      ${opts.docs
        ? html`<shad-empty-content><a class="link" href=${opts.docs} target="_blank" rel="noreferrer">Documentation →</a></shad-empty-content>`
        : html``}
    </shad-empty>
  `;
}
