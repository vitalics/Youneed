// ── @youneed/devtools/protocol — the Components DOMAIN ────────────────────────
//
// Ports the @youneed/dom runtime inspector onto `@youneed/devtools-protocol`: a
// `Components` DOMAIN over the same CDP-style protocol the server speaks. The
// in-page UI drives it via an `inProcessTransport` (zero network); a remote UI
// drives it over a WS bridge.
//
// The capture/store still lives in `./core.ts`; this is a thin domain wrapper.

import { t } from "@youneed/schema";
import { createTarget, defineDomain, bridgeToHub, type Domain, type DevtoolsTarget } from "@youneed/devtools-protocol";
import { components, inspect, subscribe, type ComponentRecord } from "./core.ts";

/** A wire-safe component record (drops the live `elRef` WeakRef). Note: `props`
 *  must be JSON-safe to cross a remote (WS) transport; in-process passes by ref. */
export type WireComponent = Omit<ComponentRecord, "elRef">;

function serialize(r: ComponentRecord): WireComponent {
  const { elRef: _elRef, ...rest } = r;
  return rest;
}

/**
 * The `Components` domain — wraps `./core.ts`:
 *   • `Components.getTree`          → every {@link WireComponent}
 *   • `Components.getComponent{id}` → one record (or `null`)
 *   • `Components.enable`/`disable` → start/stop `Components.changed` events
 *   • event `changed` → `{ components }` on every store mutation
 */
export function componentsDomain(): Domain {
  return defineDomain({
    domain: "Components",
    description: "live @youneed/dom component tree, props history, emitted events",
    commands: {
      getTree: { description: "all mounted components", handler: () => components().map(serialize) },
      getComponent: {
        description: "one component by id",
        params: t.int(),
        handler: (id: number) => {
          const r = inspect(id);
          return r ? serialize(r) : null;
        },
      },
      enable: {
        description: "start receiving Components.changed events",
        handler: (_p, ctx) => {
          if (!ctx.session.unsub) {
            // ctx.emit is bound to THIS session's transport — calling it later
            // (on a store mutation) pushes an event frame to this client.
            ctx.session.unsub = subscribe(() => ctx.emit("changed", { components: components().map(serialize) }));
          }
          return { enabled: true };
        },
      },
      disable: {
        description: "stop receiving Components.changed events",
        handler: (_p, ctx) => {
          (ctx.session.unsub as (() => void) | undefined)?.();
          ctx.session.unsub = undefined;
          return { enabled: false };
        },
      },
    },
    events: { changed: { description: "the component store changed" } },
  });
}

/** A {@link DevtoolsTarget} (kind `"dom"`) with the {@link componentsDomain}
 *  registered. Serve it over an `inProcessTransport` (in-page UI) or a WS bridge. */
export function createComponentsTarget(opts: { id?: string; title?: string; url?: string } = {}): DevtoolsTarget {
  return createTarget({ kind: "dom", title: opts.title ?? "page", id: opts.id, url: opts.url }).register(componentsDomain());
}

/**
 * Front-bridge this page to a server devtools hub: register a `Components` target
 * at `{hubBase}/register` so the unified UI inspects this page alongside the
 * server. Call once at startup (dev only). Returns a `close()`.
 *
 *   import { installDevtools } from "@youneed/devtools";
 *   import { bridgeComponents } from "@youneed/devtools/protocol";
 *   installDevtools();
 *   bridgeComponents("ws://localhost:3000/__devtools/register", { title: document.title });
 */
export function bridgeComponents(hubRegisterUrl: string, opts: { id?: string; title?: string; url?: string } = {}): { close(): void } {
  return bridgeToHub(hubRegisterUrl, createComponentsTarget(opts));
}
