// The terminal abstraction now lives in @youneed/cli core (shared by prompts,
// hotkeys, screen, pager). Re-exported here so this package's public API and
// internal imports are unchanged.
export {
  nodeTerminal,
  scriptedTerminal,
  decodeKeys,
  key,
  type Key,
  type Terminal,
} from "@youneed/cli";
