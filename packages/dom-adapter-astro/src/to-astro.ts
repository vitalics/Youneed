// Astro ⇄ @youneed/dom bridge (server side).
//
// Astro is SSR-first and compiler-driven — there is no runtime "Astro component"
// to construct — so the bridge meets Astro where it lives: it renders a
// `@youneed/dom` component to an HTML string (Declarative Shadow DOM, styles
// inlined) that you drop into a `.astro` template with `set:html`. The custom
// element upgrades itself on the client the moment its definition is imported, and
// a `<script data-hydrate>` block lets `hydrate()` re-apply the props it was
// rendered with — so the island comes alive with the same data.
//
//   ---
//   // src/pages/index.astro  (server frontmatter)
//   import { toAstro } from "@youneed/dom-adapter-astro";
//   import { UserCard } from "../components/user-card";
//   const markup = await toAstro(UserCard, { user });
//   ---
//   <Fragment set:html={markup} />
//
//   <script>
//     // client island: importing the component registers + upgrades it,
//     // then hydrate() applies the SSR'd props.
//     import "../components/user-card";
//     import { hydrate } from "@youneed/dom-adapter-astro/client";
//     hydrate();
//   </script>
//
// Passing the component (not a bare tag string) keeps the usage greppable and
// rename-safe, and the props are type-checked against its `@prop` fields.
//
// `@youneed/dom` and `@youneed/ssr` are PEER dependencies, imported *dynamically*
// inside `toAstro` so this stays a server-only path (the client bundle pulls only
// the tiny `/client` re-export). A server DOM must be registered before your
// component classes are imported — see `registerDOM()` and the README.

/** A `@youneed/dom` component class: constructible, and it carries the custom
 *  element tag it was registered under. Structural, so the public types never
 *  force a value import of `@youneed/dom`. */
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

/** Options for `toAstro`. */
export interface ToAstroOptions {
  /** Emit a `<script type="application/json" data-hydrate>` block carrying the
   *  props, so the client `hydrate()` re-applies them after the element upgrades.
   *  Default `true` whenever there are props to carry. Set `false` for fully
   *  static (non-interactive) markup. */
  hydrate?: boolean;
}

// ── public API ────────────────────────────────────────────────────────────────

/** Render a dom component class to SSR HTML (props are type-checked). */
export function toAstro<C extends DomComponentClass>(
  component: C,
  props?: DomProps<InstanceType<C>>,
  options?: ToAstroOptions,
): Promise<string>;
/** Render a raw tag name to SSR HTML — escape hatch, no prop typing. */
export function toAstro(tagName: string, props?: Record<string, unknown>, options?: ToAstroOptions): Promise<string>;
/** Render a pre-built live instance to SSR HTML. */
export function toAstro<I extends HTMLElement>(instance: I, props?: DomProps<I>, options?: ToAstroOptions): Promise<string>;
export async function toAstro(
  target: DomComponentClass | HTMLElement | string,
  // The overloads above are the public contract; the implementation accepts any
  // prop shape so each overload's `props` type stays assignable to it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: any,
  options: ToAstroOptions = {},
): Promise<string> {
  // A server DOM must already exist (importing any dom component requires it). The
  // call is idempotent and a no-op when a DOM is present, so it's safe defensively.
  const { registerDOM } = await import("@youneed/dom/register");
  registerDOM();
  const { getHydrationProps } = await import("@youneed/dom");
  const { renderToString } = await import("@youneed/ssr");

  // Build the element to serialize, and decide the props to hydrate with.
  let element: HTMLElement;
  let hydrateProps: Record<string, unknown> | undefined;
  if (typeof target === "string") {
    element = document.createElement(target);
    if (props) Object.assign(element, props);
    hydrateProps = props;
  } else if (typeof target === "function") {
    element = new target(props);
    hydrateProps = props;
  } else {
    element = target;
    if (props) Object.assign(element, props);
    // Fall back to the props the instance was constructed with.
    hydrateProps = props ?? getHydrationProps(element);
  }

  const body = renderToString(element);

  // A `data-hydrate` script the client's `hydrate()` reads to re-apply props.
  const wantHydrate = options.hydrate ?? true;
  let script = "";
  if (wantHydrate && hydrateProps && Object.keys(hydrateProps).length > 0) {
    const json = JSON.stringify({ tag: element.tagName.toLowerCase(), props: hydrateProps }).replace(/</g, "\\u003c");
    script = `<script type="application/json" data-hydrate>${json}</script>`;
  }

  return body + script;
}
