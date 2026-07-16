// Client entry: install devtools, register components + router, mount the panel.
import "./devtools-setup.ts";
import "./app.ts";
import { mountDevtoolsPanel } from "@youneed/devtools";

mountDevtoolsPanel();
