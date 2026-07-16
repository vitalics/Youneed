// Browser bundle for the devtools UI → dist/web/client.js (built by build-web.mjs).
//
// The UI is the unified <youneed-devtools> shell over @youneed/devtools-protocol.
// `./ext.ts` registers the RICH domain UI extensions (shad components + the
// React-Flow topology graph); the served page contains
// `<youneed-devtools discovery="{path}/json">`, which self-loads on mount.
import { registerTailwind } from "@youneed/dom-ui-shad";
import "@youneed/devtools-protocol/shell"; // defines <youneed-devtools>
import "./ext.ts"; // registers shad + React-Flow extensions (Topology graph, …)
// Plugin packages ship their OWN interactive devtools panels (registry renderers,
// keyed by inspect().kind). Importing them here has the registration side effect;
// the Infra extension (ext.ts) then renders each plugin's rich `panel()` inline,
// restoring full interactivity (ORM studio, Pub/Sub sender, KV browser, …).
import "@youneed/orm-sql/devtools";
import "@youneed/orm-nosql/devtools";
import "@youneed/server-plugin-pubsub/devtools";
import "@youneed/server-plugin-kv/devtools";
import "@youneed/server-plugin-jobs/devtools";
import "@youneed/server-plugin-queue/devtools";
import "@youneed/server-plugin-storage/devtools";
import "@youneed/server-plugin-mailer/devtools";
import "@youneed/server-plugin-graphql/devtools";
import "@youneed/server-plugin-grpc/devtools";
import "@youneed/server-plugin-otlp/devtools";
import "@youneed/server-plugin-feature-flags/devtools";
import "@youneed/server-plugin-rbac/devtools";
import "@youneed/server-plugin-secrets/devtools";
import "@youneed/server-plugin-docker/devtools";
import tailwind from "../web.gen.css";
import theme from "../../dom-ui-shad/src/theme.css";

// Document-level theme + Tailwind vars cascade into the shad shadow roots.
document.head.appendChild(Object.assign(document.createElement("style"), { textContent: theme }));
registerTailwind(tailwind);
