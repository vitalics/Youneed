// Docs page entry.
import "./components/copy-button.ts";
import "./components/docs-nav.ts";
import { highlightAll } from "./highlight.ts";

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
