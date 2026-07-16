// ── @youneed/dom-provider-env/devtools — env panel for devtools ──────────────
//
// A DISPLAY-only panel (env is static — nothing to capture): it lists every
// environment defined via `defineEnvironmentVariables`, with each field's value,
// type and flags. Secret fields are MASKED (`[REDACTED]`) via the schema, so the
// panel is safe to screenshot.
//
//   import { mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
//   import { envPanel } from "@youneed/dom-provider-env/devtools";
//
//   mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), envPanel()] });
//
// It reads the registry the core fills on each `defineEnvironmentVariables` call
// (`registeredEnvironments()` / `onEnvironmentRegistered()`), so any UI can render
// the same data without this panel.

import { el, type DevtoolsContext, type DevtoolsPanel } from "@youneed/devtools";
import {
  describeEnv,
  onEnvironmentRegistered,
  registeredEnvironments,
  type RegisteredEnvironment,
} from "./index.ts";

const ENV_CSS = `
  :host { display: block; padding: 8px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .section { margin: 10px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  .muted { color: #71717a; }
  .var { display: grid; grid-template-columns: minmax(120px, max-content) 1fr auto; gap: 8px; padding: 1px 0; align-items: baseline; }
  .var .key { color: #93c5fd; }
  .var .val { color: #e4e4e7; word-break: break-all; }
  .var .val.secret { color: #f87171; }
  .var .meta { color: #71717a; font-size: 10px; white-space: nowrap; }
  .var .flag { color: #fbbf24; }
`;

/** Per-field annotation: `string`, `int · optional`, `port · default`, `url · secret`. */
function meta(entry: RegisteredEnvironment, key: string): string {
  const s = entry.schema[key]!;
  const flags: string[] = [];
  if (s.isSecret) flags.push("secret");
  if (s.hasDefault) flags.push("default");
  else if (s.isOptional) flags.push("optional");
  return flags.length ? `${s.kind} · ${flags.join(" · ")}` : s.kind;
}

function paint(container: HTMLElement): void {
  container.textContent = "";
  const envs = registeredEnvironments();
  if (envs.length === 0) {
    container.append(el("div", "muted", "no environments defined (call defineEnvironmentVariables)"));
    return;
  }
  for (const entry of envs) {
    container.append(el("div", "section", entry.name));
    const view = describeEnv(entry.values as never, entry.schema); // secrets → [REDACTED]
    const keys = Object.keys(entry.schema);
    if (keys.length === 0) {
      container.append(el("div", "muted", "(empty schema)"));
      continue;
    }
    for (const key of keys) {
      const raw = view[key];
      const isSecret = entry.schema[key]!.isSecret;
      const value = raw === undefined ? "—" : typeof raw === "string" ? raw : JSON.stringify(raw);
      container.append(
        el("div", "var", [
          el("span", "key", key),
          el("span", `val${isSecret ? " secret" : ""}`, value),
          el("span", "meta", meta(entry, key)),
        ]),
      );
    }
  }
}

/**
 * The env devtools panel: lists every defined environment, with values, types and
 * flags — secrets masked. Returns a `DevtoolsPanel` for `mountDevtoolsPanel({ panels })`.
 */
export function envPanel(): DevtoolsPanel {
  return {
    id: "env",
    title: "env",
    styles: ENV_CSS,
    render(container: HTMLElement, _ctx: DevtoolsContext): () => void {
      paint(container);
      // Repaint when a new environment is defined (e.g. a lazily-loaded source).
      return onEnvironmentRegistered(() => paint(container));
    },
  };
}
