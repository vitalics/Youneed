// SSG: render the app to a static index.html (Declarative Shadow DOM) that
// links the client bundle for hydration. Run after build.mjs.
//
//   pnpm ssg

import { registerDOM } from "@youneed/dom/register";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerDOM();

Promise.all([import("@youneed/ssr"), import("./app.ts")]).then(([ssr, app]) => {
  const page = ssr.renderPage(app.CounterApp, {
    title: "SSG counter",
    clientScript: "./app.js", // IIFE bundle -> classic script -> works over file://
  });
  const out = fileURLToPath(new URL("./index.html", import.meta.url));
  writeFileSync(out, page);
  console.log("wrote", out);
  process.exit(0);
});
