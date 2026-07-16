// Client entry for the Pages example. Bundled to client.js and loaded by every
// SSR'd page (via `clientScript`). It installs the DOM devtools + the SSR/SSG
// tabs, then defines the page components so the SSR'd declarative-shadow elements
// upgrade (hydrate) in the browser.
//
// Order matters: install the devtools hook FIRST, then import the components, so
// their connect is captured and they appear in the Components tree. The
// Page/Routes/Map/Plugins tabs read the JSON the server embedded.

import { installDevtools, installPageDevtools } from "@youneed/devtools";
import { createRouter, OUTLET_SELECTOR } from "@youneed/dom-router";

installDevtools();
installPageDevtools();

// Define + hydrate the page components after the devtools hook is set, so the
// upgrade of <home-app>/<about-app>/<blog-app> is tracked in the Components tree.
const { HomeApp, AboutApp, BlogApp } = await import("./components.ts");

// If the page was rendered with a layout `outlet()`, take over navigation:
// the router swaps only the outlet's content, leaving the header/footer shell
// untouched (partial routing). Without the outlet (e.g. error pages) we no-op.
if (document.querySelector(OUTLET_SELECTOR)) {
  createRouter({
    outlet: OUTLET_SELECTOR,
    mode: "history",
    routes: [
      { path: "/", component: HomeApp },
      { path: "/about", component: AboutApp },
      { path: "/blog", component: BlogApp },
    ],
  });
}
