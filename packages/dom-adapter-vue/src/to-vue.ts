// Vue ⇄ @youneed/dom bridge.
//
// `toVue` turns a `@youneed/dom` custom element into a real Vue component, so you
// use it like any other component — by reference (greppable, rename-safe) and with
// its props type-checked. Reference the component itself (the class), or a tag name
// / live instance as escape hatches.
//
//   import { toVue } from "@youneed/dom-adapter-vue";
//   import { UserCard } from "./user-card";
//
//   const VueUserCard = toVue(UserCard);   // ← a Vue component
//
//   // <VueUserCard :user="user" @select="e => console.log(e.detail)" />
//
// • Plain props are assigned as JS *properties* (not attributes), so reactive
//   `@prop` setters fire with the real value — objects, arrays and functions pass
//   through intact, and they stay in sync when Vue re-renders.
// • `@<event>` listeners (i.e. `on<Event>` props) are wired to the component's
//   exposed `@Component.event` CustomEvents. `@select` (→ `onSelect`) listens for
//   the `select` *and* `onSelect` event types, so it works whether the dom author
//   named the event `select` (field name) or `onSelect` (explicit) — the handler
//   receives the `CustomEvent` (read `e.detail`).
// • The default slot becomes the element's light DOM (projected into its `<slot>`);
//   `class`, `id` and `style` are forwarded to the host element; a template `ref`
//   exposes `{ element }` — the underlying element instance.

import type { Component, CSSProperties, DefineComponent, SlotsType, VNode } from "vue";
import { defineComponent, h, normalizeClass, normalizeStyle, onBeforeUnmount, onMounted, onUpdated, ref } from "vue";

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

/** Event-listener props: any `on<Event>` handler receives the matching exposed
 *  `CustomEvent`. The convention is `onFoo` → the `foo` event (read `e.detail`),
 *  which in a Vue template is the `@foo` listener. */
export type EventProps = {
  [K in `on${string}`]?: (event: CustomEvent) => void;
};

/** Host-level props layered on top of the component's own. */
export interface HostProps {
  /** Forwarded to the host element's `class`. */
  class?: unknown;
  /** Forwarded to the host element's `id`. */
  id?: string;
  /** Merged into the host element's inline `style`. */
  style?: string | CSSProperties;
}

/** The full prop surface of a component produced by `toVue`. */
export type VueProps<I> = DomProps<I> & EventProps & HostProps;

/** The Vue component type `toVue(Component)` returns — accepts the component's own
 *  props plus `on<Event>` listeners, `class`/`id`/`style`, and a default slot. */
export type DomVueComponent<I extends HTMLElement = HTMLElement> = DefineComponent<VueProps<I>>;

// ── public API ────────────────────────────────────────────────────────────────

/** Turn a dom component class into a Vue component (props are type-checked). */
export function toVue<C extends DomComponentClass>(component: C): DomVueComponent<InstanceType<C>>;
/** Turn a raw tag name into a Vue component — escape hatch, no prop typing. */
export function toVue(tagName: string): DomVueComponent;
/** Wrap a pre-built live instance — the returned component mounts that element. */
export function toVue<I extends HTMLElement>(instance: I): DomVueComponent<I>;
export function toVue(target: DomComponentClass | HTMLElement | string): Component {
  if (typeof target === "string") return tagComponent(target);
  if (typeof target === "function") return tagComponent(target.tagName);
  return instanceComponent(target); // a live element instance
}

// ── internals ───────────────────────────────────────────────────────────────

/** Renders `<tag-name>` natively and keeps its props/listeners in sync. */
function tagComponent(tagName: string): DomVueComponent {
  return defineComponent({
    name: `toVue(${tagName})`,
    inheritAttrs: false,
    slots: Object as SlotsType<{ default?: () => VNode[] }>,
    setup(_props, { attrs, slots, expose }) {
      const el = ref<HTMLElement | null>(null);
      const state: SyncState = { props: {}, listeners: new Map() };
      const sync = () => {
        if (el.value) applyProps(el.value, attrs as Record<string, unknown>, state);
      };
      onMounted(sync);
      onUpdated(sync);
      onBeforeUnmount(() => detach(el.value, state));
      expose({
        get element() {
          return el.value;
        },
      });
      return () => h(tagName, { ref: el }, slots.default?.());
    },
  }) as DomVueComponent;
}

/** Mounts a specific live element into a layout-neutral host Vue owns. */
function instanceComponent(node: HTMLElement): DomVueComponent {
  return defineComponent({
    name: "toVue(instance)",
    inheritAttrs: false,
    setup(_props, { attrs, expose }) {
      const host = ref<HTMLElement | null>(null);
      const state: SyncState = { props: {}, listeners: new Map() };
      onMounted(() => {
        host.value?.appendChild(node);
        applyProps(node, attrs as Record<string, unknown>, state);
      });
      onUpdated(() => applyProps(node, attrs as Record<string, unknown>, state));
      onBeforeUnmount(() => {
        node.remove();
        detach(node, state);
      });
      expose({ element: node });
      return () => h("div", { ref: host, style: { display: "contents" } });
    },
  }) as DomVueComponent;
}

interface SyncState {
  /** Last applied plain-prop values, to assign only what changed. */
  props: Record<string, unknown>;
  /** Attached event listeners, keyed by the `on<Event>` prop name. */
  listeners: Map<string, (event: Event) => void>;
}

const HOST_KEYS = new Set(["key", "ref", "class", "id", "style"]);

/** `/^on[A-Z]/` — a Vue/React-style event-handler prop (`onClick`, `onValueChange`). */
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
 *  plus class/id/style. Diffs against `state` so only changes are applied. */
function applyProps(el: HTMLElement, props: Record<string, unknown>, state: SyncState): void {
  if (props.class !== undefined) el.setAttribute("class", normalizeClass(props.class));
  if (props.id !== undefined) el.id = props.id as string;
  if (props.style !== undefined) {
    const style = normalizeStyle(props.style as never);
    if (typeof style === "string") el.style.cssText = style;
    else if (style) Object.assign(el.style, style);
  }

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
  // Snapshot, not the live reference: Vue reuses one `attrs` proxy across renders
  // (unlike React's fresh object), so the diff above must compare against a copy.
  state.props = { ...props };
}

/** Remove every attached listener (unmount / instance teardown). */
function detach(el: HTMLElement | null, state: SyncState): void {
  if (el) for (const [k, fn] of state.listeners) for (const type of eventTypes(k)) el.removeEventListener(type, fn);
  state.listeners.clear();
}
