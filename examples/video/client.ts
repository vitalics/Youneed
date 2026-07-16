// Client entry. Importing components.ts runs the @Component.define decorators:
// the two islands self-register after 3000ms (watch the right video reset), and
// the page shell (@Component.define("server")) never registers on the client —
// so it stays static. No imperative define() / setTimeout needed anymore.

import { installDevtools } from "@youneed/devtools";
import { installPageDevtools } from "@youneed/devtools";
import "./components.ts";

installDevtools();
installPageDevtools();
