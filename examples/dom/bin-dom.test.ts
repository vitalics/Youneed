// Headless self-test for the DOM framework.
// Run: pnpm test:dom
//
// happy-dom must be registered BEFORE bin-dom.ts evaluates (its classes
// `extends HTMLElement` at module load), so we register, capture console (to
// observe lifecycle/watch logs), then dynamically import the framework —
// which auto-mounts <app-root> via bootstrap().

import { registerDOM } from "@youneed/dom/register";
import { installDevtools, components } from "@youneed/devtools";

registerDOM();
installDevtools(); // capture lifecycle/state/events BEFORE the app mounts

// Stub fetch BEFORE import: StatsComponent.onMount kicks off a background fetch
// the moment it mounts (during bootstrap), so the stub must already be in place.
(globalThis as { fetch: unknown }).fetch = async () => ({
  ok: true,
  json: async () => ({ online: 7 }),
});

const logs: string[] = [];
const realLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  logs.push(args.map(String).join(" "));
  realLog(...args);
};

import("./bin-dom.ts").then(runSelfTest);

async function runSelfTest() {
  const flush = () => new Promise<void>((r) => queueMicrotask(r));
  const el = document.querySelector("app-root") as HTMLElement & {
    name: string;
    log: unknown;
  };
  const shadow = el.shadowRoot!;
  const text = () => shadow.textContent!.replace(/\s+/g, " ").trim();

  let failures = 0;
  const check = (label: string, ok: boolean) => {
    if (!ok) failures++;
    realLog(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  };

  await flush();
  realLog("initial render:", text());
  check("renders prop + computed", text().includes("hello hello (HELLO)"));
  check("inherits custom base method (log)", typeof el.log === "function");
  check("onMount lifecycle ran", logs.some((l) => l.includes("[app-root] mounted")));

  // ---- scheduler: background priority + flushSync ----
  const badge = shadow.querySelector("app-badge") as HTMLElement & {
    n: number;
    flushSync(): void;
  };
  const badgeText = () => badge.shadowRoot!.textContent!.trim();
  check("background child initial render", badgeText() === "badge 10");
  badge.n = 42; // background priority -> deferred, not flushed on microtask
  await flush();
  check("background update deferred past microtask", badgeText() === "badge 10");
  badge.flushSync(); // SSR-style synchronous flush
  check("flushSync renders synchronously", badgeText() === "badge 42");

  // priority inversion fix: a background update escalates when render-blocking
  // is requested for the same host before the batch flushes.
  const badgeHost = badge as unknown as { requestUpdate(p?: string): void };
  badge.n = 7; // background -> queued for idle
  badgeHost.requestUpdate("render-blocking"); // escalate same host
  await flush(); // microtask — escalated host flushes now
  check("background escalates to render-blocking", badgeText() === "badge 7");

  // reactive prop -> re-render + computed recompute + watcher
  el.name = "world";
  await flush();
  check("re-render + computed recomputed", text().includes("hello world (WORLD)"));
  check("@watch fired with (next, prev)", logs.some((l) => l.includes("name: hello -> world")));

  // event + emit (Angular @Output / Vue emit)
  let counted: unknown;
  el.addEventListener("count", (e) => (counted = (e as CustomEvent).detail));
  const button = shadow.querySelector("button")!;
  button.click();
  await flush();
  check("event handler ran (clicks++)", text().includes("clicks: 1"));
  check("emit dispatched CustomEvent('count', 1)", counted === 1);

  // async task resolved
  await new Promise((r) => setTimeout(r, 20));
  await flush();
  check("task updated state after await", el.name === "okay");

  // ---- parent <-> child binding ----
  const ticker = shadow.querySelector("app-ticker") as HTMLElement & {
    count: number;
    label: string;
    advance(): void;
  };
  const childText = () =>
    ticker.shadowRoot!.textContent!.replace(/\s+/g, " ").trim();

  check("child upgraded", typeof ticker.advance === "function");
  // parent -> child: property binding pushed `.count=shared` (10) and `.label`
  check("input bound down (.count + .label, no default)", childText().includes("ticks: 10"));

  // child -> parent: emit updates parent's `shared`, which flows back down
  ticker.advance(); // count 10 -> 11, emits 11
  await flush();
  check("change bubbled up to parent", text().includes("shared (two-way): 11"));
  check("and flowed back down to child", childText().includes("ticks: 11"));

  // the ticker OWNS its reset button now: click it -> reset + report up ->
  // parent shared=0 -> flows back down.
  const resetBtn = ticker.shadowRoot!.querySelector("button") as HTMLElement | null;
  check("reset button is inside app-ticker", !!resetBtn);
  resetBtn!.click();
  await flush();
  check("ticker reset flows up + back down", childText().includes("ticks: 0"));

  // ---- realistic background task: polls in the background ----
  const stats = shadow.querySelector("app-stats") as HTMLElement & {
    refresh: { value: number | undefined; run(): Promise<unknown> };
    flushSync(): void;
  };
  const statsText = () => stats.shadowRoot!.textContent!.trim();
  await stats.refresh.run(); // background task runs to completion
  stats.flushSync(); // flush its deferred (background) render
  check("background task fetched + rendered", statsText().includes("online: 7"));

  // ---- styles via a base class (Highlighted) + own component styles ----
  const myText = shadow.querySelector("app-text") as HTMLElement;
  const sheets = myText.shadowRoot!.adoptedStyleSheets;
  const cssTexts = sheets
    .flatMap((s) => [...s.cssRules].map((r) => r.cssText))
    .join(" ");
  check("base + own styles combined", sheets.length === 2);
  check("yellow background from Highlighted base", cssTexts.includes("background: yellow"));
  check("own component rule applied", /font-weight:\s*bold/.test(cssTexts));
  check("content still renders under styles", myText.shadowRoot!.textContent!.includes("some highlighted text"));

  // ---- global events (mousemove) + rAF coalescing ----
  const pointer = shadow.querySelector("app-pointer") as HTMLElement & {
    x: number;
    flushSync(): void;
  };
  const pointerText = () => pointer.shadowRoot!.textContent!.trim();
  // many events in one go — rafScheduler should defer past microtask
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 11, clientY: 22 }));
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 33, clientY: 44 }));
  await flush();
  check("rAF update deferred past microtask", !pointerText().includes("(33, 44)"));
  pointer.flushSync(); // one render for the whole batch
  check("global mousemove rendered (coalesced)", pointerText().includes("(33, 44)"));

  // ---- devtools captured everything ----
  const rootRec = components().find((r) => r.tag === "app-root")!;
  check("devtools captured app-root", !!rootRec);
  check("devtools current props", rootRec.props.name === "okay" && rootRec.props.clicks === 1);
  check("devtools recorded emitted event", rootRec.events.some((e) => e.type === "count"));
  check("devtools kept state history (past states)", rootRec.history.length > 1);
  const textRec = components().find((r) => r.tag === "app-text")!;
  check("devtools captured styles", textRec.styles.length === 2);

  // ---- when() + repeat(): conditional + keyed-list rendering ----
  const todos = shadow.querySelector("app-todos") as HTMLElement & {
    items: Array<{ id: number; text: string; done: boolean }>;
    filter: string;
  };
  const todosShadow = todos.shadowRoot!;
  const todoText = () => todosShadow.textContent!.replace(/\s+/g, " ").trim();
  const lis = () => [...todosShadow.querySelectorAll("li")];

  check("repeat() rendered every item", lis().length === 3);
  check("count reflects items", todoText().includes("2 left · 3 total"));

  // when() / filter: only the done items are visible
  todos.filter = "done";
  await flush();
  check("filter shows only done todos", lis().length === 1 && todoText().includes("learn when()"));

  // keyed reconciliation: the SAME <li> node is reused (moved) on reorder
  todos.filter = "all";
  await flush();
  const firstLi = lis()[0]; // id 1 ("learn when()")
  firstLi.dataset.marked = "yes";
  todos.items = [...todos.items].reverse(); // [3, 2, 1]
  await flush();
  const reordered = lis();
  check(
    "repeat() is keyed — DOM node moved, not recreated",
    reordered[reordered.length - 1] === firstLi && reordered[reordered.length - 1].dataset.marked === "yes",
  );

  // when(): the empty branch renders when nothing is visible
  todos.items = [];
  await flush();
  check("when() renders the empty branch", lis().length === 0 && todoText().includes("nothing here"));

  // ---- abortable task: manual cancel + state flags ----
  const slow = shadow.querySelector("app-slow") as HTMLElement & {
    slow: { run(): Promise<unknown>; abort(): void; pending: boolean; aborted: boolean; error: unknown; value: unknown };
  };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0)); // drains microtasks
  slow.slow.run(); // start the long (8s) task — never resolves in the test window
  await tick();
  check("task pending after run", slow.slow.pending === true);
  slow.slow.abort(); // cancel it
  await tick();
  check("task.abort() stops the run", slow.slow.pending === false);
  check("aborted run sets .aborted (not .error)", slow.slow.aborted === true && slow.slow.error === undefined);
  check("aborted run produced no value", slow.slow.value === undefined);
  // re-run resets the aborted flag synchronously and supersedes the previous run
  slow.slow.run();
  check("re-run clears .aborted + supersedes", slow.slow.aborted === false && slow.slow.pending === true);
  // the superseded (aborted) run's late settlement must NOT clobber the new run
  await tick();
  check("superseded run does not clobber the current one", slow.slow.pending === true && slow.slow.aborted === false);

  // ---- auto-unsubscribe + Symbol.dispose ----
  const root = el as unknown as HTMLElement & {
    pings: number;
    abortSignal: AbortSignal;
    [Symbol.dispose](): void;
  };
  check("[Symbol.dispose] present on host", typeof root[Symbol.dispose] === "function");
  check("signal live while mounted", root.abortSignal.aborted === false);

  document.dispatchEvent(new CustomEvent("app:ping"));
  await flush();
  check("external listener fires while mounted", root.pings === 1);

  el.remove(); // disconnect -> onUnmount + [Symbol.dispose]
  document.dispatchEvent(new CustomEvent("app:ping"));
  await flush();
  check("listener auto-removed after disconnect", root.pings === 1);
  check("disposed on disconnect (signal aborted)", root.abortSignal.aborted === true);

  // the still-pending task (from the re-run above) is auto-aborted by unmount
  await new Promise((r) => setTimeout(r, 0)); // drain the rejection microtasks
  check("in-flight task auto-aborted on unmount", slow.slow.aborted === true);

  realLog("final render:", text(), "| child:", childText());

  // TickerComponent's setInterval keeps the loop alive — exit explicitly.
  realLog(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
