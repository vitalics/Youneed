// Client hydration entry for the SSR/SSG page. Re-attaches each framework to its
// server-rendered markup (no re-creation): React hydrateRoot, Vue createSSRApp
// mount, and our custom elements upgrade in place when dom-stepper is imported.

import "./our-island.ts"; // upgrades <our-island> + every <dom-stepper> (React/Vue islands too)
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { createSSRApp } from "vue";
import { ReactIsland } from "./ReactIsland.tsx";
import VueIsland from "./VueIsland.vue";

hydrateRoot(document.getElementById("react")!, createElement(ReactIsland, { start: 2 }));
createSSRApp(VueIsland, { start: 5 }).mount("#vue");

console.log("[hydrate] React + Vue hydrated, <dom-stepper> upgraded");
