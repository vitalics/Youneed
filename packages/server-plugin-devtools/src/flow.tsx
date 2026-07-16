// ── @youneed/server-plugin-devtools/flow — the Topology React-Flow graph ──────
//
// A React Flow island (Client → Server → controllers → routes), wrapped as a
// `@youneed/dom` node via `fromReact` so it drops straight into an html`` panel.
// Fed by the protocol's `Topology.get` (no React knowledge in the shell).

import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
// esbuild bundles this as text (loader { ".css": "text" }) — injected once below.
import flowCss from "@xyflow/react/dist/style.css";

export interface RouteLite {
  method: string;
  path: string;
  controller?: string;
}

const COL = { client: 0, server: 240, ctrl: 520, route: 820 };
const node = (id: string, label: string, x: number, y: number, kind: string): Node => ({
  id,
  position: { x, y },
  data: { label },
  type: "default",
  style: STYLES[kind],
  sourcePosition: "right" as never,
  targetPosition: "left" as never,
});

const STYLES: Record<string, Record<string, string>> = {
  client: { background: "#6366f1", color: "#fff", border: "0", borderRadius: "8px", fontSize: "12px" },
  server: { background: "#0ea5e9", color: "#fff", border: "0", borderRadius: "8px", fontSize: "12px" },
  ctrl: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" },
  route: { background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "11px" },
};

/** The React graph. Groups routes by controller (or "(root)"), one column each. */
export function TopologyGraph({ name, routes }: { name: string; routes: RouteLite[] }) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const edge = (s: string, t: string): void => void edges.push({ id: `${s}->${t}`, source: s, target: t, animated: false });

  nodes.push(node("client", "Client", COL.client, 200, "client"));
  nodes.push(node("server", name || "Server", COL.server, 200, "server"));
  edge("client", "server");

  const groups = new Map<string, RouteLite[]>();
  for (const r of routes) {
    const k = r.controller ?? "(root)";
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  let ci = 0;
  let ry = 0;
  const gap = 56;
  for (const [ctrl, rs] of groups) {
    const cid = `ctrl:${ctrl}`;
    const cy = 80 + ci * 160;
    nodes.push(node(cid, ctrl, COL.ctrl, cy, "ctrl"));
    edge("server", cid);
    for (const r of rs) {
      const rid = `route:${r.method} ${r.path}`;
      nodes.push(node(rid, `${r.method} ${r.path}`, COL.route, 40 + ry * gap, "route"));
      edge(cid, rid);
      ry++;
    }
    ci++;
  }

  return (
    <div style={{ height: 420, border: "1px solid hsl(var(--border))", borderRadius: 8 }}>
      <style>{flowCss}</style>
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }} nodesDraggable={false}>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
