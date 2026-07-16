// Angular ⇄ @youneed/dom bridge.
//
// `toAngular` builds a `@youneed/dom` custom element for use inside an Angular
// app without hand-writing the tag string. Reference the component itself — the
// class, an instance, or (last resort) the tag name — so usages stay greppable
// and rename-safe, and the props you pass are type-checked against the component.
//
//   import { toAngular } from "@youneed/dom-adapter-angular";
//
//   toAngular(UserCard, { user })          // ← preferred: class + typed props
//   toAngular(new UserCard({ user }))      // a pre-built instance (props baked in)
//   toAngular(UserCard.tagName, { user })  // raw tag string (no prop typing)
//
// It returns a LIVE custom element (an `HTMLElement`). Unlike React, Angular has
// no runtime "element descriptor" to hand back — and a dom component already *is*
// a custom element — so the bridge gives you the node itself. Drop it in via the
// idioms Angular already has: `ElementRef.nativeElement.append(...)`, a
// `ViewContainerRef`, or `Renderer2`. (For a template usage you can also just
// write `<user-card>` under `CUSTOM_ELEMENTS_SCHEMA`; this helper is for the
// imperative, type-checked, refactor-safe path.)
//
// Props are assigned as JS *properties* (not attributes), so a reactive `@prop`
// setter fires with the real value — objects, arrays and functions pass through
// intact. Reassign on the returned element (or call `toAngular` again) to update.

/** A `@youneed/dom` component class: constructible, and it carries the custom
 *  element tag it was registered under. Structural, so this package never has
 *  to import `@youneed/dom` at runtime. */
export interface DomComponentClass<I extends HTMLElement = HTMLElement> {
  new (...args: any[]): I;
  readonly tagName: string;
}

/** The props you may hand a component instance: its `_typed_props` public
 *  contract if it declares one (`declare _typed_props: Props` — see @youneed/dom's
 *  Component()), otherwise its data fields (methods stripped), all optional.
 *  Mirrors dom's own `PublicProps`. */
export type DomProps<I> = I extends { _typed_props: infer P }
  ? P
  : {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      [K in keyof I as I[K] extends Function ? never : K]?: I[K];
    };

// ── public API ────────────────────────────────────────────────────────────────

/** Build a dom element from its class — props are checked against the component. */
export function toAngular<C extends DomComponentClass>(
  component: C,
  props?: DomProps<InstanceType<C>>,
): InstanceType<C>;
/** Apply props to a pre-constructed instance and return it. */
export function toAngular<I extends HTMLElement>(instance: I, props?: Record<string, unknown>): I;
/** Build by raw tag name — escape hatch with no prop typing. */
export function toAngular(tagName: string, props?: Record<string, unknown>): HTMLElement;
export function toAngular(
  target: DomComponentClass | HTMLElement | string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: any, // widened impl signature; the overloads above type the public API
): HTMLElement {
  if (typeof target === "string") return applyProps(document.createElement(target), props);
  if (typeof target === "function") return applyProps(document.createElement(target.tagName), props);
  return applyProps(target, props); // a live element instance
}

// ── internals ───────────────────────────────────────────────────────────────

/** Assign each prop as a JS *property* so reactive `@prop` setters fire with the
 *  real value (objects/arrays/functions pass through intact). */
function applyProps<E extends HTMLElement>(el: E, props?: Record<string, unknown>): E {
  if (props) {
    const target = el as unknown as Record<string, unknown>;
    for (const k in props) target[k] = props[k];
  }
  return el;
}
