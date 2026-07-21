// Docs client entry — hydrates the SSR'd custom elements
// (bundled by esbuild in scripts/build-client.mjs → /docs.js).
import "./components/copy-button.ts";
import "./components/docs-nav.ts";
import { highlightAll } from "./highlight.ts";

// Code blocks are highlighted at SSR time (data-hl is dropped there); this is
// a no-op safety net for any block the server didn't process.
highlightAll();

// Mobile disclosure: toggle nav body visibility from the <details> element,
// and close it after a link is tapped.
(() => {
  const details = document.getElementById("railToggle") as HTMLDetailsElement | null;
  const body = document.getElementById("railNavBody");
  if (!details || !body) return;
  const sync = () => {
    body.hidden = !details.open;
  };
  details.addEventListener("toggle", sync);
  sync();
  body.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".rail__link")) details.open = false;
  });
})();
