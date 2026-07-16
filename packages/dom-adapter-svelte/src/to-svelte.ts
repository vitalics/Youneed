// Svelte ⇄ @youneed/dom bridge.
//
// Svelte is compiler-first — there is no runtime API to *construct* a Svelte
// component to embed in another component's template — so the dom→Svelte direction
// ships as a **Svelte action** (`use:`). Svelte already renders custom elements
// natively from their tag; the action's job is the part Svelte can't do on its
// own: assign plain values as JS *properties* (so reactive `@prop` setters fire)
// and wire `on<Event>` handlers to the component's exposed CustomEvents.
//
//   <script>
//     import { toSvelte } from "@youneed/dom-adapter-svelte";
//     import { UserCard } from "./user-card";
//     const userCard = toSvelte(UserCard);   // ← a Svelte action (carries .tagName)
//     let user = $state({ name: "Ada" });
//   </script>
//
//   <svelte:element this={userCard.tagName}
//                   use:userCard={{ user, onSelect: e => console.log(e.detail) }} />
//
// Passing the component (not the bare tag) keeps the usage greppable and
// rename-safe; `userCard.tagName` is the registered tag for `<svelte:element>`.
//
// • Plain params are assigned as JS *properties* (not attributes), so a reactive
//   `@prop` setter fires with the real value — objects, arrays and functions pass
//   through intact, and they re-apply when Svelte re-runs the action (params change).
// • Params named `on<Event>` are wired as listeners for the component's exposed
//   `@Component.event` CustomEvents. `onSelect` listens for the `select` *and*
//   `onSelect` event types, so it works whether the dom author named the event
//   `select` (field name) or `onSelect` (explicit) — the handler receives the
//   `CustomEvent` (read `e.detail`).
// • `class`, `id` and `style` params are forwarded to the host element.

/** A `@youneed/dom` component class: constructible, and it carries the custom
 *  element tag it was registered under. Structural, so this package never has to
 *  import `@youneed/dom` at runtime. */
export interface DomComponentClass<I extends HTMLElement = HTMLElement> {
  new (...args: any[]): I;
  readonly tagName: string;
}

/** The data props a component instance accepts: its `_typed_props` public contract
 *  if it declares one (`declare _typed_props: Props` — see @youneed/dom's
 *  Component()), otherwise its data fields (methods stripped), all optional.
 *  Mirrors dom's own `PublicProps`. */
export type DomProps<I> = I extends { _typed_props: infer P }
  ? P
  : {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      [K in keyof I as I[K] extends Function ? never : K]?: I[K];
    };

/** Event-listener params: any `on<Event>` handler receives the matching exposed
 *  `CustomEvent`. The convention is `onFoo` → the `foo` event (read `e.detail`). */
export type EventParams = {
  [K in `on${string}`]?: (event: CustomEvent) => void;
};

/** Host-level params layered on top of the component's own. */
export interface HostParams {
  /** Forwarded to the host element's `class` attribute. */
  class?: string;
  /** Forwarded to the host element's `id`. */
  id?: string;
  /** Merged into the host element's inline `style`. */
  style?: Partial<CSSStyleDeclaration>;
}

/** The full param surface an action produced by `toSvelte` accepts. */
export type SvelteActionParams<I> = DomProps<I> & EventParams & HostParams;

/** A Svelte action (`use:`) that syncs params onto the custom element it's applied
 *  to. Carries `.tagName` for `<svelte:element this={…}>`. */
export interface DomSvelteAction<I extends HTMLElement = HTMLElement> {
  (node: I, params?: SvelteActionParams<I>): { update(params: SvelteActionParams<I>): void; destroy(): void };
  /** The custom element tag this action drives — use with `<svelte:element>`. */
  readonly tagName: string;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Turn a dom component class into a Svelte action (params are type-checked). */
export function toSvelte<C extends DomComponentClass>(component: C): DomSvelteAction<InstanceType<C>>;
/** Turn a raw tag name into a Svelte action — escape hatch, no param typing. */
export function toSvelte(tagName: string): DomSvelteAction;
export function toSvelte(target: DomComponentClass | string): DomSvelteAction {
  const tagName = typeof target === "string" ? target : target.tagName;
  const action = function domBridge(node: HTMLElement, params: SvelteActionParams<HTMLElement> = {}) {
    const state: SyncState = { props: {}, listeners: new Map() };
    applyProps(node, params as Record<string, unknown>, state);
    return {
      update(next: SvelteActionParams<HTMLElement>) {
        applyProps(node, next as Record<string, unknown>, state);
      },
      destroy() {
        detach(node, state);
      },
    };
  } as DomSvelteAction;
  (action as { tagName: string }).tagName = tagName;
  return action;
}

// ── internals ───────────────────────────────────────────────────────────────

interface SyncState {
  /** Last applied plain-prop values, to assign only what changed. */
  props: Record<string, unknown>;
  /** Attached event listeners, keyed by the `on<Event>` param name. */
  listeners: Map<string, (event: Event) => void>;
}

const HOST_KEYS = new Set(["class", "id", "style"]);

/** `/^on[A-Z]/` — an `on<Event>` handler param (`onClick`, `onValueChange`). */
function isEventProp(key: string): boolean {
  return key.length > 2 && key[0] === "o" && key[1] === "n" && key[2] >= "A" && key[2] <= "Z";
}

/** Candidate CustomEvent types for an `on<Event>` param: the decapitalised form
 *  (`onSelect` → `select`) and the literal param name (`onSelect`), so a handler
 *  matches whether the dom event was named by field or declared with the `on`. */
function eventTypes(key: string): string[] {
  const rest = key.slice(2);
  const decap = rest[0].toLowerCase() + rest.slice(1);
  return [decap, key]; // decap ≠ key always (rest starts uppercase)
}

/** Sync `params` onto `el`: properties for data, addEventListener for `on<Event>`,
 *  plus class/id/style. Diffs against `state` so only changes are applied. */
function applyProps(el: HTMLElement, params: Record<string, unknown>, state: SyncState): void {
  if (params.class !== undefined) el.setAttribute("class", params.class as string);
  if (params.id !== undefined) el.id = params.id as string;
  if (params.style) Object.assign(el.style, params.style);

  const seenEvents = new Set<string>();
  const target = el as unknown as Record<string, unknown>;
  for (const k in params) {
    if (HOST_KEYS.has(k)) continue;
    const v = params[k];
    if (isEventProp(k) && typeof v === "function") {
      seenEvents.add(k);
      const prev = state.listeners.get(k);
      if (prev === v) continue;
      const listener = v as (event: Event) => void;
      for (const type of eventTypes(k)) {
        if (prev) el.removeEventListener(type, prev);
        el.addEventListener(type, listener);
      }
      state.listeners.set(k, listener);
    } else if (v !== state.props[k]) {
      target[k] = v; // property assignment fires reactive @prop setters
    }
  }

  // Drop listeners for handlers no longer present.
  for (const [k, fn] of state.listeners) {
    if (seenEvents.has(k)) continue;
    for (const type of eventTypes(k)) el.removeEventListener(type, fn);
    state.listeners.delete(k);
  }
  // Snapshot, not the live reference: Svelte may reuse one params object across
  // updates, so the diff above must compare against a copy.
  state.props = { ...params };
}

/** Remove every attached listener (action destroy). */
function detach(el: HTMLElement | null, state: SyncState): void {
  if (el) for (const [k, fn] of state.listeners) for (const type of eventTypes(k)) el.removeEventListener(type, fn);
  state.listeners.clear();
}
