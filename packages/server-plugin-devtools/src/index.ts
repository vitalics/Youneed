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

export * from "./core.ts";
export {
  serveDevtools,
  devtools,
  type ServeDevtoolsOptions,
  type DevtoolsPluginOptions,
} from "./serve.ts";
export {
  serveProtocol,
  topologyDomain,
  infraDomain,
  type ServeProtocolOptions,
  type ProtocolHandle,
  type TargetDescriptor,
  type TopologyMeta,
} from "./protocol.ts";
export {
  networkTap,
  logTap,
  createEventBus,
  type NetworkEntry,
  type NetworkTap,
  type LogEntry,
  type LogTap,
  type EventBus,
} from "./realtime.ts";
