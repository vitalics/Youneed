import "./devtools-setup.ts"; // capture first
import "./app.ts"; // then define + mount the components
import { defaultPanels, mountDevtoolsPanel } from "@youneed/devtools";
import { i18nPanel } from "@youneed/dom-provider-i18n/devtools";
import { a11yPanel } from "@youneed/dom-provider-a11y/devtools";
import { zustandPanel } from "@youneed/dom-provider-zustand/devtools";
import { i18n, resources } from "./stores.ts";

// DISPLAY: the built-in inspector tabs PLUS one tab per feature. Open the
// floating devtools panel (bottom-right launcher) to see them all.
mountDevtoolsPanel(document.body, {
  panels: [
    ...defaultPanels(), // components / time-travel / styles
    i18nPanel(i18n, { resources }), // locale switcher + key browser + t() tail
    a11yPanel(), // announcements tail + CSS audit
    zustandPanel(), // store state + change log with restore
  ],
});
