// ── devtools renderer registry ───────────────────────────────────────────────
//
// devtools no longer hard-codes `kind === "pubsub"` / `"server"` branches. Each
// node/plugin KIND has a registered renderer that knows how to draw itself; the
// UI just looks it up and calls it. Plugin packages ship their own renderer at a
// `<pkg>/devtools` subpath (e.g. `@youneed/server-plugin-pubsub/devtools`) and
// register it; the devtools web bundle imports those modules so they're present.
// When no renderer is registered for a kind, the UI shows a `<shad-empty>` state.

import { html } from "@youneed/dom";
import type { ServerInfo } from "./core.ts";

/** What `html` produces — a renderable view. */
export type View = ReturnType<typeof html>;

/** Helpers a renderer is handed so it never reaches into devtools internals. */
export interface DevtoolsContext {
  /** The server the rendered thing belongs to (for same-origin requests). */
  server?: ServerInfo;
  /** Navigate the devtools hash router (closes any open drawer). */
  goto(hash: string): void;
  /** Fetch a path on the inspected server (applies its origin for external servers). */
  request(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * How a given KIND draws itself across the devtools surfaces. Everything is
 * optional — a renderer implements only the surfaces it has.
 */
export interface DevtoolsRenderer {
  /** The `kind` discriminator (flow-node kind, or a plugin's `inspect().kind`). */
  kind: string;
  /** Header-tab label. Presence ⇒ a tab is shown when a plugin of this kind is mounted. */
  label?: string;
  /** Docs URL — used as the CTA in empty states. */
  docs?: string;
  /** A compact card for the Infra page (plugin kinds). */
  card?(info: unknown, ctx: DevtoolsContext): View;
  /** A full page for the kind's header tab (plugin kinds). */
  panel?(info: unknown, ctx: DevtoolsContext): View;
  /** The detail drawer opened by clicking the kind's flow-graph node. */
  drawer?(detail: unknown, ctx: DevtoolsContext): View;
  /** Build a flow-graph node from a plugin's `inspect()` info (or `null` to skip). */
  flowNode?(info: unknown): { label: string; detail: unknown } | null;
}

const REGISTRY = new Map<string, DevtoolsRenderer>();

/** Register (or override) the renderer for a kind. Idempotent by `kind`. */
export function registerDevtoolsRenderer(renderer: DevtoolsRenderer): void {
  REGISTRY.set(renderer.kind, renderer);
}

/** Look up the renderer for a kind. */
export function getDevtoolsRenderer(kind: string): DevtoolsRenderer | undefined {
  return REGISTRY.get(kind);
}

/** All registered renderers. */
export function devtoolsRenderers(): DevtoolsRenderer[] {
  return [...REGISTRY.values()];
}

/** A `<shad-empty>` state with an optional docs link — the fallback when a kind
 *  has no registered renderer (or a renderer lacks a surface). */
export function emptyState(opts: { title?: string; message?: string; docs?: string } = {}): View {
  return html`
    <shad-empty variant="outline">
      <shad-empty-header>
        <shad-empty-title>${opts.title ?? "Nothing to render"}</shad-empty-title>
        <shad-empty-description>${opts.message ?? "No devtools renderer is registered for this item."}</shad-empty-description>
      </shad-empty-header>
      ${opts.docs
        ? html`<shad-empty-content><a class="link" href=${opts.docs} target="_blank" rel="noreferrer">Documentation →</a></shad-empty-content>`
        : html``}
    </shad-empty>
  `;
}
