var _a;
import { classChain } from "@youneed/core";
import { TASK_BRAND } from "./task.js";
function html(strings, ...values) {
    return { strings, values };
}
const templateCache = new WeakMap();
const isSpace = (ch) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f";
// Attribute-name chars (plus the `@`/`.` binding prefixes, only ever leading).
const isNameChar = (ch) => (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_" ||
    ch === "-" ||
    ch === ":" ||
    ch === "." ||
    ch === "@";
/**
 * For a static chunk that sits right before an in-tag hole, return the attribute
 * name it's the value of — i.e. when the chunk ends with `name=` (`.prop=`,
 * `@event=`, plain `attr=`), the name WITH its original case and WITHOUT the
 * `@`/`.` prefix. Returns `undefined` when the chunk doesn't end with `name=`
 * (a bare element directive like `<input ${ref}>`). Pure string scan — no regex
 * over user template text.
 */
function attrNameBeforeHole(s) {
    let end = s.length;
    while (end > 0 && isSpace(s[end - 1]))
        end--; // trailing whitespace
    if (end === 0 || s[end - 1] !== "=")
        return undefined; // not `…name=`
    end--; // step over `=`
    while (end > 0 && isSpace(s[end - 1]))
        end--; // whitespace before `=` (`name =`)
    let start = end;
    while (start > 0 && isNameChar(s[start - 1]))
        start--;
    let name = s.slice(start, end);
    if (name[0] === "@" || name[0] === ".")
        name = name.slice(1); // drop binding prefix
    return name.length ? name : undefined;
}
function compileTemplate(strings) {
    const cached = templateCache.get(strings);
    if (cached)
        return cached;
    // Build markup, marking each hole by its position, tracked char-by-char so we
    // know whether a hole sits in text, in an unquoted attribute value, or INSIDE
    // a quoted attribute value:
    //   • text                     -> <!--dh:i-->
    //   • unquoted value (attr=•)  -> "dh:i"   (add quotes; safe for `/>` etc.)
    //   • quoted value (attr="…•…")-> dh:i     (bare; the quotes are already there,
    //                                            so `href="/u/${id}"` works)
    // HTML parsing lowercases attribute names, so `@onAdd`/`.someProp` would arrive
    // as `@onadd`/`.someprop`. We capture each `attr=${…}` hole's name WITH its
    // original case here, at the moment the hole is registered (the static string
    // `s` still has it), keyed by hole index — far more robust than scraping the
    // built markup. Only event/property metas consult it below (plain attributes
    // are case-insensitive, so their lowercase form is correct).
    const nameByHole = new Map();
    let markup = "";
    let inTag = false;
    let quote = ""; // the open quote char while inside a quoted attribute value
    for (let i = 0; i < strings.length; i++) {
        const s = strings[i];
        for (let c = 0; c < s.length; c++) {
            const ch = s[c];
            if (quote) {
                if (ch === quote)
                    quote = "";
            }
            else if (inTag) {
                if (ch === '"' || ch === "'")
                    quote = ch;
                else if (ch === ">")
                    inTag = false;
            }
            else if (ch === "<") {
                inTag = true;
            }
        }
        markup += s;
        if (i < strings.length - 1) {
            if (!inTag) {
                markup += `<!--dh:${i}-->`;
            }
            else if (quote) {
                markup += `dh:${i}`;
            }
            else {
                // In a tag, unquoted: either `attr=${x}` (incl. `.prop=`/`@event=`) or a
                // bare element directive (`<input ${ref(...)}>`).
                const name = attrNameBeforeHole(s);
                if (name === undefined) {
                    markup += ` dh-el-${i}=""`; // element-level directive
                }
                else {
                    nameByHole.set(i, name); // record original-case attribute name
                    markup += `"dh:${i}"`; // attribute value hole
                }
            }
        }
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = markup;
    const metas = [];
    collectParts(tpl.content, [], metas);
    // Restore original case for camelCase event/property names.
    for (const meta of metas) {
        if ((meta.kind === "event" || meta.kind === "property") && nameByHole.has(meta.holeIndex)) {
            meta.name = nameByHole.get(meta.holeIndex);
        }
    }
    const compiled = { content: tpl.content, metas };
    templateCache.set(strings, compiled);
    return compiled;
}
function collectParts(node, path, metas) {
    if (node.nodeType === 8 /* comment */) {
        const data = node.data;
        if (data.startsWith("dh:")) {
            metas.push({ kind: "node", path, holeIndex: Number(data.slice(3)) });
        }
    }
    else if (node.nodeType === 1 /* element */) {
        const el = node;
        for (const attr of Array.from(el.attributes)) {
            // Element-level directive placeholder (`dh-el-N`) — a bare `${…}` in a tag.
            const elHole = /^dh-el-(\d+)$/.exec(attr.name);
            if (elHole) {
                metas.push({ kind: "element", path, holeIndex: Number(elHole[1]) });
                el.removeAttribute(attr.name);
                continue;
            }
            if (!attr.value.includes("dh:"))
                continue;
            const value = attr.value;
            let name = attr.name;
            // @event=${fn} and .prop=${value} are always a single whole-value hole.
            if (name.startsWith("@")) {
                metas.push({ kind: "event", path, holeIndex: firstHole(value), name: name.slice(1) });
            }
            else if (name.startsWith(".")) {
                metas.push({ kind: "property", path, holeIndex: firstHole(value), name: name.slice(1) });
            }
            else {
                // Plain attribute — may be a whole value (attr=${x}) or interpolated
                // (attr="/u/${id}?t=${t}"); split into static segments + hole indices.
                const { strings, holeIndices } = splitAttrHoles(value);
                if (holeIndices.length === 1 && strings[0] === "" && strings[1] === "") {
                    metas.push({ kind: "attr", path, holeIndex: holeIndices[0], name });
                }
                else {
                    metas.push({ kind: "attr-multi", path, holeIndex: holeIndices[0], name, strings, holeIndices });
                }
            }
            el.removeAttribute(attr.name); // strip placeholder; the part re-sets it
        }
    }
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
        collectParts(kids[i], [...path, i], metas);
    }
}
const HOLE_RE = /dh:(\d+)/g;
/** The first `dh:N` index in a placeholder value (for whole-value holes). */
function firstHole(value) {
    return Number(/dh:(\d+)/.exec(value)[1]);
}
/** Split an attribute placeholder into static segments + the hole indices
 *  between them, so `"/u/dh:0?t=dh:1"` → strings ["/u/","?t=",""], holes [0,1]. */
function splitAttrHoles(value) {
    const strings = [];
    const holeIndices = [];
    let last = 0;
    HOLE_RE.lastIndex = 0;
    let m;
    while ((m = HOLE_RE.exec(value))) {
        strings.push(value.slice(last, m.index));
        holeIndices.push(Number(m[1]));
        last = m.index + m[0].length;
    }
    strings.push(value.slice(last));
    return { strings, holeIndices };
}
function resolvePath(root, path) {
    let node = root;
    for (const i of path)
        node = node.childNodes[i];
    return node;
}
// The component currently rendering — set around its #render() so directives
// (portal, ref) can register teardown tied to the host's lifecycle (onCleanup).
let currentHost;
function isTemplateResult(v) {
    return (v != null &&
        typeof v === "object" &&
        "strings" in v &&
        Array.isArray(v.values));
}
/** Instantiate a template result into a fresh fragment + its live parts. */
function instantiate(result) {
    const { content, metas } = compileTemplate(result.strings);
    const frag = content.cloneNode(true);
    const parts = bindParts(frag, metas);
    for (const part of parts)
        part.commit(result.values[part.holeIndex]);
    return { nodes: [...frag.childNodes], parts };
}
/** Append slot content into a host's LIGHT DOM (so a shadow `<slot>` projects it). */
function appendSlot(host, content) {
    if (typeof content === "string") {
        host.insertAdjacentHTML("beforeend", content);
    }
    else {
        for (const node of instantiate(content).nodes)
            host.appendChild(node);
    }
}
function isRepeatResult(v) {
    return (v != null && typeof v === "object" && v.__repeat === true);
}
/**
 * Keyed list rendering (Lit's `repeat`). `keyFn` gives each item a stable
 * identity so re-renders reuse existing DOM instead of recreating it.
 *
 *   html`<ul>${repeat(users, (u) => u.id, (u) => html`<li>${u.name}</li>`)}</ul>`
 */
function repeat(items, keyFn, template) {
    const keys = [];
    const templates = [];
    let i = 0;
    for (const item of items) {
        keys.push(keyFn(item, i));
        templates.push(template(item, i));
        i++;
    }
    return { __repeat: true, keys, templates };
}
// ============================================================
// Directives — values you interpolate into a hole
// ============================================================
/** Build a class string from a map: keys with a truthy value are included.
 *    class=${classMap({ btn: true, active: isActive })}  ->  "btn active" */
function classMap(map) {
    let out = "";
    for (const k in map)
        if (map[k])
            out += (out ? " " : "") + k;
    return out;
}
/** Build a style string from a map (camelCase → kebab-case; null/undefined/false
 *  are skipped; `--vars` pass through):
 *    style=${styleMap({ color, minWidth: w && `${w}px` })} */
function styleMap(map) {
    let out = "";
    for (const k in map) {
        const v = map[k];
        if (v == null || v === false || v === "")
            continue;
        const prop = k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
        out += `${prop}:${v};`;
    }
    return out;
}
/** Conditional render. Lazy — only the taken branch runs:
 *    ${when(loading, () => html`<spinner/>`, () => html`<content/>`)} */
function when(condition, then, otherwise) {
    return condition ? then() : otherwise ? otherwise() : "";
}
/** Map an iterable to template results (non-keyed; use `repeat` for keyed lists):
 *    ${map(items, (it, i) => html`<li>${i}: ${it.name}</li>`)} */
function map(items, fn) {
    const out = [];
    if (items) {
        let i = 0;
        for (const item of items)
            out.push(fn(item, i++));
    }
    return out;
}
// `If`/`Switch` are capitalised because `if`/`switch` are reserved words — you
// can't name a function (or call one) with a bare keyword. They read like the
// statements they replace and keep branching out of ternary chains.
/** Single-condition render — the if/else statement of a template. Lazy: only the
 *  taken branch runs. Use it instead of a `?:` ternary for readability:
 *    ${If(this.loading, () => html`<spinner/>`, () => html`<main/>`)} */
function If(condition, then, otherwise) {
    return condition ? then() : otherwise ? otherwise() : "";
}
/** Multi-way render — the switch statement of a template. Matches `value` against
 *  the `cases` keys, falling back to `default` (or `""` if absent). Lazy: only the
 *  matched branch runs, so you avoid a chain of nested ternaries:
 *    ${Switch(this.status, {
 *       loading: () => html`<spinner/>`,
 *       error:   () => html`<error-banner .msg=${this.err}></error-banner>`,
 *       default: () => html`<main>${this.data}</main>`,
 *    })} */
function Switch(value, cases) {
    const branch = cases[value] ?? cases.default;
    return branch ? branch() : "";
}
function For(start, end, stepOrProduce, produce) {
    const step = typeof stepOrProduce === "number" ? stepOrProduce : 1;
    const fn = (typeof stepOrProduce === "number" ? produce : stepOrProduce);
    const out = [];
    if (step === 0)
        return out; // no progress → would never terminate; render nothing
    for (let i = start; step > 0 ? i < end : i > end; i += step)
        out.push(fn(i));
    return out;
}
/** Render while a predicate holds — the while-loop of a template. Calls `produce`
 *  for index 0, 1, 2, … as long as `condition(index)` is truthy, collecting the
 *  results. Guarded against a runaway loop (throws past 1e6 iterations) so a bad
 *  predicate surfaces as an error instead of hanging the render:
 *    ${While((i) => i < this.pageCount, (i) => html`<a>${i + 1}</a>`)} */
function While(condition, produce) {
    const out = [];
    for (let i = 0; condition(i); i++) {
        if (i >= 1_000_000)
            throw new RangeError("While: exceeded 1e6 iterations — is the condition ever false?");
        out.push(produce(i));
    }
    return out;
}
/** `flow` groups the control-flow helpers under their natural keyword names —
 *  `flow.if`, `flow.switch`, `flow.while`, `flow.for` work because reserved words
 *  are legal as *property* names (a bare `if(...)` call is not). `flow.when` and
 *  `flow.map` are the same functions as the top-level exports, grouped here for
 *  discoverability and a single import:
 *    import { flow } from "@youneed/dom";
 *    ${flow.if(this.open, () => html`<panel/>`)}
 *    ${flow.for(0, this.cols, (i) => html`<col data-i=${i}/>`)} */
const flow = {
    when,
    map,
    if: If,
    switch: Switch,
    while: While,
    for: For,
    await: Await,
};
/** Create an empty ref handle: `#input = createRef<HTMLInputElement>()`. */
function createRef() {
    return { value: null };
}
/** Element directive — capture the element into a ref handle or callback:
 *    <input ${ref(this.#input)}>          // this.#input.value === the <input>
 *    <canvas ${ref((el) => …)}>           // callback (el | null on teardown) */
function ref(target) {
    return { __ref: target };
}
function isRefDirective(v) {
    return v != null && typeof v === "object" && "__ref" in v;
}
function applyRef(target, el) {
    if (typeof target === "function")
        target(el);
    else
        target.value = el;
}
/** Render `content` into `target` (e.g. `document.body`) instead of inline — for
 *  dialogs/popovers that must escape overflow/transform/stacking of ancestors.
 *  The content is removed when the directive is cleared or the host unmounts.
 *    ${portal(document.body, when(this.open, () => html`<div class="modal">…</div>`))} */
function portal(target, content) {
    return { __portal: true, target, content };
}
function isPortalResult(v) {
    return v != null && typeof v === "object" && v.__portal === true;
}
/** Render a promise's settled state inline — the `await` of a template (capitalised
 *  because `await` is a reserved word). Shows `pending()` until the promise settles,
 *  then `then(value)` or `catch(error)`. When it settles it patches its OWN slot in
 *  place — it does NOT trigger a host re-render — so an inline `fetch(...)` isn't
 *  recreated in a loop. Re-subscribes only when the awaited value's identity
 *  changes (pass a stored promise / a task's run() for a stable identity):
 * @example
 *    ${Await(fetch(url, { signal: this.abortSignal }).then((r) => r.json()), {
 *       pending: () => html`<spinner/>`,
 *       then: (data) => html`<view .data=${data}></view>`,
 *       catch: (e) => html`<error-banner .msg=${String(e)}></error-banner>`,
 *    })} */
function Await(input, handlers) {
    return { __await: true, input, handlers: handlers };
}
/** True for a `Task` or a `task.run()` promise — the runtime backstop to the
 *  `RejectTask` type guard (e.g. when called from untyped JS). */
function isTaskLike(v) {
    return (v != null &&
        (typeof v === "object" || typeof v === "function") &&
        v[TASK_BRAND] === true);
}
function isAwaitResult(v) {
    return v != null && typeof v === "object" && v.__await === true;
}
// A child-node hole. The original comment stays as an ANCHOR; content is
// inserted before it. A hole accepts text, a nested `html` TemplateResult (with
// part reuse when the same template re-renders), or an array of either (lists).
class NodePart {
    holeIndex;
    #anchor; // comment marker — keeps the slot's position
    #strings; // identity of the currently-rendered template
    #parts; // live parts when a template is rendered
    #nodes = []; // the nodes currently inserted before the anchor
    #text; // reused text node when rendering plain text
    #keyed; // key -> item, when rendering a repeat()
    #keyOrder = []; // current key order, to detect structural changes
    #portalTarget; // when rendering a portal: where content lives
    #portalPart; // the sub-part that renders portaled content
    #portalAnchor; // the anchor appended to the portal target
    #awaitInput; // when rendering an Await: the value currently awaited
    #awaitToken; // identity of the live subscription (stale settles ignored)
    #awaitStatus; // current settled state
    #awaitValue; // resolved value (status "then")
    #awaitError; // rejection (status "catch")
    #awaitHandlers; // latest branches, refreshed every render
    #awaitWarnedTask = false; // dev warning for an awaited Task already emitted once
    constructor(node, holeIndex) {
        this.holeIndex = holeIndex;
        this.#anchor = node;
    }
    commit(value) {
        if (isAwaitResult(value))
            return this.#renderAwait(value);
        if (this.#awaitToken)
            this.#resetAwait(); // switched away from an Await
        if (isPortalResult(value))
            return this.#renderPortal(value);
        if (this.#portalTarget)
            this.#teardownPortal(); // switched away from a portal
        this.#commitValue(value);
    }
    /** Render any ordinary hole value (everything except the stateful Await/portal
     *  directives). Shared by `commit` and the Await settle handlers, so a resolved
     *  value lands in the slot without re-entering the directive dispatch above. */
    #commitValue(value) {
        if (value == null || typeof value === "boolean")
            return this.#renderText("");
        if (isRepeatResult(value))
            return this.#renderRepeat(value);
        if (isTemplateResult(value))
            return this.#renderTemplate(value);
        if (value instanceof Node)
            return this.#renderNode(value); // `${Child.of({…})}`
        if (Array.isArray(value))
            return this.#renderList(value);
        this.#renderText(String(value));
    }
    // Await: subscribe to the thenable and render its state. The settle handlers
    // patch THIS slot directly (no host.requestUpdate), so a promise built inline in
    // render() isn't recreated on every update. Re-subscribes only when the awaited
    // value's identity changes; a same-identity re-render re-runs the current branch
    // with the latest handlers so reactive holes inside it still patch.
    #renderAwait(p) {
        if (this.#portalTarget)
            this.#teardownPortal();
        // A Task (or task.run()) re-renders on its own; awaiting it here loops. The
        // type guard catches this at the call site — warn once for untyped callers.
        if (!this.#awaitWarnedTask && isTaskLike(p.input)) {
            this.#awaitWarnedTask = true;
            console.error("flow.await: received a Task (or task.run()). A task triggers its own re-renders, " +
                "so awaiting it in render() causes an infinite update loop. Read the task's reactive " +
                "`pending`/`value`/`error` directly (e.g. with flow.if), or await a plain stored promise.");
        }
        this.#awaitHandlers = p.handlers;
        if (this.#awaitInput === p.input && this.#awaitToken)
            return this.#commitAwaitState();
        const token = {};
        this.#awaitInput = p.input;
        this.#awaitToken = token;
        this.#awaitStatus = "pending";
        this.#awaitValue = undefined;
        this.#awaitError = undefined;
        currentHost?.onCleanup(() => this.#resetAwait()); // ignore late settles after unmount
        Promise.resolve(p.input).then((value) => {
            if (this.#awaitToken !== token)
                return; // superseded or torn down
            this.#awaitStatus = "then";
            this.#awaitValue = value;
            this.#commitAwaitState();
        }, (error) => {
            if (this.#awaitToken !== token)
                return;
            this.#awaitStatus = "catch";
            this.#awaitError = error;
            this.#commitAwaitState();
        });
        this.#commitAwaitState(); // show pending() now
    }
    /** Render the branch for the current await status using the latest handlers. */
    #commitAwaitState() {
        const h = this.#awaitHandlers;
        const content = this.#awaitStatus === "then"
            ? h?.then?.(this.#awaitValue)
            : this.#awaitStatus === "catch"
                ? h?.catch?.(this.#awaitError)
                : h?.pending?.();
        this.#commitValue(content);
    }
    #resetAwait() {
        this.#awaitInput = undefined;
        this.#awaitToken = undefined; // invalidates any in-flight subscription
        this.#awaitStatus = undefined;
        this.#awaitValue = undefined;
        this.#awaitError = undefined;
        this.#awaitHandlers = undefined;
        this.#awaitWarnedTask = false;
    }
    // Portal: content lives under `target` (e.g. document.body), not inline. The
    // inline anchor stays empty. Cleaned up when cleared or the host unmounts.
    #renderPortal(p) {
        if (this.#portalTarget !== p.target) {
            this.#teardownPortal();
            this.#clear(); // drop any inline content
            const anchor = document.createComment("dh-portal");
            p.target.appendChild(anchor);
            this.#portalAnchor = anchor;
            this.#portalPart = new _a(anchor, 0);
            this.#portalTarget = p.target;
            currentHost?.onCleanup(() => this.#teardownPortal()); // remove on host unmount
        }
        this.#portalPart.commit(p.content);
    }
    #teardownPortal() {
        this.#portalPart?.commit(null); // clears the portaled content
        this.#portalPart = undefined;
        this.#portalAnchor?.remove();
        this.#portalAnchor = undefined;
        this.#portalTarget = undefined;
    }
    // A component instance (or any node) placed directly in a hole. Reused if it's
    // the same node; replaced otherwise.
    #renderNode(node) {
        if (this.#nodes.length === 1 && this.#nodes[0] === node)
            return;
        this.#clear();
        this.#nodes = [node];
        this.#insert(node);
    }
    #insert(node, before = this.#anchor) {
        this.#anchor.parentNode.insertBefore(node, before);
    }
    #clear() {
        this.#teardownPortal();
        for (const n of this.#nodes)
            n.remove();
        this.#nodes = [];
        this.#parts = undefined;
        this.#strings = undefined;
        this.#text = undefined;
        this.#keyed = undefined;
        this.#keyOrder = [];
    }
    #renderText(text) {
        if (this.#text && this.#nodes.length === 1) {
            this.#text.data = text; // reuse the existing text node
            return;
        }
        this.#clear();
        this.#text = document.createTextNode(text);
        this.#nodes = [this.#text];
        this.#insert(this.#text);
    }
    #renderTemplate(result) {
        // Same template identity -> just patch the holes, keep the DOM + listeners.
        if (this.#strings === result.strings && this.#parts) {
            for (const part of this.#parts)
                part.commit(result.values[part.holeIndex]);
            return;
        }
        this.#clear();
        const { nodes, parts } = instantiate(result);
        this.#strings = result.strings;
        this.#parts = parts;
        this.#nodes = nodes;
        for (const n of nodes)
            this.#insert(n);
    }
    // Lists: re-render the whole array each commit (no keyed diff — items with
    // their own state are recreated). Fine for text / stateless item templates.
    #renderList(items) {
        this.#clear();
        for (const item of items) {
            if (isTemplateResult(item)) {
                const { nodes } = instantiate(item);
                for (const n of nodes) {
                    this.#nodes.push(n);
                    this.#insert(n);
                }
            }
            else if (item instanceof Node) {
                this.#nodes.push(item); // `${items.map((x) => Child.of({…}))}`
                this.#insert(item);
            }
            else if (item != null && typeof item !== "boolean") {
                const t = document.createTextNode(String(item));
                this.#nodes.push(t);
                this.#insert(t);
            }
        }
    }
    // Keyed reconcile: reuse items by key (patch holes only), recreate on template
    // change, drop vanished keys. Reorders the DOM ONLY when the structure changed
    // (add/remove/move) — a pure value update touches no nodes, so focus/state in
    // unchanged items survives.
    #renderRepeat(result) {
        // Switching from text/template/list -> start a clean keyed range.
        if (!this.#keyed) {
            this.#clear();
            this.#keyed = new Map();
        }
        const old = this.#keyed;
        const next = new Map();
        const ordered = [];
        let structural = result.keys.length !== this.#keyOrder.length;
        result.keys.forEach((key, i) => {
            const tmpl = result.templates[i];
            let item = old.get(key);
            if (item && item.strings === tmpl.strings) {
                for (const part of item.parts)
                    part.commit(tmpl.values[part.holeIndex]); // reuse
            }
            else {
                if (item)
                    for (const n of item.nodes)
                        n.remove(); // template changed for this key
                const inst = instantiate(tmpl);
                item = { nodes: inst.nodes, parts: inst.parts, strings: tmpl.strings };
                structural = true;
            }
            if (this.#keyOrder[i] !== key)
                structural = true;
            next.set(key, item);
            ordered.push(item);
        });
        for (const [key, item] of old) {
            if (!next.has(key)) {
                for (const n of item.nodes)
                    n.remove();
                structural = true;
            }
        }
        // Only rewrite DOM order when something actually changed structurally.
        if (structural) {
            for (const item of ordered)
                for (const n of item.nodes)
                    this.#insert(n);
        }
        this.#keyed = next;
        this.#keyOrder = result.keys;
        this.#nodes = ordered.flatMap((it) => it.nodes);
    }
}
_a = NodePart;
class AttrPart {
    el;
    name;
    holeIndex;
    constructor(el, name, holeIndex) {
        this.el = el;
        this.name = name;
        this.holeIndex = holeIndex;
    }
    commit(value) {
        if (value == null || value === false)
            this.el.removeAttribute(this.name);
        else
            this.el.setAttribute(this.name, value === true ? "" : String(value));
    }
}
// One attribute interpolated from several holes (e.g. `href="/u/${id}?t=${t}"`).
// Each hole gets its own AttrSlotPart sharing this assembler; on every commit the
// full value is re-joined and written, so the existing per-part commit loops need
// no changes. The result is always a string (concatenation), so null/false read
// as empty rather than removing the attribute.
class AttrAssembler {
    el;
    name;
    strings;
    #values;
    constructor(el, name, strings) {
        this.el = el;
        this.name = name;
        this.strings = strings;
        this.#values = new Array(strings.length - 1);
    }
    set(slot, value) {
        this.#values[slot] = value;
        let out = this.strings[0];
        for (let i = 0; i < this.#values.length; i++) {
            const v = this.#values[i];
            out += (v == null ? "" : String(v)) + this.strings[i + 1];
        }
        this.el.setAttribute(this.name, out);
    }
}
class AttrSlotPart {
    asm;
    slot;
    holeIndex;
    constructor(asm, slot, holeIndex) {
        this.asm = asm;
        this.slot = slot;
        this.holeIndex = holeIndex;
    }
    commit(value) {
        this.asm.set(this.slot, value);
    }
}
class EventPart {
    el;
    name;
    holeIndex;
    #current;
    constructor(el, name, holeIndex) {
        this.el = el;
        this.name = name;
        this.holeIndex = holeIndex;
    }
    commit(value) {
        const listener = value;
        if (listener === this.#current)
            return;
        if (this.#current)
            this.el.removeEventListener(this.name, this.#current);
        this.#current = listener;
        if (listener)
            this.el.addEventListener(this.name, listener);
    }
}
// Sets a JS *property* on the element (parent -> child input, Angular @Input /
// Vue prop). Unlike AttrPart it passes the value as-is (objects, numbers, fns),
// and on a reactive child its @prop setter triggers a re-render.
// Property values set on an element BEFORE it upgrades (cloned custom elements
// upgrade only on insert). Their `@prop x = default` field initializers run at
// upgrade and would clobber the value set here, so `#upgradeProp` reads this map
// and lets the bound value win over the field default. Cleared once consumed.
const externalProps = new WeakMap();
class PropertyPart {
    el;
    name;
    holeIndex;
    constructor(el, name, holeIndex) {
        this.el = el;
        this.name = name;
        this.holeIndex = holeIndex;
    }
    commit(value) {
        // Not yet upgraded (still in the cloned fragment): record the value so the
        // upgrade's field initializer can't clobber it. Once connected the prop is
        // reactive, so a direct set is enough.
        if (!this.el.isConnected) {
            let map = externalProps.get(this.el);
            if (!map)
                externalProps.set(this.el, (map = new Map()));
            map.set(this.name, value);
        }
        this.el[this.name] = value;
    }
}
// A bare `${…}` directive sitting on an element (no attribute) — currently `ref`.
class ElementPart {
    el;
    holeIndex;
    #current;
    #registered = false;
    constructor(el, holeIndex) {
        this.el = el;
        this.holeIndex = holeIndex;
    }
    commit(value) {
        const target = isRefDirective(value) ? value.__ref : undefined;
        if (target === this.#current)
            return;
        if (this.#current)
            applyRef(this.#current, null); // release the old ref
        this.#current = target;
        if (!target)
            return;
        applyRef(target, this.el);
        if (!this.#registered) {
            this.#registered = true;
            currentHost?.onCleanup(() => this.#current && applyRef(this.#current, null));
        }
    }
}
function bindParts(frag, metas) {
    // Resolve every node ref BEFORE committing, so NodePart swaps don't shift paths.
    // flatMap: an "attr-multi" meta expands into one part per hole (shared assembler).
    return metas.flatMap((m) => {
        const node = resolvePath(frag, m.path);
        if (m.kind === "node")
            return new NodePart(node, m.holeIndex);
        if (m.kind === "element")
            return new ElementPart(node, m.holeIndex);
        if (m.kind === "event")
            return new EventPart(node, m.name, m.holeIndex);
        if (m.kind === "property")
            return new PropertyPart(node, m.name, m.holeIndex);
        if (m.kind === "attr-multi") {
            const asm = new AttrAssembler(node, m.name, m.strings);
            return m.holeIndices.map((hi, slot) => new AttrSlotPart(asm, slot, hi));
        }
        return new AttrPart(node, m.name, m.holeIndex);
    });
}
// ============================================================
// Styles — scoped to the shadow root via Constructable Stylesheets
// ------------------------------------------------------------
// `css`` builds a CSSStyleSheet; a component (or any base class in its chain)
// declares `static styles`. They're collected base-first (so the subclass wins
// the cascade) and applied via `adoptedStyleSheets` — they survive re-renders
// because they aren't children of the shadow root.
// ============================================================
function css(strings, ...values) {
    let text = strings[0];
    for (let i = 0; i < values.length; i++)
        text += String(values[i]) + strings[i + 1];
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    return sheet;
}
const isLazyStyle = (s) => typeof s === "function";
/** Coerce a `StyleInput` (or list) to CSSStyleSheets. Raw strings — typically
 *  the contents of a `.css` file imported as text — become a stylesheet. */
function toStyleSheets(input) {
    const list = Array.isArray(input) ? input : [input];
    return list.map((s) => {
        if (s instanceof CSSStyleSheet)
            return s;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(s);
        return sheet;
    });
}
/** Convert option styles to their stored form: strings → sheets, sheets and
 *  lazy thunks kept as-is. The thunks are resolved per-instance on connect. */
function normalizeStyles(input) {
    const list = Array.isArray(input) ? input : [input];
    return list.map((s) => (isLazyStyle(s) || s instanceof CSSStyleSheet ? s : toStyleSheets(s)[0]));
}
function eachOwnStyle(ctor, visit) {
    for (const c of classChain(ctor, HTMLElement)) {
        const own = Object.getOwnPropertyDescriptor(c, "styles")?.value;
        if (own)
            for (const s of Array.isArray(own) ? own : [own])
                visit(s);
    }
}
// Resolved once per class: `static styles` is set at class-definition time and
// the sheets are shared across instances, so the chain walk runs only on the
// first `new` of each component, not on every mount.
const stylesCache = new WeakMap();
function getStyles(ctor) {
    const cached = stylesCache.get(ctor);
    if (cached)
        return cached;
    // Base-first so a subclass's sheets win the cascade. Lazy thunks are skipped
    // here (they're collected by getLazyStyles and adopted asynchronously).
    const perClass = [];
    for (const c of classChain(ctor, HTMLElement)) {
        const own = Object.getOwnPropertyDescriptor(c, "styles")?.value;
        const sheets = (own ? (Array.isArray(own) ? own : [own]) : []).filter((s) => s instanceof CSSStyleSheet);
        perClass.push(sheets);
    }
    const out = perClass.reverse().flat();
    // Don't memoize an EMPTY result: `static styles` is a field initializer that
    // runs AFTER the class decorator, so a `new` triggered during `@Component.define`
    // (a synchronous SSR upgrade) can land here before the sheets exist. Caching []
    // then would poison every later instance. Re-walk until styles appear; a class
    // that genuinely has none is a cheap walk.
    if (out.length > 0)
        stylesCache.set(ctor, out);
    return out;
}
/** Lazy style thunks declared anywhere on the class chain's `static styles`. */
function getLazyStyles(ctor) {
    const out = [];
    eachOwnStyle(ctor, (s) => {
        if (isLazyStyle(s))
            out.push(s);
    });
    return out;
}
// One resolution per thunk, shared across instances (a constructable sheet is
// shared by reference, so all components adopt the same parsed stylesheet).
const lazyStyleCache = new WeakMap();
function loadLazySheet(thunk) {
    let p = lazyStyleCache.get(thunk);
    if (!p) {
        p = Promise.resolve(thunk()).then((mod) => {
            const raw = mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
            if (raw instanceof CSSStyleSheet)
                return raw;
            if (typeof raw === "string")
                return toStyleSheets(raw)[0];
            throw new Error("lazy style must resolve to a CSS string / CSSStyleSheet (or a module with such a default export)");
        });
        lazyStyleCache.set(thunk, p);
    }
    return p;
}
/** Set/read the host whose render is in progress, so portal/ref directives can
 *  tie their cleanup to it. Component's #render brackets a render with these. */
export function setCurrentHost(host) {
    currentHost = host;
}
export function getCurrentHost() {
    return currentHost;
}
export { html, css, repeat, classMap, styleMap, when, map, If, Switch, For, While, Await, flow, ref, createRef, portal, 
// internal (consumed by component.ts)
compileTemplate, bindParts, appendSlot, getStyles, getLazyStyles, loadLazySheet, normalizeStyles, toStyleSheets, externalProps, EventPart, };
