// dom-devtools.ts — backwards-compatible barrel. The devtools are now assembled
// from composable parts:
//   • core.ts            — capture/store/read API + the plugin contract (DevtoolsPanel, DevtoolsContext)
//   • component-tree.ts  — the built-in "Components" inspector, as a plugin
//   • panel.ts           — the floating shell that hosts plugins as tabs
//
// Compose your own devtools:
//   mountDevtoolsPanel(document.body, {
//     panels: [componentTreePanel(), ...pageDevtoolsPanels(), myCustomPanel()],
//   });
export * from "./core.ts";
export * from "./component-tree.ts";
export * from "./time-travel.ts";
export * from "./styles.ts";
export * from "./panel.ts";
