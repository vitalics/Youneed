// @youneed/dom-scheduler ⨉ React — one source, seven commit strategies.
//
// A single input (drag it, or hit Auto-flood) drives ONE shared value. Each
// block subscribes to it and commits to React differently, counting its renders.
// The needle ticks one notch per React render: a calm, steady needle = few,
// frame-paced renders; a frantic, juddering needle = a storm of renders (the
// waste). Compare the counts to see how scheduling tames the same input.
//
// Strategies:
//   native                  — setState on every update (no batching across tasks)
//   raf                     — honest requestAnimationFrame coalescing (1/frame)
//   raf 60                  — honest rAF, additionally capped to 60fps
//   scheduler (default)     — createScheduler() (microtask)
//   scheduler fps(60)       — createFpsScheduler(60)
//   scheduler raf           — createFpsScheduler() (per-frame, uncapped)
//   scheduler sync          — syncScheduler (commits inline — like native)
//   scheduler custom        — a hand-written throttle scheduler (~12 lines below)

import { memo, useEffect, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createScheduler,
  createFpsScheduler,
  rafScheduler,
  syncScheduler,
  type Scheduler,
  type SchedulerHost,
} from "@youneed/dom-scheduler";
import { Component, css, html } from "@youneed/dom";

// ── the single shared source ──────────────────────────────────────────────────
const store = { value: 0, listeners: new Set<() => void>() };
function setSource(v: number): void {
  store.value = v;
  for (const l of store.listeners) l();
}
function subscribe(l: () => void): () => void {
  store.listeners.add(l);
  return () => store.listeners.delete(l);
}

type Kind =
  | "native"
  | "raf"
  | "raf60"
  | "throttle"
  | "sched-default"
  | "sched-fps60"
  | "sched-raf"
  | "sched-sync"
  | "sched-custom";

type Group = "react" | "scheduler";
const STRATEGIES: { kind: Kind; label: string; group: Group }[] = [
  // Row 1 — plain React, no scheduler (hand-rolled commit strategies).
  { kind: "native", label: "react (native)", group: "react" },
  { kind: "raf", label: "react (raf)", group: "react" },
  { kind: "raf60", label: "react (raf 60fps)", group: "react" },
  { kind: "throttle", label: "react (throttle 120ms)", group: "react" },
  // Row 2 — @youneed/dom-scheduler.
  { kind: "sched-default", label: "scheduler (default)", group: "scheduler" },
  { kind: "sched-fps60", label: "scheduler fps(60)", group: "scheduler" },
  { kind: "sched-raf", label: "scheduler (raf)", group: "scheduler" },
  { kind: "sched-sync", label: "scheduler (sync)", group: "scheduler" },
  { kind: "sched-custom", label: "scheduler (custom throttle 120ms)", group: "scheduler" },
];

// ── a CUSTOM scheduler, in ~12 lines ──────────────────────────────────────────
// The whole contract is `request(host)` + `flushSync()` (everything else is
// optional). Here's a throttle scheduler: it flushes the dirty hosts at most
// once per `ms`, coalescing a burst into one commit. Drop it straight into a
// component's `static scheduler` — the framework treats it like any built-in.
function createThrottleScheduler(ms: number): Scheduler {
  const pending = new Set<SchedulerHost>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    const hosts = [...pending];
    pending.clear();
    for (const h of hosts) h.flush();
  };
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending.clear();
  };
  return {
    name: `throttle(${ms})`,
    request(host) {
      pending.add(host);
      if (timer === undefined) timer = setTimeout(() => ((timer = undefined), flush()), ms);
    },
    flushSync: flush,
    stop,
    [Symbol.dispose]: stop,
  };
}

// A small per-render cost so over-rendering visibly loads the main thread.
function busy(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* spin */
  }
}

// ── the SAME comparison, but rendered by @youneed/dom ─────────────────────────
// A @youneed/dom component subscribes to the same source and re-renders through
// its OWN scheduler — set declaratively via `Component(tag, { scheduler })`, no
// per-component wiring. Each block renders its whole UI in its shadow root and
// counts its renders, mirroring the React blocks.
const DOM_STYLES = css`
  :host { display: block; border: 1px solid #e4e4e7; border-radius: 14px; padding: 14px; text-align: center; font: 15px/1.5 system-ui, sans-serif; }
  .title { font: 12px ui-monospace, monospace; color: #047857; font-weight: 700; min-height: 2.4em; }
  .dial { width: 88px; height: 88px; display: block; margin: 6px auto; }
  .rim { fill: #f4f4f5; stroke: #d4d4d8; stroke-width: 1.5; }
  .needle { stroke: #059669; stroke-width: 3; stroke-linecap: round; }
  .hub { fill: #059669; }
  .value { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .renders { color: #52525b; font-variant-numeric: tabular-nums; }
  .renders b { color: #18181b; }
`;

function defineDomBlock(tag: string, label: string, scheduler?: Scheduler): void {
  @Component.define()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  class DomBlock extends Component(tag, scheduler ? { scheduler } : {}) {
    static styles = DOM_STYLES;
    #value = 0;
    #renders = 0;
    #angle = 0;
    #unsub?: () => void;
    onMount(): void {
      this.#unsub = subscribe(() => {
        this.#value = store.value;
        this.requestUpdate(); // batched through THIS component's scheduler
      });
    }
    onUnmount(): void {
      this.#unsub?.();
    }
    render() {
      this.#renders++;
      this.#angle = (this.#angle + 14) % 360;
      busy(0.8); // same per-render cost as the React blocks
      return html`
        <div class="title">${label}</div>
        <svg class="dial" viewBox="0 0 44 44">
          <circle class="rim" cx="22" cy="22" r="20"></circle>
          <line class="needle" x1="22" y1="22" x2="22" y2="5" transform=${`rotate(${this.#angle} 22 22)`}></line>
          <circle class="hub" cx="22" cy="22" r="2.5"></circle>
        </svg>
        <div class="value">${this.#value}</div>
        <div class="renders">renders: <b>${this.#renders}</b></div>
      `;
    }
  }
}

defineDomBlock("dom-default", "dom (default)");
defineDomBlock("dom-fps60", "dom (fps 60)", createFpsScheduler(60));
defineDomBlock("dom-raf", "dom (raf)", rafScheduler);
defineDomBlock("dom-sync", "dom (sync)", syncScheduler);
defineDomBlock("dom-throttle", "dom (custom throttle 120ms)", createThrottleScheduler(120));

// Subscribe to the source and commit to React per the chosen strategy.
function useStrategy(kind: Kind): { value: number; renders: number } {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const renders = useRef(0);
  renders.current++;
  const latest = useRef(store.value);

  useEffect(() => {
    let rafId = 0;
    let lastFrame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sched: Scheduler | undefined;
    let host: SchedulerHost | undefined;
    if (kind.startsWith("sched")) {
      sched =
        kind === "sched-default" ? createScheduler()
        : kind === "sched-fps60" ? createFpsScheduler(60)
        : kind === "sched-raf" ? rafScheduler
        : kind === "sched-custom" ? createThrottleScheduler(120)
        : syncScheduler;
      host = { depth: 0, flush: () => force() };
    }
    const onChange = () => {
      latest.current = store.value;
      switch (kind) {
        case "native":
          force();
          break;
        case "raf":
          if (!rafId) rafId = requestAnimationFrame(() => ((rafId = 0), force()));
          break;
        case "raf60":
          if (!rafId)
            rafId = requestAnimationFrame((t) => {
              rafId = 0;
              if (t - lastFrame >= 1000 / 60) ((lastFrame = t), force());
            });
          break;
        case "throttle":
          // Hand-rolled throttle (no scheduler): commit at most once per 120ms.
          if (timer === undefined) timer = setTimeout(() => ((timer = undefined), force()), 120);
          break;
        default:
          sched!.request(host!, "render-blocking");
      }
    };
    const unsub = subscribe(onChange);
    return () => {
      unsub();
      if (rafId) cancelAnimationFrame(rafId);
      if (timer !== undefined) clearTimeout(timer);
      // Don't stop the shared rafScheduler (others use it); stop owned ones.
      if (sched && sched !== rafScheduler && sched !== syncScheduler) sched.stop?.();
    };
  }, [kind]);

  return { value: latest.current, renders: renders.current };
}

const Block = memo(function Block({ kind, label }: { kind: Kind; label: string }) {
  const { value, renders } = useStrategy(kind);
  busy(0.8); // amplify the cost of rendering
  const angle = useRef(0);
  angle.current = (angle.current + 14) % 360; // one notch per render
  return (
    <div className="block">
      <div className="title">{label}</div>
      <svg className="dial" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="rim" cx="22" cy="22" r="20" />
        <line className="needle" x1="22" y1="22" x2="22" y2="5" transform={`rotate(${angle.current} 22 22)`} />
        <circle className="hub" cx="22" cy="22" r="2.5" />
      </svg>
      <div className="value">{value}</div>
      <div className="renders">
        renders: <b>{renders.toLocaleString()}</b>
      </div>
    </div>
  );
});

/** Global main-thread smoothness probe (rAF cadence). */
function useUiFps(): number {
  const [fps, setFps] = useState(60);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let acc = 0;
    const loop = (t: number) => {
      acc += t - last;
      last = t;
      frames++;
      if (acc >= 250) ((setFps(Math.round((frames * 1000) / acc)), (frames = 0), (acc = 0)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [auto, setAuto] = useState(false);
  const [gen, setGen] = useState(0); // bump to remount blocks (reset counts)
  const uiFps = useUiFps();

  // Auto-flood: a MessageChannel loop (separate tasks) sweeps the source ~400/s.
  useEffect(() => {
    if (!auto) return;
    const ch = new MessageChannel();
    let stopped = false;
    let last = 0;
    let v = store.value;
    ch.port1.onmessage = () => {
      if (stopped) return;
      const t = performance.now();
      if (t - last >= 2.5) {
        last = t;
        v = (v + 1) % 1000;
        setSource(v);
        if (inputRef.current) inputRef.current.value = String(v);
      }
      ch.port2.postMessage(null);
    };
    ch.port2.postMessage(null);
    return () => {
      stopped = true;
    };
  }, [auto]);

  return (
    <div className="app">
      <h1>@youneed/dom-scheduler ⨉ React — one source, seven strategies</h1>
      <p className="lede">
        Drag the slider (or hit <b>Auto-flood</b>) to drive one shared value. The top row is plain
        React (no scheduler); the bottom row routes the same updates through <b>@youneed/dom-scheduler</b>.
        Each block counts its renders; the needle ticks once per render — a frantic, juddering needle
        means that block is over-rendering.
      </p>

      <div className="controls">
        <input
          ref={inputRef}
          type="range"
          min={0}
          max={1000}
          defaultValue={0}
          onInput={(e) => setSource(Number((e.target as HTMLInputElement).value))}
        />
        <button className={auto ? "stop" : "start"} onClick={() => setAuto((a) => !a)}>
          {auto ? "■ Stop auto-flood" : "▶ Auto-flood"}
        </button>
        <button onClick={() => setGen((g) => g + 1)}>↺ Reset counts</button>
        <span className={"fps " + (uiFps >= 50 ? "good" : "bad")}>UI {uiFps} fps</span>
      </div>

      <div key={gen}>
        <div className="section-title">React — no scheduler</div>
        <div className="grid">
          {STRATEGIES.filter((s) => s.group === "react").map((s) => (
            <Block key={s.kind} kind={s.kind} label={s.label} />
          ))}
        </div>
        <div className="section-title">@youneed/dom-scheduler</div>
        <div className="grid">
          {STRATEGIES.filter((s) => s.group === "scheduler").map((s) => (
            <Block key={s.kind} kind={s.kind} label={s.label} />
          ))}
        </div>
        <div className="section-title">@youneed/dom — same source, scheduler per component</div>
        <div className="grid">
          {/* @ts-expect-error custom elements rendered by @youneed/dom */}
          <dom-default></dom-default>
          {/* @ts-expect-error custom elements rendered by @youneed/dom */}
          <dom-fps60></dom-fps60>
          {/* @ts-expect-error custom elements rendered by @youneed/dom */}
          <dom-raf></dom-raf>
          {/* @ts-expect-error custom elements rendered by @youneed/dom */}
          <dom-sync></dom-sync>
          {/* @ts-expect-error custom elements rendered by @youneed/dom */}
          <dom-throttle></dom-throttle>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
