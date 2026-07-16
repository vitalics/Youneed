// Preact ⇄ @youneed/dom bridge.
//
// `toPreact` turns a `@youneed/dom` custom element into a real Preact component, so
// you use it like any other component — by reference (greppable, rename-safe) and
// with its props type-checked. Reference the component itself (the class), or a
// tag name / live instance as escape hatches.
//
//   import { toPreact } from "@youneed/dom-adapter-preact";
//   import { UserCard } from "./user-card";
//
//   const PreactUserCard = toPreact(UserCard);   // ← a Preact component
//
//   function Profile({ user }) {
//     return <PreactUserCard user={user} onSelect={e => console.log(e.detail)} />;
//   }
//
// • Plain props are assigned as JS *properties* (not attributes), so reactive
//   `@prop` setters fire with the real value — objects, arrays and functions pass
//   through intact, and they stay in sync when Preact re-renders.
// • Props named `on<Event>` are wired as event listeners for the component's
//   exposed `@Component.event` CustomEvents (Angular `@Output` / React style).
//   `onSelect` listens for the `select` *and* `onSelect` event types, so it works
//   whether the dom author named the event `select` (field name) or `onSelect`
//   (explicit) — the handler receives the `CustomEvent` (read `e.detail`).
// • `children` become the element's light DOM (projected into its `<slot>`);
//   `className`, `id` and `style` are forwarded to the host element; `ref` gives
//   you the underlying element instance.

import type { ComponentChildren, FunctionComponent, JSX, Ref } from "preact";
import { createElement } from "preact";
import { useCallback, useLayoutEffect, useRef } from "preact/hooks";
import { forwardRef } from "preact/compat";

/** A `@youneed/dom` component class: constructible, and it carries the custom
 *  element tag it was registered under. Structural, so this package never has
 *  to import `@youneed/dom` at runtime. */
export interface DomComponentClass<I extends HTMLElement = HTMLElement> {
  new (...args: any[]): I;
  readonly tagName: string;
}

/** The data props a component instance accepts: its `_typed_props` public
 *  contract if it declares one (`declare _typed_props: Props` — see
 *  @youneed/dom's Component()), otherwise its data fields (methods stripped),
 *  all optional. Mirrors dom's own `PublicProps`. */
export type DomProps<I> = I extends { _typed_props: infer P }
  ? P
  : {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      [K in keyof I as I[K] extends Function ? never : K]?: I[K];
    };

/** Event-listener props: any `on<Event>` handler receives the matching exposed
 *  `CustomEvent`. The convention is `onFoo` → the `foo` event (read `e.detail`). */
export type EventProps = {
  [K in `on${string}`]?: (event: CustomEvent) => void;
};

/** Host-level Preact props layered on top of the component's own. */
export interface HostProps {
  /** Light-DOM children, projected into the component's `<slot>`. */
  children?: ComponentChildren;
  /** Forwarded to the host element's `class` attribute. */
  className?: string;
  /** Forwarded to the host element's `id`. */
  id?: string;
  /** Merged into the host element's inline `style`. */
  style?: JSX.CSSProperties;
}

/** The full prop surface of a component produced by `toPreact`. */
export type PreactProps<I> = DomProps<I> & EventProps & HostProps;

/** The Preact component type `toPreact(Component)` returns. `ref` resolves to the
 *  underlying element instance. */
export type DomPreactComponent<I extends HTMLElement = HTMLElement> = FunctionComponent<
  PreactProps<I> & { ref?: Ref<I> }
>;

// ── public API ────────────────────────────────────────────────────────────────

/** Turn a dom component class into a Preact component (props are type-checked). */
export function toPreact<C extends DomComponentClass>(component: C): DomPreactComponent<InstanceType<C>>;
/** Turn a raw tag name into a Preact component — escape hatch, no prop typing. */
export function toPreact(tagName: string): DomPreactComponent;
/** Wrap a pre-built live instance — the returned component mounts that element. */
export function toPreact<I extends HTMLElement>(instance: I): DomPreactComponent<I>;
// Implementation return is `any`: the overloads above are the public contract,
// and `FunctionComponent`'s contravariant props block a single concrete return
// type from being assignable to every overload (a class's typed props vs the raw
// host props). Callers only ever see the overloads.
export function toPreact(
  target: DomComponentClass | HTMLElement | string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (typeof target === "string") return tagComponent(target);
  if (typeof target === "function") return tagComponent(target.tagName);
  return instanceComponent(target); // a live element instance
}

// ── internals ───────────────────────────────────────────────────────────────

/** Renders `<tag-name>` natively and keeps its props/listeners in sync. */
function tagComponent(tagName: string): DomPreactComponent {
  const Wrapped = forwardRef<HTMLElement, PreactProps<HTMLElement>>(function DomComponent(props, ref) {
    const el = useRef<HTMLElement | null>(null);
    const state = useRef<SyncState>({ props: {}, listeners: new Map() });
    const setRef = useCallback(
      (node: HTMLElement | null) => {
        el.current = node;
        assignRef(ref, node);
      },
      [ref],
    );
    useLayoutEffect(() => {
      if (el.current) applyProps(el.current, props as Record<string, unknown>, state.current);
    });
    useLayoutEffect(() => () => detach(el.current, state.current), []);
    return createElement(tagName, { ref: setRef } as never, props.children);
  });
  Wrapped.displayName = `toPreact(${tagName})`;
  return Wrapped as DomPreactComponent;
}

/** Mounts a specific live element into a layout-neutral host Preact owns. */
function instanceComponent(node: HTMLElement): DomPreactComponent {
  const Wrapped = forwardRef<HTMLElement, PreactProps<HTMLElement>>(function DomInstance(props, ref) {
    const host = useRef<HTMLDivElement | null>(null);
    const state = useRef<SyncState>({ props: {}, listeners: new Map() });
    useLayoutEffect(() => {
      host.current?.appendChild(node);
      assignRef(ref, node);
      return () => {
        node.remove();
        detach(node, state.current);
        assignRef(ref, null);
      };
    }, [ref]);
    useLayoutEffect(() => {
      applyProps(node, props as Record<string, unknown>, state.current);
    });
    return createElement("div", { ref: host, style: { display: "contents" } });
  });
  Wrapped.displayName = "toPreact(instance)";
  return Wrapped as DomPreactComponent;
}

interface SyncState {
  /** Last applied plain-prop values, to assign only what changed. */
  props: Record<string, unknown>;
  /** Attached event listeners, keyed by the `on<Event>` prop name. */
  listeners: Map<string, (event: Event) => void>;
}

const HOST_KEYS = new Set(["children", "key", "ref", "className", "id", "style"]);

/** `/^on[A-Z]/` — a Preact/React-style event-handler prop (`onClick`, `onValueChange`). */
function isEventProp(key: string): boolean {
  return key.length > 2 && key[0] === "o" && key[1] === "n" && key[2] >= "A" && key[2] <= "Z";
}

/** Candidate CustomEvent types for an `on<Event>` prop: the decapitalised form
 *  (`onSelect` → `select`) and the literal prop name (`onSelect`), so a handler
 *  matches whether the dom event was named by field or declared with the `on`. */
function eventTypes(key: string): string[] {
  const rest = key.slice(2);
  const decap = rest[0].toLowerCase() + rest.slice(1);
  return [decap, key]; // decap ≠ key always (rest starts uppercase)
}

/** Sync `props` onto `el`: properties for data, addEventListener for `on<Event>`,
 *  plus className/id/style. Diffs against `state` so only changes are applied. */
function applyProps(el: HTMLElement, props: Record<string, unknown>, state: SyncState): void {
  if (props.className !== undefined) el.className = props.className as string;
  if (props.id !== undefined) el.id = props.id as string;
  if (props.style) Object.assign(el.style, props.style);

  const seenEvents = new Set<string>();
  const target = el as unknown as Record<string, unknown>;
  for (const k in props) {
    if (HOST_KEYS.has(k)) continue;
    const v = props[k];
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
  state.props = props;
}

/** Remove every attached listener (unmount / instance teardown). */
function detach(el: HTMLElement | null, state: SyncState): void {
  if (el) for (const [k, fn] of state.listeners) for (const type of eventTypes(k)) el.removeEventListener(type, fn);
  state.listeners.clear();
}

/** Write a value into a callback ref or a ref object. */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}
