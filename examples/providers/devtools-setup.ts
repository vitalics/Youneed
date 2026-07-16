// CAPTURE: install devtools + every plugin BEFORE the app mounts, so the panels
// have data. Each plugin is the capture half of a feature (the panels render it).
import { installDevtools } from "@youneed/devtools";
import { i18nPlugin } from "@youneed/dom-provider-i18n/devtools";
import { a11yPlugin } from "@youneed/dom-provider-a11y/devtools";
import { zustandPlugin } from "@youneed/dom-provider-zustand/devtools";
import { cart } from "./stores.ts";

installDevtools({
  plugins: [
    i18nPlugin(), // records every t() call, framework-wide
    a11yPlugin(), // records every screen-reader announcement
    zustandPlugin(cart, { name: "cart" }), // records every store change (with restore)
  ],
});
