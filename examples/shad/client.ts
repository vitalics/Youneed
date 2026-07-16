// Client hydration entry. Importing the shad package + docs-app registers every
// custom element (so the SSR'd Declarative Shadow DOM upgrades), registerTailwind
// feeds them the compiled CSS, and docs-app takes over history navigation.
import "./devtools-setup.ts";
import { registerTailwind } from "@youneed/dom-ui-shad";
import tailwind from "./tailwind.gen.css";
import "./docs-app.ts";
import { mountDevtoolsPanel } from "@youneed/devtools";

registerTailwind(tailwind);
mountDevtoolsPanel();
