// Browser bundle for the CLI devtools UI → dist/web/client.js (built by build-web.mjs).
//
// The UI is the SAME unified <youneed-devtools> shell over @youneed/devtools-protocol
// that the server devtools serves — so a CLI's devtools looks identical to a
// server's. `./ext.ts` re-registers the `CLI` domain with shad components (the
// command/option builder); the served page contains
// `<youneed-devtools discovery="/json">`, which self-loads on mount.
import { registerTailwind } from "@youneed/dom-ui-shad"; // importing also registers every shad-* element
import "@youneed/devtools-protocol/shell"; // defines <youneed-devtools>
import "./ext.ts"; // shad CLI builder panel (overrides the plain-HTML default)
import tailwind from "../web.gen.css";
import theme from "../../dom-ui-shad/src/theme.css";

// Document-level theme + Tailwind vars cascade into the shad shadow roots.
document.head.appendChild(Object.assign(document.createElement("style"), { textContent: theme }));
registerTailwind(tailwind);
