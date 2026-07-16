// The single, self-contained UI page (HTML + CSS + JS, no external deps/CDN).
// It opens an EventSource on /events, replays the buffered backlog, and renders a
// live tree of suites → tests with statuses, durations, errors, steps and
// annotations, plus aggregate counters and a final summary banner.

export const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>youneed test devtools</title>
<style>
  :root {
    --bg: #0e0f13; --panel: #16181f; --panel2: #1d2029; --line: #262a35;
    --fg: #e6e8ee; --dim: #8b90a0; --pass: #2ecc71; --fail: #ff5c5c;
    --skip: #b0b4c0; --run: #4aa3ff; --accent: #7c8cff; --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 system-ui, -apple-system, sans-serif; }
  header { position: sticky; top: 0; z-index: 5; background: var(--panel); border-bottom: 1px solid var(--line); padding: 14px 20px; }
  .title { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; letter-spacing: .2px; }
  .title .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--dim); }
  .title .dot.live { background: var(--pass); box-shadow: 0 0 0 3px rgba(46,204,113,.18); }
  .title .dot.done { background: var(--accent); }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .stat { display: flex; align-items: baseline; gap: 6px; background: var(--panel2); border: 1px solid var(--line);
          border-radius: 8px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
  .stat b { font-size: 16px; }
  .stat.passed b { color: var(--pass); } .stat.failed b { color: var(--fail); }
  .stat.skipped b { color: var(--skip); } .stat .lbl { color: var(--dim); font-size: 12px; }
  .bar { height: 4px; border-radius: 3px; margin-top: 10px; background: var(--panel2); overflow: hidden; display: flex; }
  .bar i { display: block; height: 100%; }
  .bar i.p { background: var(--pass); } .bar i.f { background: var(--fail); } .bar i.s { background: var(--skip); }
  main { padding: 16px 20px 60px; max-width: 1000px; margin: 0 auto; }
  .suite { border: 1px solid var(--line); border-radius: 10px; margin: 0 0 12px; overflow: hidden; background: var(--panel); }
  .suite > h2 { margin: 0; padding: 10px 14px; font-size: 14px; display: flex; align-items: center; gap: 10px;
                background: var(--panel2); cursor: pointer; user-select: none; }
  .suite > h2 .count { margin-left: auto; color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; }
  .tests { list-style: none; margin: 0; padding: 0; }
  .tests.collapsed { display: none; }
  .test { border-top: 1px solid var(--line); }
  .test .row { display: flex; align-items: center; gap: 10px; padding: 8px 14px; }
  .test.has-detail .row { cursor: pointer; }
  .test .icon { width: 16px; text-align: center; flex: 0 0 auto; }
  .test.passed .icon { color: var(--pass); } .test.failed .icon { color: var(--fail); }
  .test.skipped .icon { color: var(--skip); } .test.running .icon { color: var(--run); }
  .test .name { flex: 1 1 auto; }
  .test.skipped .name { color: var(--dim); }
  .test .dur { color: var(--dim); font-variant-numeric: tabular-nums; font-size: 12px; }
  .detail { padding: 0 14px 12px 40px; display: none; }
  .test.open .detail { display: block; }
  .err { background: #2a1517; border: 1px solid #45211f; color: #ffb4b4; border-radius: 8px;
         padding: 10px 12px; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; overflow-x: auto; }
  .err .msg { color: var(--fail); font-weight: 700; }
  .steps, .annos, .atts { margin: 8px 0 0; }
  .lbl-h { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin: 8px 0 2px; }
  .step { font-family: var(--mono); font-size: 12px; color: var(--fg); padding: 1px 0; }
  .step .sd { color: var(--dim); } .step.failed { color: var(--fail); }
  .step ul { list-style: none; margin: 0 0 0 14px; padding: 0; border-left: 1px solid var(--line); padding-left: 10px; }
  .tag { display: inline-block; background: var(--panel2); border: 1px solid var(--line); border-radius: 6px;
         padding: 1px 8px; margin: 2px 4px 2px 0; font-size: 12px; }
  .tag b { color: var(--accent); }
  .lanes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .lane { font-size: 11px; color: var(--dim); background: var(--panel2); border: 1px solid var(--line);
          border-radius: 6px; padding: 2px 8px; font-family: var(--mono); }
  .empty { color: var(--dim); text-align: center; padding: 40px; }
</style>
</head>
<body>
<header>
  <div class="title"><span class="dot" id="dot"></span> youneed test devtools <span id="phase" style="color:var(--dim);font-weight:400"></span></div>
  <div class="stats">
    <div class="stat passed"><b id="s-passed">0</b><span class="lbl">passed</span></div>
    <div class="stat failed"><b id="s-failed">0</b><span class="lbl">failed</span></div>
    <div class="stat skipped"><b id="s-skipped">0</b><span class="lbl">skipped</span></div>
    <div class="stat"><b id="s-total">0</b><span class="lbl">total</span></div>
    <div class="stat"><b id="s-time">0</b><span class="lbl">ms</span></div>
  </div>
  <div class="bar"><i class="p" id="bar-p"></i><i class="f" id="bar-f"></i><i class="s" id="bar-s"></i></div>
  <div class="lanes" id="lanes"></div>
</header>
<main><div class="empty" id="empty">Waiting for the run to start…</div><div id="tree"></div></main>

<script>
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// State: suites in insertion order, each with a Map of tests by name.
const suites = new Map();   // suiteName -> { el, list, tests: Map<name, {el, status}> }
const lanes = new Map();    // lane index -> last "suite › name" running there
let order = [];
let finished = false;

function ensureSuite(name) {
  let s = suites.get(name);
  if (s) return s;
  $("empty").style.display = "none";
  const el = document.createElement("section");
  el.className = "suite";
  const h = document.createElement("h2");
  h.innerHTML = '▾ <span class="sname">' + esc(name) + '</span><span class="count"></span>';
  const list = document.createElement("ul");
  list.className = "tests";
  h.onclick = () => list.classList.toggle("collapsed");
  el.append(h, list);
  $("tree").append(el);
  s = { el, head: h, list, tests: new Map(), counts: { passed: 0, failed: 0, skipped: 0 } };
  suites.set(name, s);
  return s;
}

function ensureTest(suiteName, name) {
  const s = ensureSuite(suiteName);
  let t = s.tests.get(name);
  if (t) return t;
  const li = document.createElement("li");
  li.className = "test running";
  li.innerHTML =
    '<div class="row"><span class="icon">◴</span><span class="name">' + esc(name) +
    '</span><span class="dur"></span></div><div class="detail"></div>';
  li.querySelector(".row").onclick = () => { if (li.classList.contains("has-detail")) li.classList.toggle("open"); };
  s.list.append(li);
  t = { el: li, status: "running" };
  s.tests.set(name, t);
  return t;
}

const ICON = { passed: "✓", failed: "✗", skipped: "○", running: "◴" };

function renderSteps(steps) {
  if (!steps || !steps.length) return "";
  const one = (st) =>
    '<li class="step' + (st.error ? " failed" : "") + '">' + (st.error ? "✗ " : "• ") + esc(st.name) +
    ' <span class="sd">' + st.durationMs.toFixed(1) + 'ms</span>' +
    (st.error ? ' — ' + esc(st.error) : "") + renderSteps(st.steps) + '</li>';
  return '<ul>' + steps.map(one).join("") + '</ul>';
}

function detailHTML(r) {
  let h = "";
  if (r.error) {
    h += '<div class="err"><span class="msg">' + esc(r.error.name || "Error") + ": " + esc(r.error.message) + "</span>";
    if (r.error.stack) h += "\\n" + esc(r.error.stack);
    h += "</div>";
  }
  if (r.steps && r.steps.length) h += '<div class="lbl-h">steps</div><div class="steps">' + renderSteps(r.steps) + "</div>";
  if (r.annotations && r.annotations.length) {
    h += '<div class="lbl-h">annotations</div><div class="annos">' +
      r.annotations.map((a) => '<span class="tag"><b>' + esc(a.type) + "</b>" + (a.description ? " " + esc(a.description) : "") + "</span>").join("") + "</div>";
  }
  const atts = r.metadata && r.metadata.attachments;
  if (atts && atts.length) {
    h += '<div class="lbl-h">attachments</div><div class="atts">' +
      atts.map((a) => '<span class="tag"><b>' + esc(a.name) + "</b>" + (a.contentType ? " " + esc(a.contentType) : "") + (a.path ? " " + esc(a.path) : "") + "</span>").join("") + "</div>";
  }
  return h;
}

function applyResult(r) {
  const t = ensureTest(r.suite, r.name);
  t.status = r.status;
  const li = t.el;
  li.className = "test " + r.status;
  li.querySelector(".icon").textContent = ICON[r.status] || "•";
  li.querySelector(".dur").textContent = (r.durationMs != null ? r.durationMs.toFixed(1) + "ms" : "");
  const detail = detailHTML(r);
  li.querySelector(".detail").innerHTML = detail;
  if (detail) li.classList.add("has-detail"); else li.classList.remove("has-detail");
  if (r.status === "failed" && detail) li.classList.add("open");
  recountSuite(r.suite);
}

function recountSuite(name) {
  const s = suites.get(name); if (!s) return;
  const c = { passed: 0, failed: 0, skipped: 0, running: 0 };
  for (const t of s.tests.values()) c[t.status] = (c[t.status] || 0) + 1;
  const parts = [];
  if (c.passed) parts.push(c.passed + " passed");
  if (c.failed) parts.push(c.failed + " failed");
  if (c.skipped) parts.push(c.skipped + " skipped");
  if (c.running) parts.push(c.running + " running");
  s.head.querySelector(".count").textContent = parts.join(" · ");
}

function recountTotals() {
  const c = { passed: 0, failed: 0, skipped: 0 };
  for (const s of suites.values()) for (const t of s.tests.values()) if (c[t.status] != null) c[t.status]++;
  const total = c.passed + c.failed + c.skipped;
  $("s-passed").textContent = c.passed;
  $("s-failed").textContent = c.failed;
  $("s-skipped").textContent = c.skipped;
  $("s-total").textContent = total;
  const pct = (n) => total ? (n / total * 100).toFixed(2) + "%" : "0";
  $("bar-p").style.width = pct(c.passed);
  $("bar-f").style.width = pct(c.failed);
  $("bar-s").style.width = pct(c.skipped);
}

function renderLanes() {
  if (!lanes.size) { $("lanes").innerHTML = ""; return; }
  $("lanes").innerHTML = [...lanes.entries()].sort((a, b) => a[0] - b[0])
    .map(([i, what]) => '<span class="lane">lane ' + i + ": " + esc(what || "idle") + "</span>").join("");
}

function handle(ev) {
  const { event, payload } = ev;
  if (event === "onRunStart") {
    $("dot").className = "dot live"; $("phase").textContent = "running…";
  } else if (event === "onTestStart") {
    ensureTest(payload.suite, payload.name); recountSuite(payload.suite);
  } else if (event === "onTestEnd") {
    applyResult(payload); recountTotals();
  } else if (event === "onProgress") {
    const lane = payload.run ? payload.run.lane : 0;
    if (payload.phase === "testStart") lanes.set(lane, payload.suite + " › " + payload.name);
    else lanes.set(lane, "idle");
    renderLanes();
  } else if (event === "onRunEnd") {
    finished = true;
    $("dot").className = "dot done";
    $("phase").textContent = "done in " + payload.durationMs.toFixed(0) + "ms";
    $("s-time").textContent = payload.durationMs.toFixed(0);
    // Reconcile from the authoritative summary.
    for (const r of payload.results || []) applyResult(r);
    recountTotals();
  }
}

const src = new EventSource("/events");
src.onmessage = (m) => { try { handle(JSON.parse(m.data)); } catch (e) { console.error(e); } };
src.onerror = () => { if (finished) src.close(); else $("phase").textContent = "(disconnected)"; };
</script>
</body>
</html>`;
