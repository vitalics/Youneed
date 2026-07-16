// Angular CSR entry. Two steps, mirroring csr.ts for the other islands:
//   1. register <dom-stepper> (our Web Component — TC39 decorators, lowered by
//      `domFramework()`); importing the module is enough to `customElements.define`;
//   2. bootstrap the standalone Angular island into its <ng-island> host.
// Zoneless change detection (no zone.js) — the island drives the view with signals,
// exactly like the repo's Angular bench.
import "./dom-stepper.ts"; // defines <dom-stepper>
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { AngularIsland } from "./AngularIsland.ts";

bootstrapApplication(AngularIsland, {
  providers: [provideZonelessChangeDetection()],
}).catch((err) => console.error("[angular] bootstrap failed", err));

console.log("[angular] <ng-island> bootstrapped, driving <dom-stepper>");
