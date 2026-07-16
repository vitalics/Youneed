// Cascade of async requests, rendered atomically.
//
// A `task()` runs a waterfall of mocked requests (each = setTimeout + Promise).
// The intermediate results are plain locals — they do NOT touch reactive state,
// so the component does NOT re-render mid-flight. The task re-renders exactly
// twice per run: once when it starts (pending) and once when the whole cascade
// resolves (the final value is committed in one shot). Watch the render counter:
// it goes up by 2 per run, not by 1 per request, and the UI never flashes a
// half-loaded state — the previous result stays put until the new one is ready.

import { Component, html, css, task, type OnMount } from "@youneed/dom";

interface Result {
  user: string;
  orders: string;
  summary: string;
  finishedAt: string;
}

/** A mocked request: resolves after `ms`, rejects if the task is aborted. */
function request<T>(value: T, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => resolve(value), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

const STYLES = css`
  :host {
    display: block;
    font-family: system-ui, sans-serif;
    color: #1b1b1f;
  }
  button {
    font: 600 14px system-ui;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #3730a3;
    background: #4f46e5;
    color: #fff;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .stat {
    font: 13px ui-monospace, Menlo, monospace;
    color: #52525b;
    margin-left: 12px;
  }
  .card {
    margin-top: 16px;
    padding: 16px;
    border: 1px solid #d4d4d8;
    border-radius: 10px;
    min-height: 90px;
  }
  .card.stale {
    opacity: 0.5;
  }
  .row {
    display: flex;
    justify-content: space-between;
    font: 13px ui-monospace, Menlo, monospace;
    padding: 2px 0;
  }
  .k {
    color: #2563eb;
  }
  .loading {
    color: #b45309;
    font-weight: 600;
  }
  .empty {
    color: #a1a1aa;
  }
`;

@Component.define()
class CascadeLoader extends Component("cascade-loader", { styles: STYLES }) implements OnMount {
  // Plain fields (NOT reactive): mutating in render would loop; mutating mid-task
  // would force re-renders we explicitly want to avoid.
  renders = 0;
  log: string[] = [];

  // One task wraps the whole 3-request waterfall. Its pending/value changes are
  // the ONLY things that re-render the component.
  load = task<[], Result>(this, async (signal) => {
    this.log = [];
    const mark = (s: string) => this.log.push(s); // recorded, not rendered yet

    const user = await request("Ada Lovelace", 700, signal);
    mark(`① user → ${user}`);
    const orders = await request("3 orders", 700, signal);
    mark(`② orders(user) → ${orders}`);
    const summary = await request("$1,240 total", 700, signal);
    mark(`③ summary(orders) → ${summary}`);

    // Single atomic commit: only now does reactive state change → one render.
    return { user, orders, summary, finishedAt: new Date().toLocaleTimeString() };
  });

  onMount(): void {
    this.load.run();
  }

  @Component.event()
  reload(): void {
    this.load.run();
  }

  render() {
    this.renders++;
    const { pending, value } = this.load;
    // Nested html`` for conditionals — while pending we keep the PREVIOUS value
    // visible (dimmed), never a partially-updated cascade.
    return html`
      <button @click=${this.reload} .disabled=${pending}>
        ${pending ? "Running cascade…" : "Run cascade (3 requests)"}
      </button>
      <span class="stat">renders: ${this.renders}</span>

      <div class="card ${pending ? "stale" : ""}">
        ${pending ? html`<div class="loading">⏳ waiting for the whole cascade…</div>` : ""}
        ${value
          ? html`
              <div class="row"><span class="k">user</span><span>${value.user}</span></div>
              <div class="row"><span class="k">orders</span><span>${value.orders}</span></div>
              <div class="row"><span class="k">summary</span><span>${value.summary}</span></div>
              <div class="row"><span class="k">finished</span><span>${value.finishedAt}</span></div>
            `
          : pending
            ? ""
            : html`<div class="empty">no data yet</div>`}
      </div>
    `;
  }
}
