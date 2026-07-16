// Installs the devtools hook. Imported BEFORE ./app.ts so the components'
// mount events are captured (ES module imports evaluate in source order).
import { installDevtools } from "@youneed/devtools";

installDevtools();
