// Where @youneed/dom beats idiomatic React: FINE-GRAINED updates.
//
// One cell of a grid changes at a time. Three panels render the same grid:
//   • React (state up)   — array in a parent; setState re-renders the WHOLE
//                          subtree, so every cell re-renders for a 1-cell change.
//   • React (memo)        — the fix: React.memo on every cell + stable props →
//                          only the changed cell re-renders (but: boilerplate).
//   • @youneed/dom        — each cell is an independent component subscribed to
//                          its own slot; only the changed cell re-renders — by
//                          default, no memo, no parent involvement. The whole
//                          grid is ONE dom component, mounted into React via
//                          `toReact(VmGrid)` (no hand-written tag string).
//
// Watch the TOTAL renders per panel: plain React does ~N× the work of the other
// two. @youneed/dom matches hand-optimized React for free.

import { memo, useEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import { Component, css, html } from "@youneed/dom";
import { toReact } from "@youneed/dom-react-adapter";

const COLS = 8;
const ROWS = 5;
const SIZE = COLS * ROWS;

// ── shared store: a value per cell, with fine-grained + whole-array notify ─────
const values = new Array<number>(SIZE).fill(0);
const cellSubs = Array.from({ length: SIZE }, () => new Set<() => void>());
const arraySubs = new Set<() => void>();
function bumpCell(i: number): void {
  values[i]++;
  for (const l of cellSubs[i]) l(); // fine-grained: only this cell's subscribers
  for (const l of arraySubs) l(); // coarse: anyone watching the whole array (React state-up)
}
function subCell(i: number, l: () => void): () => void {
  cellSubs[i].add(l);
  return () => cellSubs[i].delete(l);
}
function subArray(l: () => void): () => void {
  arraySubs.add(l);
  return () => arraySubs.delete(l);
}

// per-cell render tallies (module-level so the heatmap + totals can read them)
const counts = {
  naive: new Array<number>(SIZE).fill(0),
  memo: new Array<number>(SIZE).fill(0),
  dom: new Array<number>(SIZE).fill(0),
};
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
function resetAll(): void {
  values.fill(0);
  counts.naive.fill(0);
  counts.memo.fill(0);
  counts.dom.fill(0);
}

// More renders → hotter (redder) background. The visual "wasted work" heatmap.
function heat(n: number): string {
  if (!n) return "#f4f4f5";
  const l = Math.max(42, 95 - Math.min(53, Math.log2(n + 1) * 9));
  return `hsl(6 82% ${l}%)`;
}

// ── React cells ───────────────────────────────────────────────────────────────
function CellView({ v, n }: { v: number; n: number }) {
  return (
    <div className="cell" style={{ background: heat(n) }}>
      <span className="cv">{v}</span>
      <span className="cn">{n}</span>
    </div>
  );
}

// NOT memoized → re-renders whenever the parent renders (i.e. every tick).
function NaiveCell({ i }: { i: number }) {
  counts.naive[i]++;
  return <CellView v={values[i]} n={counts.naive[i]} />;
}
const NaivePanel = memo(function NaivePanel() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subArray(() => force()), []);
  return (
    <div className="grid">
      {Array.from({ length: SIZE }, (_, i) => (
        <NaiveCell key={i} i={i} />
      ))}
    </div>
  );
});

// Memoized + value prop → only the cell whose value changed re-renders.
const MemoCell = memo(function MemoCell({ i, v }: { i: number; v: number }) {
  counts.memo[i]++;
  return <CellView v={v} n={counts.memo[i]} />;
});
const MemoPanel = memo(function MemoPanel() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subArray(() => force()), []);
  return (
    <div className="grid">
      {Array.from({ length: SIZE }, (_, i) => (
        <MemoCell key={i} i={i} v={values[i]} />
      ))}
    </div>
  );
});

// ── @youneed/dom cell: an independent component per slot ───────────────────────
@Component.define()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class VmCell extends Component("vm-cell") {
  static styles = css`
    :host { display: block; }
    .cell {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      aspect-ratio: 1; border-radius: 6px; font: 11px ui-monospace, monospace;
    }
    .cv { font-size: 13px; font-weight: 800; }
    .cn { color: #3f3f46; opacity: .7; }
  `;
  #unsub?: () => void;
  #idx(): number {
    return Number(this.getAttribute("i") ?? 0);
  }
  onMount(): void {
    this.#unsub = subCell(this.#idx(), () => this.requestUpdate());
  }
  onUnmount(): void {
    this.#unsub?.();
  }
  render() {
    const i = this.#idx();
    counts.dom[i]++;
    return html`
      <div class="cell" style=${`background:${heat(counts.dom[i])}`}>
        <span class="cv">${values[i]}</span>
        <span class="cn">${counts.dom[i]}</span>
      </div>
    `;
  }
}
// The whole grid is ONE @youneed/dom component (not React mapping cells). It
// renders once on mount, laying out the cells; each cell then re-renders itself
// independently on its own slot change — no React, no memo anywhere.
@Component.define()
class VmGrid extends Component("vm-grid") {
  static styles = css`
    :host { display: block; }
    .grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr); gap: 4px; }
  `;
  render() {
    return html`<div class="grid">${Array.from({ length: SIZE }, (_, i) => html`<vm-cell i=${i}></vm-cell>`)}</div>`;
  }
}

// ── app ─────────────────────────────────────────────────────────────────────
function Panel({ title, total, hint, children }: { title: string; total: number; hint: string; children: React.ReactNode }) {
  return (
    <div className="panel">
      <div className="phead">
        <span className="ptitle">{title}</span>
        <span className="ptotal">{total.toLocaleString()} renders</span>
      </div>
      <div className="phint">{hint}</div>
      {children}
    </div>
  );
}

function App() {
  const [running, setRunning] = useState(false);
  const [gen, setGen] = useState(0);
  const [, tick] = useReducer((n: number) => n + 1, 0); // stats refresh

  useEffect(() => {
    const id = setInterval(() => tick(), 200);
    return () => clearInterval(id);
  }, []);

  // Firehose: ~200 single-cell updates/sec (one random cell each), separate tasks.
  useEffect(() => {
    if (!running) return;
    const ch = new MessageChannel();
    let stopped = false;
    let last = 0;
    let i = 0;
    ch.port1.onmessage = () => {
      if (stopped) return;
      const t = performance.now();
      if (t - last >= 5) {
        last = t;
        i = (i + 7) % SIZE; // deterministic sweep, one cell at a time
        bumpCell(i);
      }
      ch.port2.postMessage(null);
    };
    ch.port2.postMessage(null);
    return () => {
      stopped = true;
    };
  }, [running]);

  return (
    <div className="app">
      <h1>@youneed/dom vs React — fine-grained updates</h1>
      <p className="lede">
        One cell of the grid changes at a time. Same data, three renderers. Watch the{" "}
        <b>total renders</b> and the heatmap: plain React re-renders the whole grid for a one-cell
        change; <b>@youneed/dom</b> repaints only the changed cell — by default, no memo.
      </p>
      <div className="controls">
        <button className={running ? "stop" : "start"} onClick={() => setRunning((r) => !r)}>
          {running ? "■ Stop" : "▶ Start updates"}
        </button>
        <button
          onClick={() => {
            resetAll();
            setGen((g) => g + 1);
          }}
        >
          ↺ Reset
        </button>
      </div>

      <div className="panels" key={gen}>
        <Panel title="React (state up)" total={sum(counts.naive)} hint="parent setState → whole subtree re-renders">
          <NaivePanel />
        </Panel>
        <Panel title="React (memo)" total={sum(counts.memo)} hint="React.memo on every cell — the manual fix">
          <MemoPanel />
        </Panel>
        <Panel title="@youneed/dom" total={sum(counts.dom)} hint="one grid component; each cell re-renders itself — no memo">
          {toReact(VmGrid)}
        </Panel>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
