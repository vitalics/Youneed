// SSR of the React + Vue islands. Loaded through Vite's SSR pipeline (it compiles
// .tsx and .vue). Our own component is NOT rendered here: it uses TC39 decorators
// that Vite's SSR transform doesn't lower, so the prerender renders it via tsx
// instead and composes the final document. React/Vue only emit the <dom-stepper>
// tag anyway — the shadow DOM appears once the client upgrades it.

import { createElement } from "react";
import { renderToString as reactRender } from "react-dom/server";
import { createSSRApp } from "vue";
import { renderToString as vueRender } from "vue/server-renderer";
import { ReactIsland } from "./ReactIsland.tsx";
import VueIsland from "./VueIsland.vue";

export const STARTS = { react: 2, vue: 5, ours: 8 };

export async function renderFrameworks(): Promise<{ reactHtml: string; vueHtml: string }> {
  const reactHtml = reactRender(createElement(ReactIsland, { start: STARTS.react }));
  const vueHtml = await vueRender(createSSRApp(VueIsland, { start: STARTS.vue }));
  return { reactHtml, vueHtml };
}
