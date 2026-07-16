// Client entry. Import order matters:
//   1. devtools-setup — installs the hook before any component mounts;
//   2. app — registers the elements, which then upgrade & mount (captured);
// then mount the inspector panel.
import "./devtools-setup.ts";
import "./app.ts";
import { mountDevtoolsPanel } from "@youneed/devtools";

mountDevtoolsPanel();
