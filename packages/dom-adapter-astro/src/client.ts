// Astro ⇄ @youneed/dom bridge (client side).
//
// The browser-side half of `@youneed/dom-adapter-astro`, kept on its own subpath
// (`@youneed/dom-adapter-astro/client`) so a client island never pulls in the
// server-only `@youneed/ssr` renderer.
//
// In an Astro `<script>` island: import your component definitions (which register
// the custom elements and upgrade the SSR'd markup), then call `hydrate()` once —
// it reads the `<script data-hydrate>` blocks `toAstro` emitted and applies the
// props to the matching elements, so each island wakes up with its server data.
//
//   <script>
//     import "../components/user-card";
//     import { hydrate } from "@youneed/dom-adapter-astro/client";
//     hydrate();
//   </script>

export { hydrate, getHydrationProps, Mount } from "@youneed/dom";
