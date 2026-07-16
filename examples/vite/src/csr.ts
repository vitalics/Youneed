// CSR plane (client-side only): one page, three frameworks, all sharing the same
// <dom-stepper> Web Component. Vite bundles React (JSX), Vue (SFC) and our TS.

import "./our-island.ts"; // registers <our-island> + <dom-stepper>
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { createApp } from "vue";
import { ReactIsland } from "./ReactIsland.tsx";
import VueIsland from "./VueIsland.vue";

// ⚛️ React island
createRoot(document.getElementById("react")!).render(
  createElement(ReactIsland, { start: 2 }),
);

// 💚 Vue island
createApp(VueIsland, { start: 5 }).mount("#vue");

// 🧩 Our framework: <our-island> (declared in index.html) upgrades on import.
console.log("[csr] React + Vue + our-island mounted client-side");
