// @youneed/cli-plugin-devtools — the HTML UI.
//
// A single self-contained page: the catalogue is inlined as JSON, and a small
// vanilla-JS app renders the command list, a per-command builder (inputs for
// each argument and option), a live preview of the assembled command line, and
// Copy / Run buttons. No build step, no client dependencies.

import type { Catalog } from "./catalog.ts";

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Render the devtools page for a catalogue. `canRun` toggles the Run button. */
export function renderPage(catalog: Catalog, canRun = true): string {
  const title = esc(catalog.name) + " devtools";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: #0e1116; color: #d7dce3; }
  header { padding: 14px 18px; border-bottom: 1px solid #232a35; display: flex; gap: 10px; align-items: baseline; }
  header h1 { font-size: 16px; margin: 0; color: #fff; }
  header .v { color: #6b7585; }
  header .d { color: #8b94a3; margin-left: auto; }
  main { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 52px); }
  nav { border-right: 1px solid #232a35; padding: 10px; overflow:auto; }
  nav button { display:block; width:100%; text-align:left; padding:8px 10px; margin:2px 0; background:none; border:0; color:#c2c9d4; border-radius:6px; cursor:pointer; font:inherit; }
  nav button:hover { background:#1a212b; }
  nav button.active { background:#1f6feb33; color:#fff; }
  nav .cat { color:#6b7585; font-size:11px; text-transform:uppercase; letter-spacing:.08em; margin:14px 4px 4px; }
  section { padding: 18px 22px; overflow:auto; }
  h2 { margin: 0 0 2px; color:#fff; }
  .desc { color:#8b94a3; margin: 0 0 16px; }
  .field { margin: 10px 0; }
  .field label { display:block; color:#aeb6c2; margin-bottom:4px; }
  .field label .req { color:#f0883e; }
  .field input[type=text] { width: 100%; max-width: 520px; padding:7px 9px; background:#0b0e13; border:1px solid #2b333f; border-radius:6px; color:#fff; font:inherit; }
  .field.flag label { display:flex; gap:8px; align-items:center; cursor:pointer; }
  .hint { color:#6b7585; }
  .preview { margin-top:18px; }
  .preview code { display:block; padding:12px 14px; background:#0b0e13; border:1px solid #2b333f; border-radius:8px; color:#79c0ff; white-space:pre-wrap; word-break:break-all; }
  .row { display:flex; gap:8px; margin-top:10px; }
  .row button { padding:8px 14px; border-radius:6px; border:1px solid #2b333f; background:#1a212b; color:#fff; cursor:pointer; font:inherit; }
  .row button.primary { background:#238636; border-color:#2ea043; }
  .row button:hover { filter:brightness(1.15); }
  pre.out { margin-top:12px; padding:12px 14px; background:#0b0e13; border:1px solid #2b333f; border-radius:8px; white-space:pre-wrap; max-height:320px; overflow:auto; color:#c2c9d4; }
  .empty { color:#6b7585; padding:40px; text-align:center; }
</style>
</head>
<body>
<header>
  <h1>${esc(catalog.name)}</h1>
  ${catalog.version ? `<span class="v">v${esc(catalog.version)}</span>` : ""}
  <span class="d">${catalog.description ? esc(catalog.description) : ""}</span>
</header>
<main>
  <nav id="nav"></nav>
  <section id="panel"><div class="empty">Select a command to build it.</div></section>
</main>
<script>
const CATALOG = ${JSON.stringify(catalog)};
const CAN_RUN = ${canRun ? "true" : "false"};
const nav = document.getElementById("nav");
const panel = document.getElementById("panel");

const navBtn = (cmd) => {
  const b = document.createElement("button");
  b.textContent = cmd.name;
  b.title = cmd.description || "";
  b.onclick = () => { [...nav.querySelectorAll("button")].forEach(x => x.classList.remove("active")); b.classList.add("active"); show(cmd); };
  return b;
};
const label = document.createElement("div"); label.className = "cat"; label.textContent = "Commands";
nav.appendChild(label);
CATALOG.commands.forEach(c => nav.appendChild(navBtn(c)));

function fieldArg(a) {
  const f = document.createElement("div"); f.className = "field";
  f.innerHTML = '<label>' + a.name + (a.required ? ' <span class="req">*</span>' : '') + (a.variadic ? ' <span class="hint">(variadic, space-separated)</span>' : '') + '</label>';
  const i = document.createElement("input"); i.type = "text"; i.dataset.arg = a.name; f.appendChild(i);
  return f;
}
function fieldOpt(o) {
  const f = document.createElement("div"); f.className = "field" + (o.takesValue ? "" : " flag");
  if (o.takesValue) {
    f.innerHTML = '<label>' + o.flags + (o.required ? ' <span class="req">*</span>' : '') + (o.description ? ' <span class="hint">— ' + o.description + '</span>' : '') + '</label>';
    const i = document.createElement("input"); i.type = "text"; i.dataset.opt = o.key; if (o.default != null) i.placeholder = String(o.default); f.appendChild(i);
  } else {
    const l = document.createElement("label");
    const i = document.createElement("input"); i.type = "checkbox"; i.dataset.opt = o.key;
    l.appendChild(i); l.appendChild(document.createTextNode(" " + o.flags + (o.description ? "  — " + o.description : "")));
    f.appendChild(l);
  }
  return f;
}

function show(cmd) {
  panel.innerHTML = "";
  const h = document.createElement("h2"); h.textContent = CATALOG.name + " " + cmd.name; panel.appendChild(h);
  if (cmd.description) { const d = document.createElement("p"); d.className = "desc"; d.textContent = cmd.description; panel.appendChild(d); }
  if (cmd.middleware.length) { const m = document.createElement("p"); m.className = "hint"; m.textContent = "middleware: " + cmd.middleware.join(", "); panel.appendChild(m); }
  cmd.args.forEach(a => panel.appendChild(fieldArg(a)));
  cmd.options.forEach(o => panel.appendChild(fieldOpt(o)));

  const prev = document.createElement("div"); prev.className = "preview";
  const code = document.createElement("code"); prev.appendChild(code); panel.appendChild(prev);
  const out = document.createElement("pre"); out.className = "out"; out.style.display = "none";

  const update = () => { code.textContent = assemble(cmd); };
  panel.querySelectorAll("input").forEach(i => { i.oninput = update; i.onchange = update; });
  update();

  const row = document.createElement("div"); row.className = "row";
  const copy = document.createElement("button"); copy.textContent = "Copy"; copy.onclick = async () => {
    try { await navigator.clipboard.writeText(code.textContent); copy.textContent = "Copied!"; setTimeout(() => copy.textContent = "Copy", 1200); } catch {}
  };
  row.appendChild(copy);
  if (CAN_RUN) {
    const run = document.createElement("button"); run.className = "primary"; run.textContent = "Run";
    run.onclick = async () => {
      out.style.display = "block"; out.textContent = "running…";
      try {
        const res = await fetch("/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ argv: argv(cmd) }) });
        const data = await res.json();
        out.textContent = "$ " + code.textContent + "\\n\\n" + (data.output || "") + "\\n[exit " + data.code + "]";
      } catch (e) { out.textContent = "request failed: " + e; }
    };
    row.appendChild(run);
  }
  panel.appendChild(row);
  panel.appendChild(out);
}

function argv(cmd) {
  const a = [cmd.name];
  cmd.args.forEach(arg => { const v = (panel.querySelector('[data-arg="' + arg.name + '"]') || {}).value; if (v) a.push(...String(v).split(/\\s+/)); });
  cmd.options.forEach(o => {
    const el = panel.querySelector('[data-opt="' + o.key + '"]');
    if (!el) return;
    if (o.takesValue) { if (el.value) { a.push(o.long ? "--" + o.long : "-" + o.short); a.push(el.value); } }
    else if (el.checked) a.push(o.long ? "--" + o.long : "-" + o.short);
  });
  return a;
}
function assemble(cmd) {
  return [CATALOG.name, ...argv(cmd).map(t => /\\s/.test(t) ? JSON.stringify(t) : t)].join(" ");
}
</script>
</body>
</html>`;
}
