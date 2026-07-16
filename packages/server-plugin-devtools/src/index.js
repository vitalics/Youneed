// ── @youneed/server-plugin-devtools — public barrel ──────────────────────────
//
// Server topology, OWASP security audit, OpenAPI generation and microbenchmarks
// for `@youneed/server`, plus the live-app plugin/mounter.
//
//   import { securityAudit, toOpenApi, microbench, topology, externalServer } from "@youneed/server-plugin-devtools";
//   import { serveDevtools, devtools } from "@youneed/server-plugin-devtools"; // (also Node-only)
//
// The pure, browser-safe analysis lives in `./core` (imported by the shad UI);
// the Node-only plugin/mounter lives in `./serve`. This barrel re-exports both.
export * from "./core.js";
export { serveDevtools, devtools, } from "./serve.js";
