// Client bundle (served at /client.js). Registers the component, then hydrates:
// applies the server-serialized props to the SSR'd <user-view>, so it becomes
// interactive with the same data — no refetch.
import { hydrate } from "@youneed/dom";
import "./view.ts"; // defines <user-view>
import { installDevtools, mountDevtoolsPanel } from "@youneed/devtools";

installDevtools();
hydrate();
mountDevtoolsPanel();
