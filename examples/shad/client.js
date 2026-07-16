var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base2) => [, , , __create(base2?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// packages/dom-scheduler/src/scheduler.ts
function createScheduler() {
  const pending = /* @__PURE__ */ new Map();
  let microQueued = false;
  let idleQueued = false;
  const flushBucket = (wanted) => {
    let guard = 0;
    for (; ; ) {
      const hosts = [];
      for (const [host, prio] of pending) if (prio === wanted) hosts.push(host);
      if (hosts.length === 0) break;
      for (const host of hosts) pending.delete(host);
      hosts.sort((a, b) => a.depth - b.depth);
      for (const host of hosts) {
        try {
          host.flush();
        } catch (error) {
          console.error("scheduler: host flush failed:", error);
        }
      }
      if (++guard > 1e3) throw new Error("scheduler: flush did not converge");
    }
  };
  const queueMicro = () => {
    if (microQueued) return;
    microQueued = true;
    queueMicrotask(() => {
      microQueued = false;
      flushBucket("render-blocking");
    });
  };
  const queueIdle = () => {
    if (idleQueued) return;
    idleQueued = true;
    const run = () => {
      idleQueued = false;
      flushBucket("background");
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run);
    else setTimeout(run, 0);
  };
  return {
    name: "microtask",
    request(host, priority) {
      const current = pending.get(host);
      const next = current === "render-blocking" || priority === "render-blocking" ? "render-blocking" : "background";
      pending.set(host, next);
      if (next === "render-blocking") queueMicro();
      else queueIdle();
    },
    flushSync() {
      let guard = 0;
      while (pending.size) {
        flushBucket("render-blocking");
        flushBucket("background");
        if (++guard > 1e3)
          throw new Error("scheduler: flushSync did not converge");
      }
    },
    // Drop pending work; an already-queued microtask/idle callback then flushes
    // an empty set (a no-op) and clears its own flag — nothing left scheduled.
    stop() {
      pending.clear();
    },
    [Symbol.dispose]() {
      pending.clear();
    }
  };
}
var defaultScheduler = createScheduler();
function getDefaultScheduler() {
  return defaultScheduler;
}
var syncScheduler = {
  name: "sync",
  request: (host) => host.flush(),
  flushSync: () => {
  }
};
function createFpsScheduler(fps) {
  const pending = /* @__PURE__ */ new Set();
  const frames = /* @__PURE__ */ new Set();
  const minInterval = fps ? 1e3 / fps : 0;
  const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  const hasRaf = typeof requestAnimationFrame === "function";
  const schedule = (cb) => hasRaf ? requestAnimationFrame(cb) : setTimeout(() => cb(now()), minInterval || 16);
  const unschedule = (id) => hasRaf ? cancelAnimationFrame(id) : clearTimeout(id);
  let frameId;
  let looping = false;
  let last = -Infinity;
  const flush = () => {
    let guard = 0;
    while (pending.size) {
      const hosts = [...pending];
      pending.clear();
      hosts.sort((a, b) => a.depth - b.depth);
      for (const host of hosts) host.flush();
      if (++guard > 1e3)
        throw new Error("fpsScheduler: flush did not converge");
    }
  };
  const tick = (t) => {
    frameId = void 0;
    if (pending.size === 0 && frames.size === 0) {
      looping = false;
      return;
    }
    frameId = schedule(tick);
    if (t - last < minInterval) return;
    const dt = last === -Infinity ? 0 : t - last;
    last = t;
    if (frames.size) for (const cb of [...frames]) cb(dt);
    flush();
  };
  const ensureLoop = () => {
    if (looping) return;
    looping = true;
    frameId = schedule(tick);
  };
  const stop = () => {
    if (frameId !== void 0) unschedule(frameId);
    frameId = void 0;
    looping = false;
    last = -Infinity;
    pending.clear();
    frames.clear();
  };
  return {
    name: fps ? `fps(${fps})` : "raf",
    request(host) {
      pending.add(host);
      ensureLoop();
    },
    frame(callback) {
      frames.add(callback);
      ensureLoop();
      return () => {
        frames.delete(callback);
      };
    },
    flushSync: flush,
    stop,
    [Symbol.dispose]: stop
    // `using sched = createFpsScheduler(...)`
  };
}
var rafScheduler = createFpsScheduler();

// packages/core/src/registry.ts
function ctorOf(self) {
  return self.constructor;
}
function* classChain(ctor, stopAt) {
  let c = ctor;
  while (c && c !== Object && c !== stopAt) {
    yield c;
    c = Object.getPrototypeOf(c.prototype)?.constructor ?? null;
  }
}
function createRegistry(create) {
  const map2 = /* @__PURE__ */ new WeakMap();
  return {
    for(ctor) {
      let value = map2.get(ctor);
      if (!map2.has(ctor)) map2.set(ctor, value = create());
      return value;
    },
    read: (ctor) => map2.get(ctor),
    has: (ctor) => map2.has(ctor)
  };
}

// packages/dom/src/task.ts
var TASK_BRAND = /* @__PURE__ */ Symbol("youneed.task");
function task(host, fn, options) {
  const priority = options?.priority;
  let controller;
  const state = {
    pending: false,
    aborted: false,
    error: void 0,
    value: void 0
  };
  const abort = () => controller?.abort();
  host.onCleanup(abort);
  const external = options?.signal;
  if (external) {
    external.addEventListener("abort", abort);
    host.onCleanup(() => external.removeEventListener("abort", abort));
  }
  return {
    [TASK_BRAND]: true,
    get pending() {
      return state.pending;
    },
    get aborted() {
      return state.aborted;
    },
    get error() {
      return state.error;
    },
    get value() {
      return state.value;
    },
    run(...args) {
      controller?.abort();
      const mine = controller = new AbortController();
      if (external?.aborted) mine.abort();
      const current = () => mine === controller;
      state.pending = true;
      state.aborted = false;
      state.error = void 0;
      host.requestUpdate(priority);
      const promise = Promise.resolve(fn(...args, mine.signal)).then((value) => {
        if (current()) state.value = value;
        return value;
      }).catch((err) => {
        if (!current()) return void 0;
        if (err?.name === "AbortError") state.aborted = true;
        else state.error = err;
        return void 0;
      }).finally(() => {
        if (!current()) return;
        state.pending = false;
        host.requestUpdate(priority);
      });
      return Object.assign(promise, { [TASK_BRAND]: true });
    },
    abort() {
      controller?.abort();
    },
    [Symbol.dispose]() {
      controller?.abort();
    }
  };
}

// packages/dom/src/template.ts
function html(strings, ...values) {
  return { strings, values };
}
var templateCache = /* @__PURE__ */ new WeakMap();
var isSpace = (ch) => ch === " " || ch === "	" || ch === "\n" || ch === "\r" || ch === "\f";
var isNameChar = (ch) => ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch >= "0" && ch <= "9" || ch === "_" || ch === "-" || ch === ":" || ch === "." || ch === "@";
function attrNameBeforeHole(s) {
  let end = s.length;
  while (end > 0 && isSpace(s[end - 1])) end--;
  if (end === 0 || s[end - 1] !== "=") return void 0;
  end--;
  while (end > 0 && isSpace(s[end - 1])) end--;
  let start = end;
  while (start > 0 && isNameChar(s[start - 1])) start--;
  let name = s.slice(start, end);
  if (name[0] === "@" || name[0] === ".") name = name.slice(1);
  return name.length ? name : void 0;
}
function compileTemplate(strings) {
  const cached = templateCache.get(strings);
  if (cached) return cached;
  const nameByHole = /* @__PURE__ */ new Map();
  let markup = "";
  let inTag = false;
  let quote = "";
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    for (let c = 0; c < s.length; c++) {
      const ch = s[c];
      if (quote) {
        if (ch === quote) quote = "";
      } else if (inTag) {
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === ">") inTag = false;
      } else if (ch === "<") {
        inTag = true;
      }
    }
    markup += s;
    if (i < strings.length - 1) {
      if (!inTag) {
        markup += `<!--dh:${i}-->`;
      } else if (quote) {
        markup += `dh:${i}`;
      } else {
        const name = attrNameBeforeHole(s);
        if (name === void 0) {
          markup += ` dh-el-${i}=""`;
        } else {
          nameByHole.set(i, name);
          markup += `"dh:${i}"`;
        }
      }
    }
  }
  const tpl = document.createElement("template");
  tpl.innerHTML = markup;
  const metas = [];
  collectParts(tpl.content, [], metas);
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
  if (node.nodeType === 8) {
    const data = node.data;
    if (data.startsWith("dh:")) {
      metas.push({ kind: "node", path, holeIndex: Number(data.slice(3)) });
    }
  } else if (node.nodeType === 1) {
    const el2 = node;
    for (const attr of Array.from(el2.attributes)) {
      const elHole = /^dh-el-(\d+)$/.exec(attr.name);
      if (elHole) {
        metas.push({ kind: "element", path, holeIndex: Number(elHole[1]) });
        el2.removeAttribute(attr.name);
        continue;
      }
      if (!attr.value.includes("dh:")) continue;
      const value = attr.value;
      let name = attr.name;
      if (name.startsWith("@")) {
        metas.push({ kind: "event", path, holeIndex: firstHole(value), name: name.slice(1) });
      } else if (name.startsWith(".")) {
        metas.push({ kind: "property", path, holeIndex: firstHole(value), name: name.slice(1) });
      } else {
        const { strings, holeIndices } = splitAttrHoles(value);
        if (holeIndices.length === 1 && strings[0] === "" && strings[1] === "") {
          metas.push({ kind: "attr", path, holeIndex: holeIndices[0], name });
        } else {
          metas.push({ kind: "attr-multi", path, holeIndex: holeIndices[0], name, strings, holeIndices });
        }
      }
      el2.removeAttribute(attr.name);
    }
  }
  const kids = node.childNodes;
  for (let i = 0; i < kids.length; i++) {
    collectParts(kids[i], [...path, i], metas);
  }
}
var HOLE_RE = /dh:(\d+)/g;
function firstHole(value) {
  return Number(/dh:(\d+)/.exec(value)[1]);
}
function splitAttrHoles(value) {
  const strings = [];
  const holeIndices = [];
  let last = 0;
  HOLE_RE.lastIndex = 0;
  let m;
  while (m = HOLE_RE.exec(value)) {
    strings.push(value.slice(last, m.index));
    holeIndices.push(Number(m[1]));
    last = m.index + m[0].length;
  }
  strings.push(value.slice(last));
  return { strings, holeIndices };
}
function resolvePath(root, path) {
  let node = root;
  for (const i of path) node = node.childNodes[i];
  return node;
}
var currentHost;
function isTemplateResult(v) {
  return v != null && typeof v === "object" && "strings" in v && Array.isArray(v.values);
}
function instantiate(result) {
  const { content, metas } = compileTemplate(result.strings);
  const frag = content.cloneNode(true);
  const parts = bindParts(frag, metas);
  for (const part of parts) part.commit(result.values[part.holeIndex]);
  return { nodes: [...frag.childNodes], parts };
}
function appendSlot(host, content) {
  if (typeof content === "string") {
    host.insertAdjacentHTML("beforeend", content);
  } else {
    for (const node of instantiate(content).nodes) host.appendChild(node);
  }
}
function isRepeatResult(v) {
  return v != null && typeof v === "object" && v.__repeat === true;
}
function classMap(map2) {
  let out = "";
  for (const k in map2) if (map2[k]) out += (out ? " " : "") + k;
  return out;
}
function styleMap(map2) {
  let out = "";
  for (const k in map2) {
    const v = map2[k];
    if (v == null || v === false || v === "") continue;
    const prop = k.startsWith("--") ? k : k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    out += `${prop}:${v};`;
  }
  return out;
}
function when(condition, then, otherwise) {
  return condition ? then() : otherwise ? otherwise() : "";
}
function map(items, fn) {
  const out = [];
  if (items) {
    let i = 0;
    for (const item of items) out.push(fn(item, i++));
  }
  return out;
}
function ref(target) {
  return { __ref: target };
}
function isRefDirective(v) {
  return v != null && typeof v === "object" && "__ref" in v;
}
function applyRef(target, el2) {
  if (typeof target === "function") target(el2);
  else target.value = el2;
}
function isPortalResult(v) {
  return v != null && typeof v === "object" && v.__portal === true;
}
function isTaskLike(v) {
  return v != null && (typeof v === "object" || typeof v === "function") && v[TASK_BRAND] === true;
}
function isAwaitResult(v) {
  return v != null && typeof v === "object" && v.__await === true;
}
var NodePart = class _NodePart {
  // dev warning for an awaited Task already emitted once
  constructor(node, holeIndex) {
    this.holeIndex = holeIndex;
    this.#anchor = node;
  }
  holeIndex;
  #anchor;
  // comment marker — keeps the slot's position
  #strings;
  // identity of the currently-rendered template
  #parts;
  // live parts when a template is rendered
  #nodes = [];
  // the nodes currently inserted before the anchor
  #text;
  // reused text node when rendering plain text
  #keyed;
  // key -> item, when rendering a repeat()
  #keyOrder = [];
  // current key order, to detect structural changes
  #portalTarget;
  // when rendering a portal: where content lives
  #portalPart;
  // the sub-part that renders portaled content
  #portalAnchor;
  // the anchor appended to the portal target
  #awaitInput;
  // when rendering an Await: the value currently awaited
  #awaitToken;
  // identity of the live subscription (stale settles ignored)
  #awaitStatus;
  // current settled state
  #awaitValue;
  // resolved value (status "then")
  #awaitError;
  // rejection (status "catch")
  #awaitHandlers;
  // latest branches, refreshed every render
  #awaitWarnedTask = false;
  commit(value) {
    if (isAwaitResult(value)) return this.#renderAwait(value);
    if (this.#awaitToken) this.#resetAwait();
    if (isPortalResult(value)) return this.#renderPortal(value);
    if (this.#portalTarget) this.#teardownPortal();
    this.#commitValue(value);
  }
  /** Render any ordinary hole value (everything except the stateful Await/portal
   *  directives). Shared by `commit` and the Await settle handlers, so a resolved
   *  value lands in the slot without re-entering the directive dispatch above. */
  #commitValue(value) {
    if (value == null || typeof value === "boolean") return this.#renderText("");
    if (isRepeatResult(value)) return this.#renderRepeat(value);
    if (isTemplateResult(value)) return this.#renderTemplate(value);
    if (value instanceof Node) return this.#renderNode(value);
    if (Array.isArray(value)) return this.#renderList(value);
    this.#renderText(String(value));
  }
  // Await: subscribe to the thenable and render its state. The settle handlers
  // patch THIS slot directly (no host.requestUpdate), so a promise built inline in
  // render() isn't recreated on every update. Re-subscribes only when the awaited
  // value's identity changes; a same-identity re-render re-runs the current branch
  // with the latest handlers so reactive holes inside it still patch.
  #renderAwait(p) {
    if (this.#portalTarget) this.#teardownPortal();
    if (!this.#awaitWarnedTask && isTaskLike(p.input)) {
      this.#awaitWarnedTask = true;
      console.error(
        "flow.await: received a Task (or task.run()). A task triggers its own re-renders, so awaiting it in render() causes an infinite update loop. Read the task's reactive `pending`/`value`/`error` directly (e.g. with flow.if), or await a plain stored promise."
      );
    }
    this.#awaitHandlers = p.handlers;
    if (this.#awaitInput === p.input && this.#awaitToken) return this.#commitAwaitState();
    const token = {};
    this.#awaitInput = p.input;
    this.#awaitToken = token;
    this.#awaitStatus = "pending";
    this.#awaitValue = void 0;
    this.#awaitError = void 0;
    currentHost?.onCleanup(() => this.#resetAwait());
    Promise.resolve(p.input).then(
      (value) => {
        if (this.#awaitToken !== token) return;
        this.#awaitStatus = "then";
        this.#awaitValue = value;
        this.#commitAwaitState();
      },
      (error) => {
        if (this.#awaitToken !== token) return;
        this.#awaitStatus = "catch";
        this.#awaitError = error;
        this.#commitAwaitState();
      }
    );
    this.#commitAwaitState();
  }
  /** Render the branch for the current await status using the latest handlers. */
  #commitAwaitState() {
    const h = this.#awaitHandlers;
    const content = this.#awaitStatus === "then" ? h?.then?.(this.#awaitValue) : this.#awaitStatus === "catch" ? h?.catch?.(this.#awaitError) : h?.pending?.();
    this.#commitValue(content);
  }
  #resetAwait() {
    this.#awaitInput = void 0;
    this.#awaitToken = void 0;
    this.#awaitStatus = void 0;
    this.#awaitValue = void 0;
    this.#awaitError = void 0;
    this.#awaitHandlers = void 0;
    this.#awaitWarnedTask = false;
  }
  // Portal: content lives under `target` (e.g. document.body), not inline. The
  // inline anchor stays empty. Cleaned up when cleared or the host unmounts.
  #renderPortal(p) {
    if (this.#portalTarget !== p.target) {
      this.#teardownPortal();
      this.#clear();
      const anchor = document.createComment("dh-portal");
      p.target.appendChild(anchor);
      this.#portalAnchor = anchor;
      this.#portalPart = new _NodePart(anchor, 0);
      this.#portalTarget = p.target;
      currentHost?.onCleanup(() => this.#teardownPortal());
    }
    this.#portalPart.commit(p.content);
  }
  #teardownPortal() {
    this.#portalPart?.commit(null);
    this.#portalPart = void 0;
    this.#portalAnchor?.remove();
    this.#portalAnchor = void 0;
    this.#portalTarget = void 0;
  }
  // A component instance (or any node) placed directly in a hole. Reused if it's
  // the same node; replaced otherwise.
  #renderNode(node) {
    if (this.#nodes.length === 1 && this.#nodes[0] === node) return;
    this.#clear();
    this.#nodes = [node];
    this.#insert(node);
  }
  #insert(node, before = this.#anchor) {
    this.#anchor.parentNode.insertBefore(node, before);
  }
  #clear() {
    this.#teardownPortal();
    for (const n of this.#nodes) n.remove();
    this.#nodes = [];
    this.#parts = void 0;
    this.#strings = void 0;
    this.#text = void 0;
    this.#keyed = void 0;
    this.#keyOrder = [];
  }
  #renderText(text) {
    if (this.#text && this.#nodes.length === 1) {
      this.#text.data = text;
      return;
    }
    this.#clear();
    this.#text = document.createTextNode(text);
    this.#nodes = [this.#text];
    this.#insert(this.#text);
  }
  #renderTemplate(result) {
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
    for (const n of nodes) this.#insert(n);
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
      } else if (item instanceof Node) {
        this.#nodes.push(item);
        this.#insert(item);
      } else if (item != null && typeof item !== "boolean") {
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
    if (!this.#keyed) {
      this.#clear();
      this.#keyed = /* @__PURE__ */ new Map();
    }
    const old = this.#keyed;
    const next = /* @__PURE__ */ new Map();
    const ordered = [];
    let structural = result.keys.length !== this.#keyOrder.length;
    result.keys.forEach((key, i) => {
      const tmpl = result.templates[i];
      let item = old.get(key);
      if (item && item.strings === tmpl.strings) {
        for (const part of item.parts) part.commit(tmpl.values[part.holeIndex]);
      } else {
        if (item) for (const n of item.nodes) n.remove();
        const inst = instantiate(tmpl);
        item = { nodes: inst.nodes, parts: inst.parts, strings: tmpl.strings };
        structural = true;
      }
      if (this.#keyOrder[i] !== key) structural = true;
      next.set(key, item);
      ordered.push(item);
    });
    for (const [key, item] of old) {
      if (!next.has(key)) {
        for (const n of item.nodes) n.remove();
        structural = true;
      }
    }
    if (structural) {
      for (const item of ordered) for (const n of item.nodes) this.#insert(n);
    }
    this.#keyed = next;
    this.#keyOrder = result.keys;
    this.#nodes = ordered.flatMap((it) => it.nodes);
  }
};
var AttrPart = class {
  constructor(el2, name, holeIndex) {
    this.el = el2;
    this.name = name;
    this.holeIndex = holeIndex;
  }
  el;
  name;
  holeIndex;
  commit(value) {
    if (value == null || value === false) this.el.removeAttribute(this.name);
    else this.el.setAttribute(this.name, value === true ? "" : String(value));
  }
};
var AttrAssembler = class {
  constructor(el2, name, strings) {
    this.el = el2;
    this.name = name;
    this.strings = strings;
    this.#values = new Array(strings.length - 1);
  }
  el;
  name;
  strings;
  #values;
  set(slot, value) {
    this.#values[slot] = value;
    let out = this.strings[0];
    for (let i = 0; i < this.#values.length; i++) {
      const v = this.#values[i];
      out += (v == null ? "" : String(v)) + this.strings[i + 1];
    }
    this.el.setAttribute(this.name, out);
  }
};
var AttrSlotPart = class {
  constructor(asm, slot, holeIndex) {
    this.asm = asm;
    this.slot = slot;
    this.holeIndex = holeIndex;
  }
  asm;
  slot;
  holeIndex;
  commit(value) {
    this.asm.set(this.slot, value);
  }
};
var EventPart = class {
  constructor(el2, name, holeIndex) {
    this.el = el2;
    this.name = name;
    this.holeIndex = holeIndex;
  }
  el;
  name;
  holeIndex;
  #current;
  commit(value) {
    const listener = value;
    if (listener === this.#current) return;
    if (this.#current) this.el.removeEventListener(this.name, this.#current);
    this.#current = listener;
    if (listener) this.el.addEventListener(this.name, listener);
  }
};
var externalProps = /* @__PURE__ */ new WeakMap();
var PropertyPart = class {
  constructor(el2, name, holeIndex) {
    this.el = el2;
    this.name = name;
    this.holeIndex = holeIndex;
  }
  el;
  name;
  holeIndex;
  commit(value) {
    if (!this.el.isConnected) {
      let map2 = externalProps.get(this.el);
      if (!map2) externalProps.set(this.el, map2 = /* @__PURE__ */ new Map());
      map2.set(this.name, value);
    }
    this.el[this.name] = value;
  }
};
var ElementPart = class {
  constructor(el2, holeIndex) {
    this.el = el2;
    this.holeIndex = holeIndex;
  }
  el;
  holeIndex;
  #current;
  #registered = false;
  commit(value) {
    const target = isRefDirective(value) ? value.__ref : void 0;
    if (target === this.#current) return;
    if (this.#current) applyRef(this.#current, null);
    this.#current = target;
    if (!target) return;
    applyRef(target, this.el);
    if (!this.#registered) {
      this.#registered = true;
      currentHost?.onCleanup(() => this.#current && applyRef(this.#current, null));
    }
  }
};
function bindParts(frag, metas) {
  return metas.flatMap((m) => {
    const node = resolvePath(frag, m.path);
    if (m.kind === "node") return new NodePart(node, m.holeIndex);
    if (m.kind === "element") return new ElementPart(node, m.holeIndex);
    if (m.kind === "event") return new EventPart(node, m.name, m.holeIndex);
    if (m.kind === "property") return new PropertyPart(node, m.name, m.holeIndex);
    if (m.kind === "attr-multi") {
      const asm = new AttrAssembler(node, m.name, m.strings);
      return m.holeIndices.map((hi, slot) => new AttrSlotPart(asm, slot, hi));
    }
    return new AttrPart(node, m.name, m.holeIndex);
  });
}
function css(strings, ...values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++)
    text += String(values[i]) + strings[i + 1];
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text);
  return sheet;
}
var isLazyStyle = (s) => typeof s === "function";
function toStyleSheets(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map((s) => {
    if (s instanceof CSSStyleSheet) return s;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(s);
    return sheet;
  });
}
function normalizeStyles(input) {
  const list = Array.isArray(input) ? input : [input];
  return list.map((s) => isLazyStyle(s) || s instanceof CSSStyleSheet ? s : toStyleSheets(s)[0]);
}
function eachOwnStyle(ctor, visit) {
  for (const c of classChain(ctor, HTMLElement)) {
    const own = Object.getOwnPropertyDescriptor(c, "styles")?.value;
    if (own) for (const s of Array.isArray(own) ? own : [own]) visit(s);
  }
}
var stylesCache = /* @__PURE__ */ new WeakMap();
function getStyles(ctor) {
  const cached = stylesCache.get(ctor);
  if (cached) return cached;
  const perClass = [];
  for (const c of classChain(ctor, HTMLElement)) {
    const own = Object.getOwnPropertyDescriptor(c, "styles")?.value;
    const sheets = (own ? Array.isArray(own) ? own : [own] : []).filter(
      (s) => s instanceof CSSStyleSheet
    );
    perClass.push(sheets);
  }
  const out = perClass.reverse().flat();
  if (out.length > 0) stylesCache.set(ctor, out);
  return out;
}
function getLazyStyles(ctor) {
  const out = [];
  eachOwnStyle(ctor, (s) => {
    if (isLazyStyle(s)) out.push(s);
  });
  return out;
}
var lazyStyleCache = /* @__PURE__ */ new WeakMap();
function loadLazySheet(thunk) {
  let p = lazyStyleCache.get(thunk);
  if (!p) {
    p = Promise.resolve(thunk()).then((mod) => {
      const raw = mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
      if (raw instanceof CSSStyleSheet) return raw;
      if (typeof raw === "string") return toStyleSheets(raw)[0];
      throw new Error("lazy style must resolve to a CSS string / CSSStyleSheet (or a module with such a default export)");
    });
    lazyStyleCache.set(thunk, p);
  }
  return p;
}
function setCurrentHost(host) {
  currentHost = host;
}
function getCurrentHost() {
  return currentHost;
}

// packages/dom/src/signals.ts
var activeSubscriber;
var batchDepth = 0;
var batchQueue = /* @__PURE__ */ new Set();
function trackSignal(subs) {
  if (activeSubscriber) {
    subs.add(activeSubscriber);
    activeSubscriber.deps.add(subs);
  }
}
function notifySignal(subs) {
  for (const sub of [...subs]) {
    if (batchDepth > 0) batchQueue.add(sub);
    else sub.run();
  }
}
function unlinkSubscriber(sub) {
  for (const dep of sub.deps) dep.delete(sub);
  sub.deps.clear();
}
function createSignal(initial, options) {
  const equals = options?.equals ?? Object.is;
  let value = initial;
  const subs = /* @__PURE__ */ new Set();
  const read = function() {
    trackSignal(subs);
    return value;
  };
  const write = (next) => {
    if (equals(value, next)) return;
    value = next;
    notifySignal(subs);
  };
  Object.defineProperties(read, {
    value: { get: read, set: write, enumerable: true },
    peek: { value: () => value },
    set: { value: write },
    update: { value: (updater) => write(updater(value)) },
    subscribe: { value: (fn) => subscribeSignal(read, fn) },
    asReadonly: { value: () => read },
    [Symbol.toStringTag]: { value: "Signal" }
  });
  return read;
}
function createComputed(compute, options) {
  const equals = options?.equals ?? Object.is;
  let value;
  let stale = true;
  const subs = /* @__PURE__ */ new Set();
  const self = {
    deps: /* @__PURE__ */ new Set(),
    run() {
      if (!stale) {
        stale = true;
        notifySignal(subs);
      }
    }
  };
  const recompute = () => {
    unlinkSubscriber(self);
    const prev = activeSubscriber;
    activeSubscriber = self;
    try {
      const next = compute();
      if (stale || !equals(value, next)) value = next;
      stale = false;
    } finally {
      activeSubscriber = prev;
    }
  };
  const read = function() {
    if (stale) recompute();
    trackSignal(subs);
    return value;
  };
  Object.defineProperties(read, {
    value: { get: read, enumerable: true },
    peek: {
      value: () => {
        if (stale) recompute();
        return value;
      }
    },
    subscribe: { value: (fn) => subscribeSignal(read, fn) },
    [Symbol.toStringTag]: { value: "Computed" }
  });
  return read;
}
function createEffect(fn) {
  let cleanup;
  let active = true;
  const runCleanup = () => {
    if (typeof cleanup === "function") {
      const c = cleanup;
      cleanup = void 0;
      c();
    }
  };
  const self = {
    deps: /* @__PURE__ */ new Set(),
    run() {
      if (!active) return;
      unlinkSubscriber(self);
      runCleanup();
      const prev = activeSubscriber;
      activeSubscriber = self;
      try {
        cleanup = fn() || void 0;
      } finally {
        activeSubscriber = prev;
      }
    }
  };
  self.run();
  return () => {
    if (!active) return;
    active = false;
    unlinkSubscriber(self);
    runCleanup();
  };
}
function subscribeSignal(read, fn) {
  return createEffect(() => {
    fn(read());
  });
}

// packages/dom/src/decorators.ts
var reactiveProps = createRegistry(() => /* @__PURE__ */ new Set());
function registerProp(ctor, name) {
  reactiveProps.for(ctor).add(name);
}
var reactivePropsCache = /* @__PURE__ */ new WeakMap();
function getReactiveProps(ctor) {
  const cached = reactivePropsCache.get(ctor);
  if (cached) return cached;
  const out = /* @__PURE__ */ new Set();
  for (const c of classChain(ctor, HTMLElement)) {
    const set = reactiveProps.read(c);
    if (set) for (const n of set) out.add(n);
  }
  const arr = [...out];
  reactivePropsCache.set(ctor, arr);
  return arr;
}
var exposedEvents = createRegistry(() => /* @__PURE__ */ new Set());
function registerEvent(ctor, name) {
  exposedEvents.for(ctor).add(name);
}
function getExposedEvents(ctor) {
  const out = /* @__PURE__ */ new Set();
  for (const c of classChain(ctor, HTMLElement)) {
    const set = exposedEvents.read(c);
    if (set) for (const n of set) out.add(n);
  }
  return [...out];
}
function makeEmitter(host, type, opts) {
  const flags = { bubbles: opts.bubbles, composed: opts.composed, cancelable: opts.cancelable };
  const fn = ((detail) => host.emit(type, detail, flags));
  fn.emit = (detail) => host.emit(type, detail, flags);
  return fn;
}
Symbol.dispose ??= /* @__PURE__ */ Symbol("Symbol.dispose");
Symbol.metadata ??= /* @__PURE__ */ Symbol("Symbol.metadata");
var ATTR_META = "__attrProps__";
var REFLECT_META = "__reflectProps__";
function attrPropMap(target) {
  return target?.[Symbol.metadata]?.[ATTR_META];
}
function reflectPropMap(target) {
  return target?.[Symbol.metadata]?.[REFLECT_META];
}
var watchRegistry = createRegistry(() => /* @__PURE__ */ new Map());
function registerWatch(ctor, prop, method) {
  const map2 = watchRegistry.for(ctor);
  let list = map2.get(prop);
  if (!list) map2.set(prop, list = []);
  list.push(method);
}
function getWatchers(ctor, prop) {
  const out = [];
  for (const c of classChain(ctor, HTMLElement)) {
    const list = watchRegistry.read(c)?.get(prop);
    if (list) out.push(...list);
  }
  return out;
}
var compiledRenderCtors = /* @__PURE__ */ new WeakSet();
var compiledRenderCache = /* @__PURE__ */ new WeakMap();
function rendersCompiled(ctor) {
  const cached = compiledRenderCache.get(ctor);
  if (cached !== void 0) return cached;
  let compiled = false;
  for (const c of classChain(ctor, HTMLElement)) {
    if (compiledRenderCtors.has(c)) {
      compiled = true;
      break;
    }
  }
  compiledRenderCache.set(ctor, compiled);
  return compiled;
}
function propDecorator(opts) {
  return function(_value, ctx) {
    const name = ctx.name;
    if (opts?.attribute || opts?.reflect) {
      const attr = typeof opts.attribute === "string" ? opts.attribute : name.toLowerCase();
      const meta = ctx.metadata;
      if (!Object.prototype.hasOwnProperty.call(meta, ATTR_META))
        meta[ATTR_META] = { ...meta[ATTR_META] ?? {} };
      meta[ATTR_META][attr] = name;
      if (opts.reflect) {
        if (!Object.prototype.hasOwnProperty.call(meta, REFLECT_META))
          meta[REFLECT_META] = { ...meta[REFLECT_META] ?? {} };
        meta[REFLECT_META][name] = attr;
      }
    }
    ctx.addInitializer(function() {
      registerProp(this.constructor, name);
    });
  };
}
function eventDecorator(nameOrOpts) {
  const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : nameOrOpts ?? {};
  return function(_value, ctx) {
    if (ctx.kind === "field") {
      const type = opts.name ?? String(ctx.name);
      if (opts.exposed !== false) {
        ctx.addInitializer(function() {
          registerEvent(this.constructor, type);
        });
      }
      return function() {
        return makeEmitter(this, type, opts);
      };
    }
    if (opts.exposed && opts.name) {
      const type = opts.name;
      ctx.addInitializer(function() {
        registerEvent(this.constructor, type);
      });
    }
    ctx.addInitializer(function() {
      const self = this;
      const name = ctx.name;
      self[name] = self[name].bind(self);
    });
  };
}
function watchDecorator(prop) {
  return function(_value, ctx) {
    ctx.addInitializer(function() {
      registerWatch(this.constructor, prop, ctx.name);
    });
  };
}
function defineImmediate(value) {
  const inDom = typeof document !== "undefined" && !!value.tagName && hasUpgradeCandidate(value.tagName);
  if (inDom && typeof queueMicrotask === "function")
    queueMicrotask(() => define(value));
  else define(value);
  return value;
}
function hasUpgradeCandidate(tag) {
  if (document.getElementsByTagName(tag).length > 0) return true;
  const stack = [document];
  while (stack.length) {
    const root = stack.pop();
    const els = root.querySelectorAll("*");
    for (let i = 0; i < els.length; i++) {
      const sr = els[i].shadowRoot;
      if (!sr) continue;
      if (sr.querySelector(tag)) return true;
      stack.push(sr);
    }
  }
  return false;
}
var pendingDefines = /* @__PURE__ */ new Set();
function scheduleDefine(value, when3) {
  pendingDefines.add(value);
  if (when3 === "server" || typeof window === "undefined") return;
  const run = () => {
    pendingDefines.delete(value);
    defineImmediate(value);
  };
  if (typeof when3 === "number") setTimeout(run, when3);
  else if (typeof when3 === "function") void Promise.resolve(when3()).then(run);
  else if (when3 === "idle")
    (window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1)))(
      run
    );
  else if (when3 === "load")
    document.readyState === "complete" ? run() : window.addEventListener("load", run, { once: true });
  else if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run, { once: true });
}
function defineDecorator(when3) {
  return function(value, ctx) {
    if (ctx.metadata && !Object.prototype.hasOwnProperty.call(value, Symbol.metadata)) {
      Object.defineProperty(value, Symbol.metadata, {
        value: ctx.metadata,
        configurable: true,
        writable: true
      });
    }
    if (when3 === void 0) return defineImmediate(value);
    scheduleDefine(value, when3);
    return value;
  };
}
function compileDecorator() {
  return function(render, ctx) {
    if (ctx.name !== "render") {
      throw new Error("@Component.compile() must decorate the render() method");
    }
    ctx.addInitializer(function() {
      compiledRenderCtors.add(ctorOf(this));
    });
    return render;
  };
}
function computedDecorator() {
  return function(get, ctx) {
    const name = ctx.name;
    return function() {
      const cache = this.__computed ?? (this.__computed = /* @__PURE__ */ new Map());
      const ver = this.version;
      const hit = cache.get(name);
      if (hit && hit.ver === ver) return hit.value;
      const value = get.call(this);
      cache.set(name, { ver, value });
      return value;
    };
  };
}
function define(...components2) {
  for (const C of components2) {
    if (C.tagName && !customElements.get(C.tagName)) {
      customElements.define(
        C.tagName,
        C
      );
    }
  }
}

// packages/dom/src/component.ts
var instanceCounter = 0;
var devtoolsIds = /* @__PURE__ */ new WeakMap();
var hydrationData = /* @__PURE__ */ new WeakMap();
function devtoolsHook() {
  return globalThis.__DOM_DEVTOOLS__;
}
function describeTarget(target) {
  if (typeof window !== "undefined" && target === window) return "window";
  if (typeof document !== "undefined" && target === document) return "document";
  if (target instanceof Element) {
    const tag = target.tagName.toLowerCase();
    return target.id ? `<${tag}#${target.id}>` : `<${tag}>`;
  }
  const name = target.constructor?.name;
  return name && name !== "Object" ? name : "target";
}
var errorHandler = (error, info) => {
  console.error(`[${info.tag}] uncaught error during ${info.phase}:`, error);
};
function reactive(Base) {
  class Reactive extends Base {
    static tagName = "";
    /** Default update priority for this component (override per class). */
    static priority = "render-blocking";
    /** Optional per-component scheduler; falls back to the global default. */
    static scheduler;
    /** Render into a Shadow DOM root (default). `false` → light-DOM mode. */
    static shadow = true;
    /** Attributes to observe — the ones declared via `@prop({ attribute })`. */
    static get observedAttributes() {
      const map2 = attrPropMap(this);
      return map2 ? Object.keys(map2) : [];
    }
    /** Reflect an observed attribute into its prop (later attribute changes). */
    attributeChangedCallback(name, _old, value) {
      const prop = attrPropMap(this.constructor)?.[name];
      if (prop) this.#reflectAttr(prop, value);
    }
    /** Coerce an attribute string to the prop's default type and assign it. */
    #reflectAttr(prop, value) {
      const self = this;
      const current = self[prop];
      self[prop] = value === null ? typeof current === "boolean" ? false : void 0 : typeof current === "number" ? Number(value) : typeof current === "boolean" ? value !== "false" : value;
    }
    // `static styles` is intentionally NOT declared here: subclasses set it as a
    // fresh member (`static styles = css`…``), and getStyles() reads it at
    // runtime. Declaring it would force `override` on every component.
    // The render target: a ShadowRoot (default, scoped styles) or the element
    // itself in light-DOM mode (`Component(tag, { shadow: false })` — faster
    // mount, no style scoping/slots; the component uses global CSS).
    #root;
    #usesShadow = true;
    // `@Component.compile()`: a static template is rendered once, then the
    // instance is frozen — `requestUpdate()` becomes a no-op (nothing in a
    // hole-free template can change), skipping all re-render work.
    #frozen = false;
    // True between an `onError` boundary firing and the next SUCCESSFUL render —
    // so if the fallback render throws too, the error escalates to the global
    // handler instead of re-invoking `onError` forever.
    #recovering = false;
    #parts;
    #lastStrings;
    #connected = false;
    #mounted = false;
    #disposed = false;
    #version = 0;
    #id = ++instanceCounter;
    #controller = new AbortController();
    #cleanups = [];
    /** `this.listen()` subscriptions, for the devtools listener listing. */
    #listenerLog = [];
    /** Per-instance scheduler override (runtime swap via devtools/setScheduler). */
    #schedulerOverride;
    /** Active game-loop ticks -> their current unsubscribe, so a scheduler swap
     *  can move them onto the new scheduler's frame loop. */
    #frameStops = /* @__PURE__ */ new Map();
    /** Props passed to `new View({...})`; applied in connectedCallback AFTER
     *  field initializers + @prop upgrade, so they win over defaults. */
    #pendingProps;
    /** Slot content (light DOM) projected into a `<slot>` — for islands/SSR. */
    #pendingSlot;
    /** Typed factory: `UserView.of({ user })` autocompletes/checks the props of
     *  THIS class (its `_typed_props` contract if it declares one, else its data
     *  fields). Polymorphic `this` works on a static method, unlike the
     *  constructor. Optional `slot` is projected into a `<slot>` (islands/SSR).
     *  Prefer it over `new View({…})` when you want type-safety. */
    static of(props, slot) {
      return new this(props, slot);
    }
    // `new View({ name: "Ada" })` — first arg, if an object, becomes the props
    // bag (applied on connect). Optional, so `createElement` / the parser (which
    // call `new View()`) still work. The `...args` shape is required for mixins.
    constructor(...args) {
      super();
      this.#usesShadow = this.constructor.shadow !== false;
      if (this.#usesShadow) {
        this.#root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        this.#root.adoptedStyleSheets = getStyles(this.constructor);
      } else {
        this.#root = this;
      }
      devtoolsIds.set(this, this.#id);
      const props = args[0];
      if (props && typeof props === "object") {
        this.#pendingProps = props;
        hydrationData.set(this, this.#pendingProps);
      }
      const slot = args[1];
      if (slot != null) this.#pendingSlot = slot;
    }
    get version() {
      return this.#version;
    }
    /** Aborted on disconnect — pass to `addEventListener` / `fetch` / `this.task`'s
     *  `{ signal }`. (Named `abortSignal` so `this.signal()` is free for reactive
     *  state — Preact/Angular signals.) */
    get abortSignal() {
      return this.#controller.signal;
    }
    /**
     * A reactive value bound to this component — the signals model from
     * Preact/Angular. Writing it schedules a re-render, like a `@prop`, but it's
     * value-typed and lives in a field (no decorator, no attribute):
     *
     *   class Counter extends Component("x-counter") {
     *     count = this.signal(0);
     *     render() {
     *       return html`<button @click=${() => this.count.update(n => n + 1)}>
     *         ${this.count()}
     *       </button>`;
     *     }
     *   }
     *
     * Read with `this.count()` (Angular) or `this.count.value` (Preact); write
     * with `.set(x)`, `.value = x`, or `.update(prev => …)`. Auto-disposed on
     * disconnect.
     */
    signal(initial, options) {
      const sig = createSignal(initial, options);
      let primed = false;
      const stop = createEffect(() => {
        sig.value;
        if (primed) this.requestUpdate();
        else primed = true;
      });
      this.#cleanups.push(stop);
      return sig;
    }
    /** Memoized derived signal scoped to this host — recomputes lazily when the
     *  signals it reads change. */
    computed(compute, options) {
      return createComputed(compute, options);
    }
    /**
     * Run `fn` now and re-run it whenever the signals it reads change — for side
     * effects (logging, imperative DOM, syncing to storage). `fn` may return a
     * cleanup that runs before each re-run and on disconnect. Auto-stopped on
     * disconnect; the returned disposer stops it early.
     */
    effect(fn) {
      const stop = createEffect(fn);
      this.#cleanups.push(stop);
      return stop;
    }
    get #scheduler() {
      return this.#schedulerOverride ?? this.constructor.scheduler ?? getDefaultScheduler();
    }
    /**
     * Swap this instance's scheduler at runtime (devtools / debugging). Pass
     * `undefined` to revert to the class's `static scheduler` / global default.
     * Re-renders via the new scheduler so the change takes effect immediately.
     */
    setScheduler(scheduler) {
      this.#schedulerOverride = scheduler;
      for (const callback of [...this.#frameStops.keys()]) {
        this.#frameStops.get(callback)?.();
        this.#subscribeFrame(callback);
      }
      this.requestUpdate();
    }
    /** DOM depth (crosses shadow boundaries) — parents flush before children. */
    get depth() {
      let depth = 0;
      let node = this;
      while (node) {
        depth++;
        node = node.parentNode ?? node.host ?? null;
      }
      return depth;
    }
    // ---- devtools ----
    #tag() {
      return this.constructor.tagName ?? "?";
    }
    #snapshot() {
      const out = {};
      for (const name of getReactiveProps(this.constructor)) {
        out[name] = this[name];
      }
      return out;
    }
    // Each scoped rule + whether its selector currently matches anything in the
    // shadow root (applied) or not (dead CSS).
    #styleRules() {
      if (!this.#usesShadow) return [];
      const out = [];
      for (const sheet of this.#root.adoptedStyleSheets) {
        for (const rule of sheet.cssRules) {
          if (rule instanceof CSSStyleRule) {
            out.push({
              selector: rule.selectorText,
              cssText: rule.cssText,
              applied: this.#selectorApplies(rule.selectorText)
            });
          } else {
            out.push({ selector: "", cssText: rule.cssText, applied: true });
          }
        }
      }
      return out;
    }
    // Does any comma-group of `selector` match the host or a shadow descendant?
    #selectorApplies(selector) {
      for (const raw of selector.split(",")) {
        const group = raw.trim();
        try {
          if (group === ":host") return true;
          const host = group.match(/^:host\((.+)\)$/);
          if (host) {
            if (this.matches(host[1])) return true;
            continue;
          }
          const inner = group.startsWith(":host ") ? group.slice(6) : group;
          if (this.#root.querySelector(inner.replace(/::[\w-]+$/, "")))
            return true;
        } catch {
          return true;
        }
      }
      return false;
    }
    /** Nearest ancestor component's id, climbing parents + shadow hosts. */
    #parentId() {
      let node = this.parentNode ?? this.host ?? null;
      while (node) {
        const id = devtoolsIds.get(node);
        if (id !== void 0) return id;
        node = node.parentNode ?? node.host ?? null;
      }
      return void 0;
    }
    /** Active listeners: explicit `listen()` calls + template `@event` bindings. */
    #collectListeners() {
      const template = (this.#parts ?? []).filter((p) => p instanceof EventPart).map((p) => ({
        type: p.name,
        target: describeTarget(p.el),
        source: "template"
      }));
      return [...this.#listenerLog, ...template];
    }
    #devtools(kind, emit2) {
      const hook = devtoolsHook();
      if (!hook) return;
      if (this.constructor.devtools === false) return;
      const mounting = kind === "mount";
      const lifecycle = mounting || kind === "update";
      hook.send({
        kind,
        id: this.#id,
        tag: this.#tag(),
        time: Date.now(),
        version: this.#version,
        props: this.#snapshot(),
        // Captured every lifecycle tick (not just mount) so time-travel can
        // restore styles, e.g. ones changed imperatively via setStyles().
        styles: lifecycle ? this.#styleRules() : void 0,
        emit: emit2,
        parentId: mounting ? this.#parentId() : void 0,
        el: mounting ? this : void 0,
        exposed: mounting ? getExposedEvents(this.constructor) : void 0,
        listeners: lifecycle ? this.#collectListeners() : void 0,
        scheduler: lifecycle ? this.#scheduler.name ?? "?" : void 0,
        schedulerRef: lifecycle ? this.#scheduler : void 0,
        priority: lifecycle ? this.constructor.priority ?? "render-blocking" : void 0
      });
    }
    connectedCallback() {
      if (this.#disposed || this.#controller.signal.aborted) {
        this.#controller = new AbortController();
        this.#disposed = false;
      }
      if (!this.#connected) {
        this.#connected = true;
        for (const name of getReactiveProps(this.constructor)) {
          this.#upgradeProp(name);
        }
        const attrs = attrPropMap(this.constructor);
        if (attrs) {
          for (const attr in attrs)
            if (this.hasAttribute(attr)) this.#reflectAttr(attrs[attr], this.getAttribute(attr));
        }
        if (this.#pendingProps) {
          Object.assign(this, this.#pendingProps);
          this.#pendingProps = void 0;
        }
        if (this.#pendingSlot != null && this.childNodes.length === 0) {
          appendSlot(this, this.#pendingSlot);
        }
        this.#pendingSlot = void 0;
        const reflects = reflectPropMap(this.constructor);
        if (reflects)
          for (const prop in reflects)
            this.#writeAttr(reflects[prop], this[prop]);
        this.#loadLazyStyles();
      }
      this.#render();
    }
    /** Resolve any lazy style thunks and adopt the sheets once they load. The
     *  component has already rendered with its synchronous styles by now, so
     *  these arrive late (FOUC) — see `ComponentOptions.styles`. */
    #loadLazyStyles() {
      if (!this.#usesShadow) return;
      const root = this.#root;
      for (const thunk of getLazyStyles(this.constructor)) {
        loadLazySheet(thunk).then((sheet) => {
          if (this.#disposed || this.#controller.signal.aborted) return;
          if (!root.adoptedStyleSheets.includes(sheet))
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        }).catch((e) => console.error(`[${this.#tag()}] lazy styles failed:`, e));
      }
    }
    /** Light-DOM children projected into this component's `<slot>` — for render
     *  logic (fallbacks, counts, wrapping). The `<slot>` element projects them
     *  automatically; use this only when you need to branch on the content. */
    slotted() {
      return [...this.children];
    }
    /**
     * Typed attribute read: the component's `@prop` names autocomplete (other
     * strings still allowed via the AnyString trick). The return type stays
     * `string | null` — attributes ARE strings, and overriding `Element`'s
     * signature can't widen the return without breaking the base contract. For a
     * typed VALUE, read the prop directly (`this.count`) or use `attr()`.
     */
    getAttribute(qualifiedName) {
      return super.getAttribute(qualifiedName);
    }
    /** Like getAttribute, but typed to the prop: a known `@prop` name returns
     *  that prop's value (read off the instance), otherwise the raw attribute. */
    attr(name) {
      return name in this ? this[name] : super.getAttribute(name);
    }
    disconnectedCallback() {
      try {
        this.onUnmount?.();
      } catch (error) {
        this.#handleError(error, "unmount");
      }
      this[Symbol.dispose]();
    }
    /** Explicit disposal (TC39 `using`) — same teardown as disconnect. */
    [Symbol.dispose]() {
      if (this.#disposed) return;
      this.#devtools("unmount");
      this.#disposed = true;
      for (const teardown of this.#cleanups.splice(0)) teardown();
      this.#controller.abort();
    }
    requestUpdate(priority = this.constructor.priority ?? "render-blocking") {
      if (this.#frozen) return;
      this.#version++;
      if (!this.#connected) return;
      this.#scheduler.request(this, priority);
    }
    /** Render now — called by the scheduler (implements SchedulerHost). */
    flush() {
      this.#render();
    }
    /** Flush this host's scheduler synchronously (SSR/SSG, tests). */
    flushSync() {
      this.#scheduler.flushSync();
    }
    /** Register teardown to run on disconnect / dispose. */
    onCleanup(teardown) {
      this.#cleanups.push(teardown);
    }
    /**
     * Create an abortable async task bound to this host — sugar for the
     * standalone `task(this, …)`, so you don't have to pass `this`:
     *
     *   load = this.task(async (id, signal) => fetch(`/x/${id}`, { signal }), { priority: "background" });
     *
     * The previous run is aborted when a new one starts and on disconnect; its
     * `pending` / `value` / `error` updates are scheduled at `options.priority`.
     */
    task(fn, options) {
      return task(this, fn, options);
    }
    /** This instance's live scoped stylesheets. Mutate one in place
     *  (`getStyles()[0].replaceSync(…)`) to restyle at runtime — note `css`
     *  sheets shared across components are shared state. Prefer `setStyles()`
     *  for a clean per-instance swap. */
    getStyles() {
      return this.#usesShadow ? [...this.#root.adoptedStyleSheets] : [];
    }
    /** Replace this instance's scoped styles at runtime (per-instance — does
     *  not touch sheets shared via `static styles` / Component options).
     *  No-op in light-DOM mode (no scoping target). */
    setStyles(input) {
      if (this.#usesShadow) this.#root.adoptedStyleSheets = toStyleSheets(input);
    }
    /**
     * Game-loop tick (dt in ms) on this host's scheduler — runs every frame,
     * even with no reactive change; state set inside renders the same frame.
     * Auto-stops on disconnect. Use a frame scheduler (`static scheduler =
     * createFpsScheduler(n)`); otherwise falls back to the rAF scheduler.
     */
    onFrame(callback) {
      this.#subscribeFrame(callback);
      const teardown = () => {
        this.#frameStops.get(callback)?.();
        this.#frameStops.delete(callback);
      };
      this.onCleanup(teardown);
      return teardown;
    }
    /** (Re)subscribe a game-loop tick on the CURRENT scheduler, tracking its
     *  unsubscribe so a later scheduler swap can move it. */
    #subscribeFrame(callback) {
      const sched = this.#scheduler;
      const stop = (sched.frame ?? rafScheduler.frame)(callback);
      this.#frameStops.set(callback, stop);
    }
    /** addEventListener that auto-unsubscribes on disconnect. */
    listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      const info = {
        type,
        target: describeTarget(target),
        source: "listen"
      };
      this.#listenerLog.push(info);
      this.onCleanup(() => {
        target.removeEventListener(type, handler, options);
        const i = this.#listenerLog.indexOf(info);
        if (i >= 0) this.#listenerLog.splice(i, 1);
      });
    }
    /** Dispatch a CustomEvent (Angular @Output / Vue emit). Bubbling + composed
     *  by default so a parent's `@type=${fn}` (even across a shadow boundary)
     *  catches it; `flags` overrides those for one dispatch. */
    emit(type, detail, flags) {
      this.#devtools("emit", { type, detail });
      this.dispatchEvent(
        new CustomEvent(type, {
          detail,
          bubbles: flags?.bubbles ?? true,
          composed: flags?.composed ?? true,
          cancelable: flags?.cancelable ?? false
        })
      );
    }
    #upgradeProp(name) {
      let store2 = this[name];
      const external = externalProps.get(this);
      if (external?.has(name)) {
        store2 = external.get(name);
        external.delete(name);
      }
      delete this[name];
      const watchers = getWatchers(this.constructor, name);
      const reflectAttr = reflectPropMap(this.constructor)?.[name];
      Object.defineProperty(this, name, {
        configurable: true,
        enumerable: true,
        get: () => store2,
        set: (value) => {
          if (value === store2) return;
          const previous = store2;
          store2 = value;
          for (const m of watchers) {
            this[m](value, previous);
          }
          if (reflectAttr !== void 0) this.#writeAttr(reflectAttr, value);
          this.requestUpdate();
        }
      });
    }
    /** Write a prop value to an attribute: booleans toggle presence, others stringify. */
    #writeAttr(attr, value) {
      if (value === false || value == null) this.removeAttribute(attr);
      else this.setAttribute(attr, value === true ? "" : String(value));
    }
    #render() {
      const prevHost = getCurrentHost();
      setCurrentHost(this);
      try {
        this.#renderInner();
      } finally {
        setCurrentHost(prevHost);
      }
    }
    /** Route a caught error to this component's `onError` boundary (once per
     *  failed render cycle), else to the global handler. */
    #handleError(error, phase) {
      const info = { phase, tag: this.#tag(), component: this };
      const onError = this.onError;
      if (typeof onError === "function" && !this.#recovering) {
        this.#recovering = true;
        try {
          onError.call(this, error, info);
          return;
        } catch (e) {
          error = e;
        }
      }
      errorHandler(error, info);
    }
    #renderInner() {
      const firstRender = !this.#mounted;
      try {
        const result = this.render();
        if (result instanceof Node) {
          if (this.#root.childNodes.length !== 1 || this.#root.firstChild !== result) {
            while (this.#root.firstChild)
              this.#root.removeChild(this.#root.firstChild);
            this.#root.appendChild(result);
          }
          this.#lastStrings = void 0;
          this.#parts = void 0;
        } else if (this.#lastStrings !== result.strings) {
          const { content, metas } = compileTemplate(result.strings);
          const frag = content.cloneNode(true);
          this.#parts = bindParts(frag, metas);
          this.#lastStrings = result.strings;
          for (const part of this.#parts)
            part.commit(result.values[part.holeIndex]);
          while (this.#root.firstChild)
            this.#root.removeChild(this.#root.firstChild);
          this.#root.appendChild(frag);
        } else {
          for (const part of this.#parts) {
            part.commit(result.values[part.holeIndex]);
          }
        }
        if (!this.#frozen && !(result instanceof Node) && result.values.length === 0 && rendersCompiled(this.constructor)) {
          this.#frozen = true;
        }
      } catch (error) {
        this.#handleError(error, firstRender ? "render" : "update");
        return;
      }
      this.#recovering = false;
      try {
        if (firstRender) {
          this.#mounted = true;
          this.onMount?.();
          this.#devtools("mount");
        } else {
          this.onUpdate?.();
          this.#devtools("update");
        }
      } catch (error) {
        if (firstRender) this.#mounted = true;
        this.#handleError(error, firstRender ? "mount" : "update");
      }
    }
    // Lifecycle hooks are NOT declared here on purpose: a subclass opts in by
    // defining onMount/onUpdate/onUnmount (Vue: onMounted/… · Angular: ngOnInit/…),
    // optionally with `implements OnMount` to have the compiler require it. They
    // run via duck-typing (`?.`) so a component without them costs nothing.
  }
  return Reactive;
}
var anonTagSeq = 0;
function Component(tagName, baseOrOptions, options) {
  const positionalBase = typeof baseOrOptions === "function";
  const opts = (positionalBase ? options : baseOrOptions) ?? {};
  const Base = positionalBase ? baseOrOptions : opts.base ?? HTMLElement;
  const providers = opts.providers;
  class Scoped extends reactive(Base) {
    static tagName = tagName ?? `youneed-c${++anonTagSeq}`;
    constructor(...args) {
      super(...args);
      if (providers) for (const p of providers) p.install(this);
    }
  }
  if (opts.priority !== void 0) Scoped.priority = opts.priority;
  if (opts.scheduler !== void 0) Scoped.scheduler = opts.scheduler;
  if (opts.shadow !== void 0) Scoped.shadow = opts.shadow;
  if (opts.styles !== void 0) {
    Scoped.styles = normalizeStyles(opts.styles);
  }
  return Scoped;
}
Component.prop = propDecorator;
Component.event = eventDecorator;
Component.watch = watchDecorator;
Component.define = defineDecorator;
Component.compile = compileDecorator;
Component.computed = computedDecorator;

// packages/devtools/src/core.ts
var schedulerRegistry = /* @__PURE__ */ new Map();
for (const s of [createScheduler(), syncScheduler, rafScheduler]) {
  if (s.name) schedulerRegistry.set(s.name, s);
}
function freshLike(s) {
  const name = s.name ?? "";
  const fps = /^fps\((\d+)\)$/.exec(name);
  if (fps) return createFpsScheduler(Number(fps[1]));
  if (name === "raf") return createFpsScheduler();
  if (name === "microtask") return createScheduler();
  return s;
}
function schedulerChoices() {
  return [
    { label: "default (revert)", make: () => void 0 },
    ...[...schedulerRegistry.values()].map((s) => ({ label: s.name, make: () => freshLike(s) }))
  ];
}
var store = /* @__PURE__ */ new Map();
var subscribers = /* @__PURE__ */ new Set();
function ensure(event) {
  let record = store.get(event.id);
  if (!record) {
    record = {
      id: event.id,
      tag: event.tag,
      mountedAt: event.time,
      alive: true,
      props: {},
      history: [],
      events: [],
      exposed: [],
      listeners: [],
      styles: []
    };
    store.set(event.id, record);
  }
  return record;
}
var replaying = false;
function replay(fn) {
  replaying = true;
  try {
    return fn();
  } finally {
    replaying = false;
  }
}
function send(event) {
  const record = ensure(event);
  switch (event.kind) {
    case "mount":
      record.alive = true;
      record.styles = event.styles ?? [];
      record.parentId = event.parentId;
      record.exposed = event.exposed ?? [];
      if (event.el) record.elRef = new WeakRef(event.el);
    // falls through to record props + push history
    case "update":
      record.props = event.props ?? {};
      if (event.listeners) record.listeners = event.listeners;
      if (event.styles) record.styles = event.styles;
      if (event.scheduler !== void 0) record.scheduler = event.scheduler;
      if (event.priority !== void 0) record.priority = event.priority;
      if (event.schedulerRef?.name) schedulerRegistry.set(event.schedulerRef.name, event.schedulerRef);
      if (!replaying) {
        record.history.push({
          time: event.time,
          version: event.version,
          props: record.props,
          styles: event.styles
        });
      }
      break;
    case "unmount":
      record.alive = false;
      break;
    case "emit":
      if (event.emit) record.events.push({ time: event.time, ...event.emit });
      break;
  }
  for (const notify of subscribers) notify();
}
var pluginTeardowns = [];
function installDevtools(options = {}) {
  globalThis.__DOM_DEVTOOLS__ = { send };
  for (const plugin of options.plugins ?? []) {
    const teardown = plugin.install();
    if (typeof teardown === "function") pluginTeardowns.push(teardown);
  }
}
function subscribe(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
function components() {
  return [...store.values()];
}
function inspect(id) {
  return store.get(id);
}
function el(tag, className, children) {
  const node = document.createElement(tag);
  node.className = className;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
function button(label, disabled, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}
function checkbox(checked, onChange) {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.className = "cssck";
  cb.addEventListener("change", onChange);
  return cb;
}
function fmt(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function componentPlugin(id, title, Component2) {
  return {
    id,
    title,
    render(container, ctx) {
      define(Component2);
      const element = document.createElement(Component2.tagName);
      element.ctx = ctx;
      container.appendChild(element);
      element.flushSync?.();
      return () => element.remove();
    }
  };
}

// packages/devtools/src/component-tree.ts
function buildTree(records) {
  const nodes = /* @__PURE__ */ new Map();
  for (const record of records) nodes.set(record.id, { record, children: [], depth: 0 });
  const roots = [];
  for (const node of nodes.values()) {
    const parentId = node.record.parentId;
    const parent = parentId != null ? nodes.get(parentId) : void 0;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const assignDepth = (node, depth) => {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);
  return roots;
}
function flattenTree(roots, query, collapsed) {
  const q = query.trim().toLowerCase();
  const out = [];
  const matches = (n) => !q || n.record.tag.toLowerCase().includes(q);
  const visit = (node) => {
    let keptChild = false;
    const before = out.length;
    out.push(node);
    if (q || !collapsed.has(node.record.id)) {
      for (const child of node.children) keptChild = visit(child) || keptChild;
    }
    if (matches(node) || keptChild) return true;
    out.length = before;
    return false;
  };
  for (const root of roots) visit(root);
  return out;
}
function changedKeys(prev, next) {
  return [.../* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(next)])].filter((k) => !Object.is(prev[k], next[k])).sort();
}
var TREE_CSS = `
  :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .ct-toolbar { padding: 6px 8px; border-bottom: 1px solid #3a3a40; }
  .search { width: 100%; background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; padding: 3px 6px; font: inherit; }
  .search:focus { outline: none; border-color: #6366f1; }
  .ct-body { flex: 1; display: flex; min-height: 0; }
  .tree { width: 50%; overflow: auto; border-right: 1px solid #3a3a40; padding: 4px 0; }
  .detail { width: 50%; overflow: auto; padding: 6px 8px; }
  .row { display: flex; align-items: stretch; cursor: pointer; white-space: nowrap; user-select: none; min-height: 20px; }
  .row:hover { background: #2c2c33; }
  .row.selected { background: #3730a3; color: #fff; }
  .row.dead { opacity: .45; }
  .guide { flex: 0 0 14px; border-left: 1px solid #3a3a40; }
  .toggle { flex: 0 0 14px; display: flex; align-items: center; justify-content: center; color: #71717a; font-size: 9px; }
  .toggle.has:hover { color: #e4e4e7; }
  .label { display: flex; align-items: center; gap: 6px; padding: 2px 8px 2px 2px; }
  .tag { color: #93c5fd; }
  .row.selected .tag { color: #c7d2fe; }
  .id { color: #71717a; }
  .row.selected .id { color: #c7d2fe; }
  .kids { color: #52525b; }
  .section { margin: 8px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  .kv { display: flex; gap: 6px; padding: 1px 0; }
  .kv .k { color: #fbbf24; }
  .kv .v { color: #d4d4d8; word-break: break-all; }
  .lst { display: flex; gap: 6px; padding: 1px 0; }
  .lst .type { color: #f0abfc; }
  .lst .tgt { color: #93c5fd; }
  .lst .src { color: #71717a; }
  .sched { display: flex; align-items: center; gap: 6px; padding: 1px 0; flex-wrap: wrap; }
  .sched select { background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; font: inherit; padding: 1px 4px; }
  .sched .cur { color: #4ade80; }
  .sched .prio { color: #fbbf24; }
  .diff .k { color: #fbbf24; }
  .arrow { color: #71717a; }
  .old { color: #f87171; text-decoration: line-through; }
  .new { color: #4ade80; }
  .event .type { color: #f0abfc; }
  .muted { color: #71717a; }
`;
var ComponentTreeView;
function defineComponentTreeView() {
  var _ctx_dec, _a111, _b, _init111, _search, _collapsed, _frozen, _cleanup, _ComponentTreeViewImpl_instances, hl_fn, orderedEvents_fn, toggle_fn6, rowOf_fn, detail_fn;
  return _b = class extends (_a111 = Component("dt-component-tree"), _ctx_dec = [Component.prop()], _a111) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _ComponentTreeViewImpl_instances);
      __publicField(this, "ctx", __runInitializers(_init111, 8, this)), __runInitializers(_init111, 11, this);
      __privateAdd(this, _search, "");
      __privateAdd(this, _collapsed, /* @__PURE__ */ new Set());
      __privateAdd(this, _frozen, false);
      // freeze re-render while the scheduler dropdown is open
      __privateAdd(this, _cleanup, []);
    }
    onMount() {
      const ctx = this.ctx;
      if (!ctx) return;
      __privateGet(this, _cleanup).push(
        ctx.subscribe(() => {
          if (!__privateGet(this, _frozen)) this.requestUpdate();
        })
      );
      __privateGet(this, _cleanup).push(ctx.onSelect(() => this.requestUpdate()));
      __privateGet(this, _cleanup).push(
        ctx.onSettingsChange(() => {
          this.requestUpdate();
          __privateMethod(this, _ComponentTreeViewImpl_instances, hl_fn).call(this, ctx.current());
        })
      );
    }
    onUnmount() {
      for (const fn of __privateGet(this, _cleanup)) fn();
      __privateSet(this, _cleanup, []);
      this.ctx?.highlight(void 0);
    }
    render() {
      const ctx = this.ctx;
      if (!ctx) return html``;
      const rows = flattenTree(buildTree(ctx.components()), __privateGet(this, _search), __privateGet(this, _collapsed));
      const selectedId = ctx.selected();
      return html`
        <div class="ct-toolbar">
          <input
            class="search"
            placeholder="search tree…"
            @input=${(e) => {
        __privateSet(this, _search, e.target.value);
        this.requestUpdate();
      }}
          />
        </div>
        <div class="ct-body">
          <div class="tree">${rows.map((node) => __privateMethod(this, _ComponentTreeViewImpl_instances, rowOf_fn).call(this, node, selectedId, ctx))}</div>
          <div class="detail">${__privateMethod(this, _ComponentTreeViewImpl_instances, detail_fn).call(this, ctx)}</div>
        </div>
      `;
    }
  }, _init111 = __decoratorStart(_a111), _search = new WeakMap(), _collapsed = new WeakMap(), _frozen = new WeakMap(), _cleanup = new WeakMap(), _ComponentTreeViewImpl_instances = new WeakSet(), /** Highlight `rec` on the page — gated by this plugin's "highlight" toggle. */
  hl_fn = function(rec) {
    this.ctx?.highlight(this.ctx.setting("highlight") ? rec : void 0);
  }, /** Emitted events shaped by the "events" settings (overwrite / order / limit). */
  orderedEvents_fn = function(rec, ctx) {
    let events = rec.events;
    if (ctx.setting("eventsOverwrite")) {
      const byType = /* @__PURE__ */ new Map();
      for (const e of events) {
        byType.delete(e.type);
        byType.set(e.type, e);
      }
      events = [...byType.values()];
    }
    const ordered = ctx.setting("eventsOrder") === "oldest" ? [...events] : [...events].reverse();
    const limit = Number(ctx.setting("eventsLimit"));
    return limit > 0 ? ordered.slice(0, limit) : ordered;
  }, toggle_fn6 = function(id) {
    if (__privateGet(this, _collapsed).has(id)) __privateGet(this, _collapsed).delete(id);
    else __privateGet(this, _collapsed).add(id);
    this.requestUpdate();
  }, rowOf_fn = function(node, selectedId, ctx) {
    const rec = node.record;
    const hasKids = node.children.length > 0;
    const searching = __privateGet(this, _search).trim() !== "";
    const isCollapsed = hasKids && !searching && __privateGet(this, _collapsed).has(rec.id);
    const cls = "row" + (rec.id === selectedId ? " selected" : "") + (rec.alive ? "" : " dead");
    return html`
        <div
          class=${cls}
          @click=${() => ctx.select(rec.id)}
          @mouseenter=${() => __privateMethod(this, _ComponentTreeViewImpl_instances, hl_fn).call(this, rec)}
          @mouseleave=${() => __privateMethod(this, _ComponentTreeViewImpl_instances, hl_fn).call(this, ctx.current())}
        >
          ${Array.from({ length: node.depth }, () => html`<span class="guide"></span>`)}
          <span
            class=${hasKids ? "toggle has" : "toggle"}
            @click=${(e) => {
      if (hasKids) {
        e.stopPropagation();
        __privateMethod(this, _ComponentTreeViewImpl_instances, toggle_fn6).call(this, rec.id);
      }
    }}
            >${hasKids ? isCollapsed ? "▶" : "▼" : ""}</span
          >
          <span class="label">
            <span class="tag">${`<${rec.tag}>`}</span>
            <span class="id">${`#${rec.id}${rec.alive ? "" : " ⚰"}`}</span>
            ${isCollapsed ? html`<span class="kids">… ${node.children.length}</span>` : html``}
          </span>
        </div>
      `;
  }, detail_fn = function(ctx) {
    const rec = ctx.current();
    if (!rec) return html`<div class="muted">select a component</div>`;
    const node = rec.elRef?.deref();
    const canSwap = rec.alive && typeof node?.setScheduler === "function";
    const choices = ctx.schedulerChoices();
    const activeIdx = Math.max(0, choices.findIndex((c) => c.label === rec.scheduler));
    const propKeys = Object.keys(rec.props);
    const n = rec.history.length;
    const diff = n > 1 ? changedKeys(rec.history[n - 2].props, rec.history[n - 1].props) : [];
    return html`
        <div class="section">${`<${rec.tag}> #${rec.id}${rec.alive ? "" : " — unmounted"}`}</div>

        <div class="section">scheduling</div>
        <div class="sched">
          <span class="k">scheduler:</span>
          <span class="cur">${rec.scheduler ?? "?"}</span>
          <select
            .value=${String(activeIdx)}
            .disabled=${!canSwap}
            @focus=${() => __privateSet(this, _frozen, true)}
            @blur=${() => {
      __privateSet(this, _frozen, false);
      this.requestUpdate();
    }}
            @change=${(e) => node?.setScheduler?.(choices[Number(e.target.value)]?.make())}
          >
            ${choices.map((c, i) => html`<option value=${i}>${c.label}</option>`)}
          </select>
        </div>
        <div class="sched"><span class="k">priority:</span><span class="prio">${rec.priority ?? "?"}</span></div>

        <div class="section">props</div>
        ${propKeys.length === 0 ? html`<div class="muted">—</div>` : propKeys.map((k) => html`<div class="kv"><span class="k">${`${k}:`}</span><span class="v">${fmt(rec.props[k])}</span></div>`)}

        ${diff.length > 0 ? html`
              <div class="section">latest change</div>
              <div class="diff">
                ${diff.map(
      (k) => html`
                    <div class="kv">
                      <span class="k">${`${k}:`}</span>
                      <span class="old">${fmt(rec.history[n - 2].props[k])}</span>
                      <span class="arrow">→</span>
                      <span class="new">${fmt(rec.history[n - 1].props[k])}</span>
                    </div>
                  `
    )}
              </div>
            ` : html``}

        <div class="section">${`exposed events (${rec.exposed.length})`}</div>
        ${rec.exposed.length === 0 ? html`<div class="muted">—</div>` : rec.exposed.map(
      (name) => html`<div class="event"><span class="type">${`@${name}`}</span><span class="src">· bind in parent template</span></div>`
    )}

        <div class="section">${`listeners (${rec.listeners.length})`}</div>
        ${rec.listeners.length === 0 ? html`<div class="muted">—</div>` : rec.listeners.map(
      (l) => html`<div class="lst"><span class="type">${l.type}</span><span class="tgt">${`on ${l.target}`}</span><span class="src">${`· ${l.source}`}</span></div>`
    )}

        ${rec.events.length > 0 ? (() => {
      const shown = __privateMethod(this, _ComponentTreeViewImpl_instances, orderedEvents_fn).call(this, rec, ctx);
      const suffix = shown.length < rec.events.length ? ` — showing ${shown.length}` : "";
      return html`
                <div class="section">${`emitted events (${rec.events.length}${suffix})`}</div>
                ${shown.map(
        (e) => html`<div class="event"><span class="type">${`↑ ${e.type}`}</span><span class="v">${`: ${fmt(e.detail)}`}</span></div>`
      )}
              `;
    })() : html``}
      `;
  }, __decorateElement(_init111, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init111, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`${TREE_CSS}`), _b;
}
function componentTreePanel() {
  ComponentTreeView ??= defineComponentTreeView();
  return {
    ...componentPlugin("components", "Components", ComponentTreeView),
    settings: [
      { id: "highlight", label: "Highlight element on hover / select", default: true },
      {
        id: "eventsOrder",
        label: "Events order",
        type: "select",
        default: "newest",
        options: [
          { value: "newest", label: "Newest first" },
          { value: "oldest", label: "Oldest first" }
        ]
      },
      { id: "eventsOverwrite", label: "Collapse repeated events (keep latest)", default: false },
      {
        id: "eventsLimit",
        label: "Max events shown",
        type: "select",
        default: "25",
        options: [
          { value: "10", label: "10" },
          { value: "25", label: "25" },
          { value: "50", label: "50" },
          { value: "0", label: "All" }
        ]
      }
    ]
  };
}

// packages/devtools/src/time-travel.ts
var TimeTravelView;
function defineTimeTravelView() {
  var _ctx_dec, _a111, _b, _init111, _snap, _highlight, _cleanup, _TimeTravelViewImpl_instances, paintHighlight_fn, toggleHighlight_fn, apply_fn2, goTo_fn;
  return _b = class extends (_a111 = Component("dt-time-travel"), _ctx_dec = [Component.prop()], _a111) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _TimeTravelViewImpl_instances);
      __publicField(this, "ctx", __runInitializers(_init111, 8, this)), __runInitializers(_init111, 11, this);
      __privateAdd(this, _snap, null);
      // null = follow live
      __privateAdd(this, _highlight, false);
      // keep the selected element outlined on the page
      __privateAdd(this, _cleanup, []);
    }
    onMount() {
      const ctx = this.ctx;
      if (!ctx) return;
      __privateGet(this, _cleanup).push(ctx.subscribe(() => (this.requestUpdate(), __privateMethod(this, _TimeTravelViewImpl_instances, paintHighlight_fn).call(this))));
      __privateGet(this, _cleanup).push(
        ctx.onSelect(() => {
          __privateSet(this, _snap, null);
          this.requestUpdate();
          __privateMethod(this, _TimeTravelViewImpl_instances, paintHighlight_fn).call(this);
        })
      );
      const refresh = () => __privateMethod(this, _TimeTravelViewImpl_instances, paintHighlight_fn).call(this);
      this.listen(window, "scroll", refresh, { passive: true, capture: true });
      this.listen(window, "resize", refresh);
    }
    onUnmount() {
      for (const fn of __privateGet(this, _cleanup)) fn();
      __privateSet(this, _cleanup, []);
      this.ctx?.highlight(void 0);
    }
    render() {
      const ctx = this.ctx;
      if (!ctx) return html``;
      const rec = ctx.current();
      if (!rec) return html`<div class="muted">select a component in the Components tab</div>`;
      if (rec.history.length === 0) return html`<div class="muted">no recorded snapshots yet</div>`;
      const last = rec.history.length - 1;
      const index = __privateGet(this, _snap) == null ? last : Math.min(__privateGet(this, _snap), last);
      const live = __privateGet(this, _snap) == null || index === last;
      const snap = rec.history[index];
      const elementLive = rec.alive && !!rec.elRef?.deref();
      const badgeCls = live ? "badge live" : elementLive ? "badge synced" : "badge past";
      const badgeTxt = live ? "● LIVE" : elementLive ? "⟲ TIME-TRAVEL · DOM synced" : "◷ PAST · DOM unchanged";
      const props = snap.props;
      const prev = index > 0 ? rec.history[index - 1].props : void 0;
      const changedKeys2 = prev ? [.../* @__PURE__ */ new Set([...Object.keys(prev), ...Object.keys(props)])].filter((k) => !Object.is(prev[k], props[k])).sort() : [];
      return html`
      <div class="travel">
        <button @click=${() => __privateMethod(this, _TimeTravelViewImpl_instances, goTo_fn).call(this, index - 1, rec)} .disabled=${index <= 0}>◀</button>
        <button @click=${() => __privateMethod(this, _TimeTravelViewImpl_instances, goTo_fn).call(this, index + 1, rec)} .disabled=${index >= last}>▶</button>
        <button @click=${() => __privateMethod(this, _TimeTravelViewImpl_instances, goTo_fn).call(this, last, rec)} .disabled=${live} title="Jump to live">⇥</button>
        <button
          class=${classMap({ on: __privateGet(this, _highlight) })}
          .disabled=${!elementLive}
          @click=${() => __privateMethod(this, _TimeTravelViewImpl_instances, toggleHighlight_fn).call(this)}
          title="Highlight the selected element on the page"
        >⌖</button>
        <span class=${badgeCls}>${badgeTxt}</span>
        <span class="pos">${index + 1}/${rec.history.length}${snap.version != null ? ` · v${snap.version}` : ""}</span>
      </div>

      <div class="section">props @ snapshot ${index + 1}</div>
      ${Object.keys(props).length === 0 ? html`<div class="muted">—</div>` : Object.entries(props).map(
        ([k, v]) => html`<div class="kv"><span class="k">${k}:</span><span class="v">${fmt(v)}</span></div>`
      )}

      ${prev && changedKeys2.length > 0 ? html`
            <div class="section">changes vs snapshot ${index}</div>
            <div class="diff">
              ${changedKeys2.map(
        (k) => html`
                  <div class="kv changed">
                    <span class="k">${k}:</span>
                    <span class="old">${fmt(prev[k])}</span>
                    <span class="arrow">→</span>
                    <span class="new">${fmt(props[k])}</span>
                  </div>
                `
      )}
            </div>
          ` : html``}
    `;
    }
  }, _init111 = __decoratorStart(_a111), _snap = new WeakMap(), _highlight = new WeakMap(), _cleanup = new WeakMap(), _TimeTravelViewImpl_instances = new WeakSet(), /** Draw (or clear) the on-page overlay for the current selection. */
  paintHighlight_fn = function() {
    this.ctx?.highlight(__privateGet(this, _highlight) ? this.ctx.current() : void 0);
  }, /** Toggle the persistent highlight; scroll the element into view when turning on. */
  toggleHighlight_fn = function() {
    __privateSet(this, _highlight, !__privateGet(this, _highlight));
    if (__privateGet(this, _highlight)) {
      this.ctx?.current()?.elRef?.deref()?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    __privateMethod(this, _TimeTravelViewImpl_instances, paintHighlight_fn).call(this);
    this.requestUpdate();
  }, apply_fn2 = function(rec, snap) {
    const node = rec.elRef?.deref();
    if (!node || !this.ctx) return;
    this.ctx.replay(() => {
      for (const [k, v] of Object.entries(snap.props)) {
        try {
          node[k] = v;
        } catch {
        }
      }
      if (snap.styles && typeof node.setStyles === "function") {
        node.setStyles(snap.styles.map((r) => r.cssText).join("\n"));
      }
      node.flushSync?.();
    });
  }, goTo_fn = function(i, rec) {
    const last = rec.history.length - 1;
    const clamped = Math.max(0, Math.min(i, last));
    __privateSet(this, _snap, clamped >= last ? null : clamped);
    const elementLive = rec.alive && !!rec.elRef?.deref();
    if (elementLive) __privateMethod(this, _TimeTravelViewImpl_instances, apply_fn2).call(this, rec, rec.history[clamped]);
    this.requestUpdate();
    __privateMethod(this, _TimeTravelViewImpl_instances, paintHighlight_fn).call(this);
  }, __decorateElement(_init111, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init111, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`
    :host { display: block; padding: 6px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
    .travel { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
    .travel button { background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; cursor: pointer; font: inherit; padding: 1px 9px; }
    .travel button:disabled { opacity: .35; cursor: default; }
    .travel button.on { background: #3730a3; border-color: #6366f1; color: #fff; }
    .pos { color: #a1a1aa; }
    .badge { border-radius: 4px; padding: 1px 7px; font-weight: 700; font-size: 10px; letter-spacing: .04em; white-space: nowrap; }
    .badge.live { background: #14532d; color: #4ade80; border: 1px solid #166534; }
    .badge.synced { background: #1e3a5f; color: #7dd3fc; border: 1px solid #1e40af; }
    .badge.past { background: #78350f; color: #fbbf24; border: 1px solid #92400e; }
    .section { margin: 8px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
    .kv { display: flex; gap: 6px; padding: 1px 0; }
    .kv .k { color: #fbbf24; }
    .kv .v { color: #d4d4d8; word-break: break-all; }
    .diff .changed .k, .diff .added .k { color: #4ade80; }
    .diff .removed .k { color: #f87171; }
    .arrow { color: #71717a; }
    .old { color: #f87171; text-decoration: line-through; }
    .new { color: #4ade80; }
    .muted { color: #71717a; }
  `), _b;
}
function timeTravelPanel() {
  TimeTravelView ??= defineTimeTravelView();
  return componentPlugin("time-travel", "Time Travel", TimeTravelView);
}

// packages/devtools/src/styles.ts
var declList = /* @__PURE__ */ new WeakMap();
var disabledProps = /* @__PURE__ */ new WeakMap();
function authoredDecls(rule) {
  let list = declList.get(rule);
  if (!list) {
    list = [];
    const text = rule.cssText;
    const body = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
    for (const part of body.split(";")) {
      const i = part.indexOf(":");
      if (i < 0) continue;
      const prop = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (prop) list.push({ prop, value });
    }
    declList.set(rule, list);
  }
  return list;
}
function disabledOf(rule) {
  let s = disabledProps.get(rule);
  if (!s) disabledProps.set(rule, s = /* @__PURE__ */ new Set());
  return s;
}
function toggleDecl(rule, decl) {
  const dis = disabledOf(rule);
  if (dis.has(decl.prop)) {
    rule.style.setProperty(decl.prop, decl.value);
    dis.delete(decl.prop);
  } else {
    rule.style.removeProperty(decl.prop);
    dis.add(decl.prop);
  }
}
function setDecl(rule, rawProp, rawValue) {
  const prop = rawProp.trim();
  if (!prop) return;
  const list = authoredDecls(rule);
  const dis = disabledOf(rule);
  let value = rawValue.trim();
  if (!value) {
    rule.style.removeProperty(prop);
    const i = list.findIndex((d) => d.prop === prop);
    if (i >= 0) list.splice(i, 1);
    dis.delete(prop);
    return;
  }
  let priority = "";
  const bang = value.match(/!\s*important\s*$/i);
  if (bang) {
    priority = "important";
    value = value.slice(0, bang.index).trim();
  }
  rule.style.setProperty(prop, value, priority);
  dis.delete(prop);
  const display = priority ? `${value} !important` : value;
  const existing = list.find((d) => d.prop === prop);
  if (existing) existing.value = display;
  else list.push({ prop, value: display });
}
function toggleRule(rule) {
  const decls = authoredDecls(rule);
  const dis = disabledOf(rule);
  const anyOn = decls.some((d) => !dis.has(d.prop));
  for (const d of decls) {
    if (anyOn && !dis.has(d.prop)) {
      rule.style.removeProperty(d.prop);
      dis.add(d.prop);
    } else if (!anyOn && dis.has(d.prop)) {
      rule.style.setProperty(d.prop, d.value);
      dis.delete(d.prop);
    }
  }
}
function selectorApplies(host, selector) {
  const sr = host.shadowRoot;
  for (const raw of selector.split(",")) {
    const group = raw.trim();
    try {
      if (group === ":host") return true;
      const m = group.match(/^:host\((.+)\)$/);
      if (m) {
        if (host.matches(m[1])) return true;
        continue;
      }
      const inner = group.startsWith(":host ") ? group.slice(6) : group;
      if (sr?.querySelector(inner.replace(/::[\w-]+$/, ""))) return true;
    } catch {
      return true;
    }
  }
  return false;
}
function isHostRule(selector) {
  return selector.split(",").every((g) => {
    const s = g.trim();
    return s === ":host" || /^:host\([^)]*\)$/.test(s);
  });
}
function hostWinners(host, rules) {
  const won = /* @__PURE__ */ new Map();
  for (const rule of rules) {
    if (!isHostRule(rule.selectorText) || !selectorApplies(host, rule.selectorText)) continue;
    const dis = disabledOf(rule);
    for (const d of authoredDecls(rule)) if (!dis.has(d.prop)) won.set(d.prop, rule);
  }
  return won;
}
var StylesView;
function defineStylesView() {
  var _ctx_dec, _a111, _b, _init111, _highlight, _cleanup, _editing, _editingSel, _StylesViewImpl_instances, paintHighlight_fn, toggleHighlight_fn, isEditing_fn, startEdit_fn, commitEdit_fn, commitRename_fn, startSelEdit_fn, commitSelector_fn, addRule_fn, addDecl_fn, rule_fn;
  return _b = class extends (_a111 = Component("dt-styles"), _ctx_dec = [Component.prop()], _a111) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _StylesViewImpl_instances);
      __publicField(this, "ctx", __runInitializers(_init111, 8, this)), __runInitializers(_init111, 11, this);
      __privateAdd(this, _highlight, false);
      // keep the selected element outlined on the page
      __privateAdd(this, _cleanup, []);
      // The declaration field being edited inline (Chrome-style), or null. `field`
      // distinguishes renaming the property from editing its value.
      __privateAdd(this, _editing, null);
      // The rule whose SELECTOR is being edited inline, or null.
      __privateAdd(this, _editingSel, null);
    }
    onMount() {
      const ctx = this.ctx;
      if (!ctx) return;
      __privateGet(this, _cleanup).push(ctx.subscribe(() => (this.requestUpdate(), __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this))));
      __privateGet(this, _cleanup).push(ctx.onSelect(() => (this.requestUpdate(), __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this))));
      const refresh = () => __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
      this.listen(window, "scroll", refresh, { passive: true, capture: true });
      this.listen(window, "resize", refresh);
    }
    onUnmount() {
      for (const fn of __privateGet(this, _cleanup)) fn();
      __privateSet(this, _cleanup, []);
      this.ctx?.highlight(void 0);
    }
    render() {
      const ctx = this.ctx;
      if (!ctx) return html``;
      const rec = ctx.current();
      if (!rec) return html`<div class="muted">select a component in the Components tab</div>`;
      const host = rec.elRef?.deref();
      const elementLive = rec.alive && !!host;
      const sheets = host ? [...host.shadowRoot?.adoptedStyleSheets ?? []] : null;
      const toolbar = html`
      <div class="bar">
        <button
          class=${classMap({ on: __privateGet(this, _highlight) })}
          .disabled=${!elementLive}
          @click=${() => __privateMethod(this, _StylesViewImpl_instances, toggleHighlight_fn).call(this)}
          title="Highlight the selected element on the page"
        >⌖</button>
        <span class="muted">${`<${rec.tag}> #${rec.id}`}</span>
      </div>
    `;
      if (!host || !sheets) {
        const snap = rec.styles;
        return html`
        ${toolbar}
        <div class="section">styles (snapshot)</div>
        ${snap.length === 0 ? html`<div class="muted">—</div>` : snap.map(
          (s) => html`
                <div class=${s.applied ? "rule on" : "rule off"}>
                  <span class="mark">${s.applied ? "✓" : "✗"}</span><span class="sel">${s.cssText}</span>
                </div>
              `
        )}
      `;
      }
      const rules = [];
      for (const sheet of sheets) {
        for (const rule of sheet.cssRules) if (rule instanceof CSSStyleRule) rules.push(rule);
      }
      const won = hostWinners(host, rules);
      return html`
      ${toolbar}
      <div class="section">styles (${rules.length} rules)</div>
      ${rules.length === 0 ? html`<div class="muted">—</div>` : rules.map((rule) => __privateMethod(this, _StylesViewImpl_instances, rule_fn).call(this, host, rule, won))}
      <button class="newrule" @click=${() => __privateMethod(this, _StylesViewImpl_instances, addRule_fn).call(this, host)}>+ new rule</button>
    `;
    }
  }, _init111 = __decoratorStart(_a111), _highlight = new WeakMap(), _cleanup = new WeakMap(), _editing = new WeakMap(), _editingSel = new WeakMap(), _StylesViewImpl_instances = new WeakSet(), /** Draw (or clear) the on-page overlay for the current selection. */
  paintHighlight_fn = function() {
    this.ctx?.highlight(__privateGet(this, _highlight) ? this.ctx.current() : void 0);
  }, /** Toggle the persistent highlight; scroll the element into view when turning on. */
  toggleHighlight_fn = function() {
    __privateSet(this, _highlight, !__privateGet(this, _highlight));
    if (__privateGet(this, _highlight)) {
      this.ctx?.current()?.elRef?.deref()?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
    this.requestUpdate();
  }, isEditing_fn = function(rule, prop, field) {
    return __privateGet(this, _editing)?.rule === rule && __privateGet(this, _editing).prop === prop && __privateGet(this, _editing).field === field;
  }, startEdit_fn = function(rule, prop, field) {
    __privateSet(this, _editing, { rule, prop, field });
    __privateSet(this, _editingSel, null);
    this.requestUpdate();
  }, /** Commit an inline value edit (empty value removes the declaration). */
  commitEdit_fn = function(rule, prop, value) {
    setDecl(rule, prop, value);
    __privateSet(this, _editing, null);
    this.requestUpdate();
    __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
  }, /** Commit a property RENAME — move the value from `oldProp` to `newProp`
   *  (empty new name removes it). Keeps the declaration's position semantics. */
  commitRename_fn = function(rule, oldProp, newProp) {
    const value = authoredDecls(rule).find((d) => d.prop === oldProp)?.value ?? "";
    setDecl(rule, oldProp, "");
    if (newProp.trim()) setDecl(rule, newProp, value);
    __privateSet(this, _editing, null);
    this.requestUpdate();
    __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
  }, startSelEdit_fn = function(rule) {
    __privateSet(this, _editingSel, rule);
    __privateSet(this, _editing, null);
    this.requestUpdate();
  }, /** Commit a selector edit. An invalid selector is rejected (kept as-is). */
  commitSelector_fn = function(rule, text) {
    const next = text.trim();
    try {
      if (next && next !== rule.selectorText) rule.selectorText = next;
    } catch {
    }
    __privateSet(this, _editingSel, null);
    this.requestUpdate();
    __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
  }, /** Insert a fresh, empty `:host {}` rule into the element's styles (then fill it
   *  via its add-row) — like Chrome's "new style rule". Creates an adopted sheet
   *  if the element has none. */
  addRule_fn = function(host) {
    const sr = host.shadowRoot;
    if (!sr) return;
    let sheet = sr.adoptedStyleSheets[0];
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
    }
    sheet.insertRule(":host {}", sheet.cssRules.length);
    this.requestUpdate();
  }, /** Add a `prop: value` declaration typed into a rule's add-row (Chrome-style). */
  addDecl_fn = function(rule, text) {
    const i = text.indexOf(":");
    if (i < 0) return;
    setDecl(rule, text.slice(0, i), text.slice(i + 1));
    this.requestUpdate();
    __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
  }, rule_fn = function(host, rule, won) {
    const decls = authoredDecls(rule);
    const dis = disabledOf(rule);
    const matched = selectorApplies(host, rule.selectorText);
    const hostRule = isHostRule(rule.selectorText);
    const ruleOn = decls.some((d) => !dis.has(d.prop));
    return html`
      <div class=${matched ? "csshead" : "csshead dead"}>
        <input
          type="checkbox"
          class="cssck"
          .checked=${ruleOn}
          @change=${() => {
      toggleRule(rule);
      this.requestUpdate();
      __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
    }}
        />
        ${__privateGet(this, _editingSel) === rule ? html`<input
                class="editin sel"
                type="text"
                value=${rule.selectorText}
                ${ref((el2) => el2?.focus())}
                @keydown=${(e) => {
      if (e.key === "Enter") __privateMethod(this, _StylesViewImpl_instances, commitSelector_fn).call(this, rule, e.target.value);
      else if (e.key === "Escape") __privateSet(this, _editingSel, null), this.requestUpdate();
    }}
                @blur=${(e) => __privateMethod(this, _StylesViewImpl_instances, commitSelector_fn).call(this, rule, e.target.value)}
              /><span> {</span>` : html`<span class="sel" @click=${() => __privateMethod(this, _StylesViewImpl_instances, startSelEdit_fn).call(this, rule)}>${rule.selectorText}</span><span> {</span>`}
        ${matched ? html`` : html`<span class="deadtag">unused</span>`}
      </div>
      ${decls.map((decl) => {
      const on = !dis.has(decl.prop);
      const overridden = on && matched && hostRule && won.has(decl.prop) && won.get(decl.prop) !== rule;
      const editingProp = __privateMethod(this, _StylesViewImpl_instances, isEditing_fn).call(this, rule, decl.prop, "prop");
      const editingVal = __privateMethod(this, _StylesViewImpl_instances, isEditing_fn).call(this, rule, decl.prop, "value");
      return html`
          <div class=${overridden ? "decl over" : on ? "decl" : "decl off"}>
            <input
              type="checkbox"
              class="cssck"
              .checked=${on}
              @change=${() => {
        toggleDecl(rule, decl);
        this.requestUpdate();
        __privateMethod(this, _StylesViewImpl_instances, paintHighlight_fn).call(this);
      }}
            />
            ${editingProp ? html`<input
                  class="editin prop"
                  type="text"
                  value=${decl.prop}
                  ${ref((el2) => el2?.focus())}
                  @keydown=${(e) => {
        if (e.key === "Enter") __privateMethod(this, _StylesViewImpl_instances, commitRename_fn).call(this, rule, decl.prop, e.target.value);
        else if (e.key === "Escape") __privateSet(this, _editing, null), this.requestUpdate();
      }}
                  @blur=${(e) => __privateMethod(this, _StylesViewImpl_instances, commitRename_fn).call(this, rule, decl.prop, e.target.value)}
                />` : html`<span class="prop" @click=${() => __privateMethod(this, _StylesViewImpl_instances, startEdit_fn).call(this, rule, decl.prop, "prop")}>${decl.prop}</span>`}${editingVal ? html`<span>: </span><input
                    class="editin"
                    type="text"
                    value=${decl.value}
                    ${ref((el2) => el2?.focus())}
                    @keydown=${(e) => {
        if (e.key === "Enter") __privateMethod(this, _StylesViewImpl_instances, commitEdit_fn).call(this, rule, decl.prop, e.target.value);
        else if (e.key === "Escape") __privateSet(this, _editing, null), this.requestUpdate();
      }}
                    @blur=${(e) => __privateMethod(this, _StylesViewImpl_instances, commitEdit_fn).call(this, rule, decl.prop, e.target.value)}
                  /><span>;</span>` : html`<span class="val" @click=${() => __privateMethod(this, _StylesViewImpl_instances, startEdit_fn).call(this, rule, decl.prop, "value")}>: ${decl.value};</span>`}
            ${overridden ? html`<span class="overtag">overridden</span>` : html``}
          </div>
        `;
    })}
      <div class="addrow">
        <input
          type="text"
          placeholder="+ add property (e.g. color: red)"
          @keydown=${(e) => {
      if (e.key !== "Enter") return;
      const input = e.target;
      __privateMethod(this, _StylesViewImpl_instances, addDecl_fn).call(this, rule, input.value);
      input.value = "";
    }}
        />
      </div>
      <div class="cssfoot">}</div>
    `;
  }, __decorateElement(_init111, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init111, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`
    :host { display: block; padding: 6px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
    .bar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .bar button { background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; cursor: pointer; font: inherit; padding: 1px 9px; }
    .bar button:disabled { opacity: .35; cursor: default; }
    .bar button.on { background: #3730a3; border-color: #6366f1; color: #fff; }
    .section { margin: 4px 0; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
    .cssck { width: 11px; height: 11px; margin: 0 4px 0 0; vertical-align: middle; accent-color: #6366f1; cursor: pointer; }
    .csshead { display: flex; align-items: baseline; gap: 2px; margin-top: 6px; }
    .csshead .sel { color: #93c5fd; white-space: pre-wrap; word-break: break-word; }
    .csshead.dead .sel { opacity: .5; text-decoration: line-through; }
    .csshead .deadtag { margin-left: 6px; color: #f87171; font-size: 10px; }
    .decl { display: flex; align-items: baseline; gap: 2px; padding-left: 16px; cursor: pointer; }
    .decl .prop { color: #f0abfc; }
    .decl .val { color: #a5f3fc; }
    .decl.off { opacity: .45; text-decoration: line-through; }
    .decl.over { opacity: .6; }
    .decl.over .prop, .decl.over .val { text-decoration: line-through; }
    .decl .overtag { margin-left: 6px; color: #fbbf24; font-size: 10px; }
    .decl .val, .decl .prop { cursor: text; }
    .csshead .sel { cursor: text; }
    .editin { background: #18181b; color: #a5f3fc; border: 1px solid #6366f1; border-radius: 3px;
              font: inherit; padding: 0 3px; min-width: 60px; }
    .addrow { padding-left: 16px; }
    .addrow input { background: #131316; color: #f0abfc; border: 1px dashed #3a3a40; border-radius: 3px;
                    font: inherit; padding: 0 4px; width: 180px; }
    .addrow input:focus { border-color: #6366f1; outline: none; }
    .newrule { margin-top: 8px; background: #131316; color: #e4e4e7; border: 1px solid #3a3a40;
               border-radius: 4px; cursor: pointer; font: inherit; padding: 2px 10px; }
    .newrule:hover { background: #27272a; }
    .cssfoot { color: #93c5fd; }
    .rule { display: flex; gap: 6px; padding: 1px 0; align-items: baseline; }
    .rule .mark { width: 12px; flex: none; text-align: center; }
    .rule.on .mark { color: #4ade80; }
    .rule.off { opacity: .5; }
    .rule.off .mark { color: #f87171; }
    .rule.off .sel { text-decoration: line-through; }
    .muted { color: #71717a; }
  `), _b;
}
function stylesPanel() {
  StylesView ??= defineStylesView();
  return componentPlugin("styles", "Styles", StylesView);
}

// packages/devtools/src/panel.ts
function defaultPanels() {
  return [componentTreePanel(), timeTravelPanel(), stylesPanel()];
}
var CHROME_CSS = `
:host, .root { all: initial; }
.panel {
  position: fixed;
  display: flex; flex-direction: column;
  background: #1b1b1f; color: #d4d4d8;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 0 24px rgba(0,0,0,.5);
  z-index: 2147483647; overflow: hidden;
}
.panel * { box-sizing: border-box; }
.resizer { position: absolute; z-index: 1; touch-action: none; }
.resizer:hover, .resizer:active { background: #6366f1; }
.header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; background: #26262b; border-bottom: 1px solid #3a3a40;
}
.header .title { font-weight: 600; color: #fafafa; white-space: nowrap; }
.header .count { color: #8b8b94; white-space: nowrap; margin-left: auto; }
.iconbtn {
  background: #131316; color: #e4e4e7; border: 1px solid #3a3a40;
  border-radius: 4px; cursor: pointer; font: inherit; line-height: 1; padding: 3px 7px;
}
.iconbtn:hover { background: #3a3a40; }
.iconbtn.active { background: #3730a3; border-color: #6366f1; color: #fff; }
.docks { display: flex; gap: 3px; }
.settings {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px; background: #202024; border-bottom: 1px solid #3a3a40;
}
.settings .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.settings .label { color: #8b8b94; }
.settings .group {
  display: flex; flex-direction: column; gap: 4px;
  padding-top: 8px; border-top: 1px solid #2c2c33;
}
.settings .group-title { color: #8b8b94; font-weight: 600; }
.settings .toggle-row { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #d4d4d8; }
.settings .toggle-row input { margin: 0; }
.launcher {
  position: fixed; width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: #26262b; color: #fafafa; border: 1px solid #3a3a40;
  border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 1;
  box-shadow: 0 2px 12px rgba(0,0,0,.5); z-index: 2147483647;
}
.launcher:hover { background: #3730a3; }
.tabs {
  display: flex; gap: 4px; align-items: center;
  padding: 4px 8px; background: #202024; border-bottom: 1px solid #3a3a40;
}
.tab {
  background: transparent; color: #a1a1aa; border: 1px solid transparent;
  border-radius: 4px; cursor: pointer; font: inherit; padding: 2px 9px; line-height: 1.4;
}
.tab:hover { color: #e4e4e7; background: #2c2c33; }
.tab.active { color: #fff; background: #3730a3; border-color: #6366f1; }
.body { flex: 1; display: flex; min-height: 0; }
/* one container per plugin; plugins lay out their own content inside */
.view { flex: 1; min-height: 0; overflow: auto; }
`;
var HIGHLIGHT_CSS = "position:fixed;pointer-events:none;z-index:2147483646;background:rgba(99,102,241,.25);border:1px solid #6366f1;border-radius:2px;transition:all .05s ease;display:none";
var HIGHLIGHT_LABEL_CSS = "position:fixed;pointer-events:none;z-index:2147483647;display:none;background:#6366f1;color:#fff;border-radius:3px;padding:1px 6px;white-space:nowrap;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 1px 4px rgba(0,0,0,.4)";
var PREFS_KEY = "dom-devtools-prefs";
function loadPrefs() {
  const fallback = {
    dock: "bottom",
    launcher: "bottom-right",
    open: true,
    tab: "components",
    settings: {}
  };
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function savePrefs(prefs) {
  try {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
  }
}
function trapsFixed(el2) {
  const cs = getComputedStyle(el2);
  return cs.transform !== "none" || cs.perspective !== "none" || cs.filter !== "none" || /transform|perspective|filter/.test(cs.willChange || "") || /paint|layout|strict|content/.test(cs.contain || "");
}
function chainTrapsFixed(el2) {
  for (let n = el2; n && n !== document.documentElement; n = n.parentElement) {
    if (trapsFixed(n)) return true;
  }
  return false;
}
function viewportRoot(preferred) {
  if (!chainTrapsFixed(preferred)) return preferred;
  if (document.body && !chainTrapsFixed(document.body)) return document.body;
  return document.documentElement;
}
function mountDevtoolsPanel(target = document.body, options = {}) {
  const existing = document.querySelector("[data-dom-devtools]");
  if (existing) return existing;
  const prefs = { ...loadPrefs(), ...options };
  const panels = options.panels ?? defaultPanels();
  const root = viewportRoot(target);
  const host = document.createElement("div");
  host.setAttribute("data-dom-devtools", "");
  root.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  let css2 = CHROME_CSS;
  const seenStyles = /* @__PURE__ */ new Set();
  for (const p of panels) {
    if (p.styles && !seenStyles.has(p.id)) {
      seenStyles.add(p.id);
      css2 += "\n" + p.styles;
    }
  }
  style.textContent = css2;
  shadow.appendChild(style);
  const overlay = document.createElement("div");
  overlay.style.cssText = HIGHLIGHT_CSS;
  root.appendChild(overlay);
  const hlLabel = document.createElement("div");
  hlLabel.style.cssText = HIGHLIGHT_LABEL_CSS;
  root.appendChild(hlLabel);
  function hideHighlight() {
    overlay.style.display = "none";
    hlLabel.style.display = "none";
  }
  function highlight2(rec) {
    const node = rec?.elRef?.deref();
    if (!node || !node.getBoundingClientRect) {
      hideHighlight();
      return;
    }
    const r = node.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    hlLabel.textContent = `<${rec.tag}>  ${Math.round(r.width)}×${Math.round(r.height)}`;
    hlLabel.style.display = "block";
    hlLabel.style.left = `${Math.max(0, r.left)}px`;
    hlLabel.style.top = r.top >= 20 ? `${r.top - 19}px` : `${r.bottom + 3}px`;
  }
  let selectedId = null;
  const selectListeners = /* @__PURE__ */ new Set();
  const settingsStore = /* @__PURE__ */ new Map();
  const settingsListeners = /* @__PURE__ */ new Map();
  for (const p of panels) {
    for (const s of p.settings ?? []) {
      const key = `${p.id}.${s.id}`;
      settingsStore.set(key, prefs.settings[key] ?? s.default);
    }
  }
  function setSetting(pluginId, settingId, value) {
    const key = `${pluginId}.${settingId}`;
    settingsStore.set(key, value);
    prefs.settings[key] = value;
    savePrefs(prefs);
    for (const fn of settingsListeners.get(pluginId) ?? []) fn();
  }
  const shared = {
    components,
    inspect,
    subscribe,
    highlight: highlight2,
    schedulerChoices,
    replay,
    selected: () => selectedId,
    current: () => selectedId != null ? inspect(selectedId) : void 0,
    select(id) {
      selectedId = id;
      for (const fn of selectListeners) fn();
    },
    onSelect(listener) {
      selectListeners.add(listener);
      return () => selectListeners.delete(listener);
    }
  };
  function ctxFor(pluginId) {
    return {
      ...shared,
      setting: (id) => settingsStore.get(`${pluginId}.${id}`) ?? false,
      onSettingsChange(listener) {
        const set = settingsListeners.get(pluginId) ?? /* @__PURE__ */ new Set();
        set.add(listener);
        settingsListeners.set(pluginId, set);
        return () => set.delete(listener);
      }
    };
  }
  const settingsBtn = button("⚙", false, () => {
    settings.style.display = settings.style.display === "none" ? "flex" : "none";
  });
  settingsBtn.className = "iconbtn";
  settingsBtn.title = "Settings: dock, launcher corner & plugin toggles";
  const collapseBtn = button("✕", false, () => toggle(false));
  collapseBtn.className = "iconbtn";
  collapseBtn.title = "Collapse to the launcher icon";
  const launcher = button("🔧", false, () => toggle(true));
  launcher.className = "launcher";
  const DOCKS = [
    ["bottom", "↓"],
    ["top", "↑"],
    ["left", "←"],
    ["right", "→"]
  ];
  const CORNERS = [
    ["bottom-left", "↙"],
    ["bottom-right", "↘"],
    ["top-left", "↖"],
    ["top-right", "↗"]
  ];
  const settings = el("div", "settings", [coreGroup(), ...pluginGroups()].map(renderGroup));
  settings.style.display = "none";
  function renderGroup(g) {
    const rows = g.items.map((s) => {
      if ("type" in s && s.type === "select") {
        const cur = String(g.read(s.id));
        const btns = s.options.map((o) => {
          const b = button(o.label, false, () => {
            for (const x of btns) x.classList.toggle("active", x === b);
            g.write(s.id, o.value);
          });
          b.className = "iconbtn" + (o.value === cur ? " active" : "");
          if (o.title) b.title = o.title;
          return b;
        });
        return el("div", "row", [el("span", "label", `${s.label}:`), el("div", "docks", btns)]);
      }
      const cb = checkbox(g.read(s.id) === true, () => g.write(s.id, cb.checked));
      return el("label", "toggle-row", [cb, el("span", "", s.label)]);
    });
    return el("div", "group", [el("span", "group-title", g.title), ...rows]);
  }
  function coreGroup() {
    return {
      title: "DevTools",
      items: [
        { id: "dock", label: "Dock", type: "select", default: "bottom", options: DOCKS.map(([v, glyph]) => ({ value: v, label: glyph, title: `Dock ${v}` })) },
        { id: "launcher", label: "Launcher icon", type: "select", default: "bottom-right", options: CORNERS.map(([v, glyph]) => ({ value: v, label: glyph, title: `Launcher ${v}` })) }
      ],
      read: (id) => id === "dock" ? prefs.dock : prefs.launcher,
      write: (id, v) => id === "dock" ? setDock(v) : setLauncher(v)
    };
  }
  function pluginGroups() {
    return panels.filter((p) => p.settings?.length).map((p) => ({
      title: p.title,
      items: p.settings,
      read: (id) => settingsStore.get(`${p.id}.${id}`) ?? false,
      write: (id, v) => setSetting(p.id, id, v)
    }));
  }
  const tabBtns = panels.map((p) => {
    const b = button(p.title, false, () => setTab(p.id));
    b.className = "tab";
    b.dataset.tab = p.id;
    return b;
  });
  const tabsRow = el("div", "tabs", tabBtns);
  if (panels.length <= 1) tabsRow.style.display = "none";
  const views = /* @__PURE__ */ new Map();
  for (const p of panels) {
    const v = el("div", "view", []);
    v.dataset.panel = p.id;
    v.style.display = "none";
    views.set(p.id, v);
  }
  const countEl = el("span", "count", "");
  shadow.appendChild(
    el("div", "panel", [
      el("div", "header", [el("span", "title", "🔧 dom-devtools"), countEl, settingsBtn, collapseBtn]),
      settings,
      tabsRow,
      el("div", "body", [...views.values()]),
      el("div", "resizer", [])
    ])
  );
  shadow.appendChild(launcher);
  const panel = shadow.querySelector(".panel");
  const resizer = shadow.querySelector(".resizer");
  let open = prefs.open;
  let activeCleanup;
  let activeTab = "";
  function activate(p, container) {
    const pctx = ctxFor(p.id);
    const maybeCleanup = p.render(container, pctx);
    if (typeof maybeCleanup === "function") return maybeCleanup;
    const unsub = p.subscribe?.(() => p.render(container, pctx));
    return () => unsub?.();
  }
  function setTab(id) {
    if (!views.has(id)) id = panels[0].id;
    activeTab = id;
    prefs.tab = id;
    savePrefs(prefs);
    for (const b of tabBtns) b.classList.toggle("active", b.dataset.tab === id);
    for (const [pid, v] of views) v.style.display = pid === id ? "" : "none";
    activeCleanup?.();
    activeCleanup = void 0;
    if (!open) return;
    const p = panels.find((x) => x.id === id);
    activeCleanup = activate(p, views.get(id));
  }
  function applyDock() {
    const s = panel.style;
    s.left = s.right = s.top = s.bottom = s.width = s.height = s.maxWidth = "";
    s.borderRadius = s.borderTop = s.borderBottom = s.borderLeft = s.borderRight = "";
    const border = "1px solid #3a3a40";
    const px = (v) => `${v}px`;
    const horizontal = prefs.dock === "left" || prefs.dock === "right";
    const size = prefs.size != null ? px(prefs.size) : horizontal ? "460px" : "55vh";
    const rs = resizer.style;
    rs.left = rs.right = rs.top = rs.bottom = rs.width = rs.height = "";
    if (prefs.dock === "bottom") {
      s.left = s.right = s.bottom = "0";
      s.height = size;
      s.borderTop = border;
      s.borderTopLeftRadius = s.borderTopRightRadius = "8px";
      rs.left = rs.right = rs.top = "0";
      rs.height = "6px";
      rs.cursor = "ns-resize";
    } else if (prefs.dock === "top") {
      s.left = s.right = s.top = "0";
      s.height = size;
      s.borderBottom = border;
      rs.left = rs.right = rs.bottom = "0";
      rs.height = "6px";
      rs.cursor = "ns-resize";
    } else if (prefs.dock === "left") {
      s.top = s.bottom = s.left = "0";
      s.width = size;
      s.maxWidth = "95vw";
      s.borderRight = border;
      rs.top = rs.bottom = rs.right = "0";
      rs.width = "6px";
      rs.cursor = "ew-resize";
    } else {
      s.top = s.bottom = s.right = "0";
      s.width = size;
      s.maxWidth = "95vw";
      s.borderLeft = border;
      rs.top = rs.bottom = rs.left = "0";
      rs.width = "6px";
      rs.cursor = "ew-resize";
    }
  }
  resizer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const { dock } = prefs;
      const raw = dock === "bottom" ? window.innerHeight - ev.clientY : dock === "top" ? ev.clientY : dock === "right" ? window.innerWidth - ev.clientX : ev.clientX;
      const max = (dock === "left" || dock === "right" ? window.innerWidth : window.innerHeight) * 0.95;
      prefs.size = Math.max(220, Math.min(max, raw));
      applyDock();
    };
    const onUp = (ev) => {
      resizer.releasePointerCapture(ev.pointerId);
      resizer.removeEventListener("pointermove", onMove);
      resizer.removeEventListener("pointerup", onUp);
      savePrefs(prefs);
    };
    resizer.addEventListener("pointermove", onMove);
    resizer.addEventListener("pointerup", onUp);
  });
  function applyLauncher() {
    const s = launcher.style;
    s.left = s.right = s.top = s.bottom = "";
    const [v, h] = prefs.launcher.split("-");
    s[v] = "12px";
    s[h] = "12px";
  }
  function setDock(side) {
    prefs.dock = side;
    savePrefs(prefs);
    applyDock();
  }
  function setLauncher(corner) {
    prefs.launcher = corner;
    savePrefs(prefs);
    applyLauncher();
  }
  function toggle(next = !open) {
    open = next;
    prefs.open = open;
    savePrefs(prefs);
    panel.style.display = open ? "flex" : "none";
    launcher.style.display = open ? "none" : "flex";
    if (!open) {
      hideHighlight();
      activeCleanup?.();
      activeCleanup = void 0;
    } else {
      setTab(activeTab || prefs.tab);
    }
  }
  applyDock();
  applyLauncher();
  countEl.textContent = `${components().length} components`;
  subscribe(() => {
    countEl.textContent = `${components().length} components`;
  });
  const savedTab = views.has(prefs.tab) ? prefs.tab : panels[0].id;
  activeTab = savedTab;
  toggle(open);
  return host;
}

// examples/shad/devtools-setup.ts
installDevtools();

// packages/dom-ui-shad/src/lib/critical.ts
function topLevel(css2) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css2.length; i++) {
    const ch = css2[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      if (--depth === 0) {
        out.push(css2.slice(start, i + 1));
        start = i + 1;
      }
    } else if (ch === ";" && depth === 0) {
      out.push(css2.slice(start, i + 1));
      start = i + 1;
    }
  }
  const tail = css2.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}
var STOP = /* @__PURE__ */ new Set([":", ".", "#", ">", "+", "~", ",", "(", ")", "[", "]", " ", "	", "\n"]);
function selectorClasses(sel) {
  const out = [];
  for (let i = 0; i < sel.length; i++) {
    if (sel[i] !== "." || sel[i - 1] === "\\") continue;
    let name = "";
    let j = i + 1;
    while (j < sel.length) {
      const ch = sel[j];
      if (ch === "\\") {
        name += sel[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (STOP.has(ch)) break;
      name += ch;
      j++;
    }
    if (name) out.push(name);
    i = j - 1;
  }
  return out;
}
var headOf = (rule) => {
  const i = rule.indexOf("{");
  return (i === -1 ? rule : rule.slice(0, i)).trim();
};
var bodyOf = (rule) => rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));
var ALWAYS_AT = /^@(keyframes|property|font-face|page|charset|import|namespace)\b/;
var GROUP_AT = /^@(media|supports|container|layer)\b/;
function buildCriticalCss(css2) {
  const always = [];
  const rules = [];
  const media = [];
  const classify = (segments, sink) => {
    for (const rule of segments) {
      if (!rule.includes("{")) {
        sink.always.push(rule);
        continue;
      }
      const head = headOf(rule);
      if (ALWAYS_AT.test(head)) {
        sink.always.push(rule);
        continue;
      }
      const classes = selectorClasses(head);
      if (classes.length === 0) sink.always.push(rule);
      else sink.rules.push({ classes: new Set(classes), css: rule });
    }
  };
  for (const rule of topLevel(css2)) {
    const head = headOf(rule);
    if (rule.includes("{") && GROUP_AT.test(head)) {
      const block = { head, always: [], rules: [] };
      classify(topLevel(bodyOf(rule)), block);
      media.push(block);
    } else {
      classify([rule], { always, rules });
    }
  }
  const matches = (cr, used) => {
    for (const c of cr.classes) if (used.has(c)) return true;
    return false;
  };
  return (used) => {
    let out = always.join("");
    for (const cr of rules) if (matches(cr, used)) out += cr.css;
    for (const m of media) {
      let inner = m.always.join("");
      for (const cr of m.rules) if (matches(cr, used)) inner += cr.css;
      if (inner) out += `${m.head}{${inner}}`;
    }
    return out;
  };
}

// packages/dom-ui-shad/src/lib/shad.ts
var tw = new CSSStyleSheet();
function registerTailwind(cssText, opts = {}) {
  tw.replaceSync(cssText);
  const sheet = tw;
  sheet.__cssText = cssText;
  sheet.__id = sheet.__href = sheet.__critical = void 0;
  switch (opts.strategy ?? "critical") {
    case "fouc":
      sheet.__id = opts.id ?? "tw";
      break;
    case "lazy":
      if (!opts.href) throw new Error('registerTailwind: strategy "lazy" requires an `href`.');
      sheet.__href = opts.href;
      break;
    case "inline":
      break;
    // __cssText alone → full verbatim inline
    case "critical":
    default:
      sheet.__critical = buildCriticalCss(cssText);
  }
  registerProperties(cssText);
}
function tailwindProperties(cssText = tw.__cssText ?? "") {
  return (cssText.match(/@property\s+--[\w-]+\s*\{[^}]*\}/g) ?? []).join("");
}
var docPropsSheet;
function registerProperties(cssText) {
  if (typeof document === "undefined") return;
  try {
    const css2 = tailwindProperties(cssText);
    if (!css2) return;
    (docPropsSheet ??= new CSSStyleSheet()).replaceSync(css2);
    if (!document.adoptedStyleSheets.includes(docPropsSheet))
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, docPropsSheet];
  } catch {
  }
}
var base = css`
  :host {
    display: inline-block;
  }
  :host([block]) {
    display: block;
  }
`;
function cn(...inputs) {
  const out = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const key in v) if (v[key]) out.push(key);
  };
  inputs.forEach(walk);
  return out.join(" ");
}
function variants(base2, groups, defaults) {
  return (props = {}) => {
    const picked = Object.keys(groups).map((g) => {
      const key = props[g] ?? defaults[g];
      return groups[g][key];
    });
    return cn(base2, ...picked);
  };
}

// packages/dom-ui-shad/src/ui/button.ts
var buttonClass = variants(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "bg-secondary text-foreground hover:bg-accent/80",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-foreground underline-offset-4 hover:underline"
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
      icon: "h-10 w-10",
      // Compact sizes for tight contexts (e.g. inside an input group addon).
      xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
      "icon-xs": "h-6 w-6 [&_svg:not([class*='size-'])]:size-3.5"
    }
  },
  { variant: "default", size: "default" }
);
var _disabled_dec, _size_dec, _variant_dec, _a, _ShadButton_decorators, _init;
_ShadButton_decorators = [Component.define()];
var ShadButton = class extends (_a = Component("shad-button"), _variant_dec = [Component.prop({ attribute: true })], _size_dec = [Component.prop({ attribute: true })], _disabled_dec = [Component.prop({ attribute: true })], _a) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init, 8, this, "default")), __runInitializers(_init, 11, this);
    __publicField(this, "size", __runInitializers(_init, 12, this, "default")), __runInitializers(_init, 15, this);
    __publicField(this, "disabled", __runInitializers(_init, 16, this, false)), __runInitializers(_init, 19, this);
  }
  render() {
    return html`
      <button
        type="button"
        class=${buttonClass({ variant: this.variant, size: this.size })}
        .disabled=${this.disabled}
      >
        <slot></slot>
      </button>
    `;
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 5, "variant", _variant_dec, ShadButton);
__decorateElement(_init, 5, "size", _size_dec, ShadButton);
__decorateElement(_init, 5, "disabled", _disabled_dec, ShadButton);
ShadButton = __decorateElement(_init, 0, "ShadButton", _ShadButton_decorators, ShadButton);
__publicField(ShadButton, "styles", [
  tw,
  base,
  css`
      :host { display: inline-block; }
      /* Inside <shad-button-group>: flatten the joined edges and collapse the
         shared 1px border so the buttons read as one segmented control. Logical
         radii keep it correct in RTL. */
      :host-context(shad-button-group) button { border-radius: 0; }
      :host-context(shad-button-group) button:focus-visible { position: relative; z-index: 1; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:not(:first-child)) button { margin-inline-start: -1px; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:first-child) button { border-start-start-radius: 0.375rem; border-end-start-radius: 0.375rem; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:last-child) button { border-start-end-radius: 0.375rem; border-end-end-radius: 0.375rem; }
      :host-context(shad-button-group[orientation="vertical"]) button { width: 100%; }
      :host-context(shad-button-group[orientation="vertical"]):host(:not(:first-child)) button { margin-top: -1px; }
      :host-context(shad-button-group[orientation="vertical"]):host(:first-child) button { border-start-start-radius: 0.375rem; border-start-end-radius: 0.375rem; }
      :host-context(shad-button-group[orientation="vertical"]):host(:last-child) button { border-end-start-radius: 0.375rem; border-end-end-radius: 0.375rem; }
    `
]);
__runInitializers(_init, 1, ShadButton);

// packages/dom-ui-shad/src/ui/button-group.ts
var _orientation_dec, _a2, _ShadButtonGroup_decorators, _init2;
_ShadButtonGroup_decorators = [Component.define()];
var ShadButtonGroup = class extends (_a2 = Component("shad-button-group"), _orientation_dec = [Component.prop({ attribute: true })], _a2) {
  constructor() {
    super(...arguments);
    __publicField(this, "orientation", __runInitializers(_init2, 8, this, "horizontal")), __runInitializers(_init2, 11, this);
  }
  onMount() {
    this.setAttribute("role", "group");
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init2 = __decoratorStart(_a2);
__decorateElement(_init2, 5, "orientation", _orientation_dec, ShadButtonGroup);
ShadButtonGroup = __decorateElement(_init2, 0, "ShadButtonGroup", _ShadButtonGroup_decorators, ShadButtonGroup);
__publicField(ShadButtonGroup, "styles", [
  tw,
  css`
      :host { display: inline-flex; align-items: stretch; }
      :host([orientation="vertical"]) { flex-direction: column; }
    `
]);
__runInitializers(_init2, 1, ShadButtonGroup);
var _ShadButtonGroupSeparator_decorators, _init3, _a3;
_ShadButtonGroupSeparator_decorators = [Component.define()];
var ShadButtonGroupSeparator = class extends (_a3 = Component("shad-button-group-separator")) {
  // A thin divider between segments; orients with the group.
  static styles = [
    tw,
    css`
      :host { display: block; align-self: stretch; background: hsl(var(--border)); flex: none; }
      :host-context(shad-button-group:not([orientation="vertical"])) { width: 1px; }
      :host-context(shad-button-group[orientation="vertical"]) { height: 1px; }
    `
  ];
  render() {
    return html``;
  }
};
_init3 = __decoratorStart(_a3);
ShadButtonGroupSeparator = __decorateElement(_init3, 0, "ShadButtonGroupSeparator", _ShadButtonGroupSeparator_decorators, ShadButtonGroupSeparator);
__runInitializers(_init3, 1, ShadButtonGroupSeparator);
var _ShadButtonGroupText_decorators, _init4, _a4;
_ShadButtonGroupText_decorators = [Component.define()];
var ShadButtonGroupText = class extends (_a4 = Component("shad-button-group-text")) {
  // A non-interactive labelled segment (e.g. a unit / addon) styled like a button.
  static styles = [
    tw,
    css`
      :host { display: inline-flex; }
      .text { border-radius: 0; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:first-child) .text { border-start-start-radius: 0.375rem; border-end-start-radius: 0.375rem; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:last-child) .text { border-start-end-radius: 0.375rem; border-end-end-radius: 0.375rem; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:not(:first-child)) .text { margin-inline-start: -1px; }
    `
  ];
  render() {
    return html`<span
      class="text inline-flex items-center gap-2 border border-border bg-muted px-3 text-sm font-medium text-muted-foreground [&>svg]:size-4"
      ><slot></slot
    ></span>`;
  }
};
_init4 = __decoratorStart(_a4);
ShadButtonGroupText = __decorateElement(_init4, 0, "ShadButtonGroupText", _ShadButtonGroupText_decorators, ShadButtonGroupText);
__runInitializers(_init4, 1, ShadButtonGroupText);

// packages/dom-ui-shad/src/ui/badge.ts
var BASE = "badge inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none";
var _href_dec, _variant_dec2, _a5, _ShadBadge_decorators, _init5;
_ShadBadge_decorators = [Component.define()];
var ShadBadge = class extends (_a5 = Component("shad-badge"), _variant_dec2 = [Component.prop({ attribute: true })], _href_dec = [Component.prop({ attribute: true })], _a5) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init5, 8, this, "default")), __runInitializers(_init5, 11, this);
    __publicField(this, "href", __runInitializers(_init5, 12, this, "")), __runInitializers(_init5, 15, this);
  }
  render() {
    const extra = this.getAttribute("class") ?? "";
    const cls = cn(BASE, this.href && "cursor-pointer hover:underline", extra);
    return this.href ? html`<a class=${cls} data-variant=${this.variant} href=${this.href}><slot></slot></a>` : html`<span class=${cls} data-variant=${this.variant}><slot></slot></span>`;
  }
};
_init5 = __decoratorStart(_a5);
__decorateElement(_init5, 5, "variant", _variant_dec2, ShadBadge);
__decorateElement(_init5, 5, "href", _href_dec, ShadBadge);
ShadBadge = __decorateElement(_init5, 0, "ShadBadge", _ShadBadge_decorators, ShadBadge);
__publicField(ShadBadge, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      /* display:contents lets a slotted icon + text be flex items of the pill. */
      slot { display: contents; }
      ::slotted(svg) { width: 0.75rem; height: 0.75rem; }
      /* Variant colors live in @layer components — BELOW Tailwind's utilities
         layer — so forwarded utility classes (custom colors on the host) always
         win, deterministically, without a cn() tailwind-merge. */
      @layer components {
        .badge { border-color: transparent; }
        .badge[data-variant="default"] { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .badge[data-variant="default"]:hover { background: hsl(var(--primary) / 0.8); }
        .badge[data-variant="secondary"] { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
        .badge[data-variant="secondary"]:hover { background: hsl(var(--accent) / 0.8); }
        .badge[data-variant="destructive"] { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
        .badge[data-variant="destructive"]:hover { background: hsl(var(--destructive) / 0.8); }
        .badge[data-variant="outline"] { color: hsl(var(--foreground)); border-color: hsl(var(--border)); }
      }
    `
]);
__runInitializers(_init5, 1, ShadBadge);

// packages/dom-ui-shad/src/ui/breadcrumb.ts
var _separator_dec, _items_dec, _a6, _ShadBreadcrumb_decorators, _init6, _ShadBreadcrumb_instances, separator_fn;
_ShadBreadcrumb_decorators = [Component.define()];
var ShadBreadcrumb = class extends (_a6 = Component("shad-breadcrumb"), _items_dec = [Component.prop()], _separator_dec = [Component.prop({ attribute: true })], _a6) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadBreadcrumb_instances);
    __publicField(this, "items", __runInitializers(_init6, 8, this, [])), __runInitializers(_init6, 11, this);
    __publicField(this, "separator", __runInitializers(_init6, 12, this, "")), __runInitializers(_init6, 15, this);
  }
  render() {
    const last = this.items.length - 1;
    return html`
      <nav aria-label="breadcrumb">
        <ol class="flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5">
          ${map(
      this.items,
      (c, i) => html`
              <li class="inline-flex items-center gap-1.5">
                ${c.ellipsis ? html`<span class="flex items-center px-1" aria-hidden="true">…</span>` : c.href ? html`<a href=${c.href} class="transition-colors hover:text-foreground">${c.label}</a>` : html`<span class="font-normal text-foreground" aria-current="page">${c.label}</span>`}
              </li>
              ${i < last ? html`<li class="inline-flex items-center" aria-hidden="true">${__privateMethod(this, _ShadBreadcrumb_instances, separator_fn).call(this)}</li>` : ""}
            `
    )}
        </ol>
      </nav>
    `;
  }
};
_init6 = __decoratorStart(_a6);
_ShadBreadcrumb_instances = new WeakSet();
separator_fn = function() {
  return this.separator ? html`<span aria-hidden="true">${this.separator}</span>` : html`<svg class="chevron h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
};
__decorateElement(_init6, 5, "items", _items_dec, ShadBreadcrumb);
__decorateElement(_init6, 5, "separator", _separator_dec, ShadBreadcrumb);
ShadBreadcrumb = __decorateElement(_init6, 0, "ShadBreadcrumb", _ShadBreadcrumb_decorators, ShadBreadcrumb);
__publicField(ShadBreadcrumb, "styles", [
  tw,
  css`
      :host { display: block; }
      /* Chevron points the reading direction; flip it in RTL. */
      :host-context([dir="rtl"]) .chevron { transform: rotate(180deg); }
    `
]);
__runInitializers(_init6, 1, ShadBreadcrumb);

// packages/dom-ui-shad/src/ui/card.ts
var _ShadCard_decorators, _init7, _a7;
_ShadCard_decorators = [Component.define()];
var ShadCard = class extends (_a7 = Component("shad-card")) {
  static styles = [
    tw,
    css`
      :host { display: block; --card-gap: 1.5rem; }
      ::slotted([slot="image"]) { display: block; width: 100%; }
      ::slotted([slot="image"]) { object-fit: cover; }
    `
  ];
  render() {
    const has = (sel) => !!this.querySelector(sel);
    const hasTitle = has('[slot="title"]');
    const hasDesc = has('[slot="description"]');
    const hasAction = has('[slot="action"]');
    const hasHeader = hasTitle || hasDesc || hasAction;
    const hasFooter = has('[slot="footer"]');
    const hasImage = has('[slot="image"]');
    const hasContent = [...this.childNodes].some(
      (n) => n.nodeType === 1 ? !n.getAttribute("slot") : !!n.textContent?.trim()
    );
    return html`
      <div
        class=${cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm")}
        style="row-gap: var(--card-gap); padding-block: var(--card-gap)"
      >
        ${when(
      hasImage,
      () => html`<div style="margin-top: calc(var(--card-gap) * -1)"><slot name="image"></slot></div>`
    )}
        ${when(
      hasHeader,
      () => html`<div
            class=${cn("grid items-start gap-y-1.5", hasAction && "grid-cols-[1fr_auto]")}
            style="padding-inline: var(--card-gap)"
          >
            ${when(hasTitle, () => html`<div class="font-semibold leading-none tracking-tight"><slot name="title"></slot></div>`)}
            ${when(hasDesc, () => html`<div class="text-sm text-muted-foreground"><slot name="description"></slot></div>`)}
            ${when(hasAction, () => html`<div class="col-start-2 row-span-2 row-start-1 self-start justify-self-end"><slot name="action"></slot></div>`)}
          </div>`
    )}
        ${when(hasContent, () => html`<div style="padding-inline: var(--card-gap)"><slot></slot></div>`)}
        ${when(hasFooter, () => html`<div class="flex items-center" style="padding-inline: var(--card-gap)"><slot name="footer"></slot></div>`)}
      </div>
    `;
  }
};
_init7 = __decoratorStart(_a7);
ShadCard = __decorateElement(_init7, 0, "ShadCard", _ShadCard_decorators, ShadCard);
__runInitializers(_init7, 1, ShadCard);

// packages/dom-ui-shad/src/ui/carousel.ts
function autoplay(opts = {}) {
  const delay = opts.delay ?? 3e3;
  return {
    init(carousel) {
      let timer;
      const stop = () => timer !== void 0 && (clearInterval(timer), timer = void 0);
      const start = () => {
        stop();
        timer = setInterval(() => {
          if (carousel.canScrollNext()) carousel.next();
          else carousel.scrollToStart();
        }, delay);
      };
      const sig = carousel.abortSignal;
      carousel.addEventListener("mouseenter", stop, { signal: sig });
      carousel.addEventListener("mouseleave", start, { signal: sig });
      carousel.addEventListener("focusin", stop, { signal: sig });
      carousel.addEventListener("focusout", start, { signal: sig });
      sig.addEventListener("abort", stop);
      start();
    }
  };
}
var _plugins_dec, _orientation_dec2, _a8, _ShadCarousel_decorators, _init8, _ShadCarousel_instances, vp_fn, _update, scroll_fn;
_ShadCarousel_decorators = [Component.define()];
var ShadCarousel = class extends (_a8 = Component("shad-carousel"), _orientation_dec2 = [Component.prop({ attribute: true })], _plugins_dec = [Component.prop()], _a8) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadCarousel_instances);
    __publicField(this, "orientation", __runInitializers(_init8, 8, this, "horizontal")), __runInitializers(_init8, 11, this);
    __publicField(this, "plugins", __runInitializers(_init8, 12, this, [])), __runInitializers(_init8, 15, this);
    __publicField(this, "canPrev", this.signal(false));
    __publicField(this, "canNext", this.signal(true));
    __privateAdd(this, _update, () => {
      const vp = __privateMethod(this, _ShadCarousel_instances, vp_fn).call(this);
      const horiz = this.orientation !== "vertical";
      const pos = Math.abs(horiz ? vp.scrollLeft : vp.scrollTop);
      const max = horiz ? vp.scrollWidth - vp.clientWidth : vp.scrollHeight - vp.clientHeight;
      this.canPrev.set(pos > 1);
      this.canNext.set(pos < max - 1);
    });
  }
  // ── Public API (used by buttons and plugins) ──
  next() {
    __privateMethod(this, _ShadCarousel_instances, scroll_fn).call(this, 1);
  }
  prev() {
    __privateMethod(this, _ShadCarousel_instances, scroll_fn).call(this, -1);
  }
  canScrollNext() {
    return this.canNext();
  }
  canScrollPrev() {
    return this.canPrev();
  }
  scrollToStart() {
    const vp = __privateMethod(this, _ShadCarousel_instances, vp_fn).call(this);
    if (this.orientation === "vertical") vp.scrollTo({ top: 0, behavior: "smooth" });
    else vp.scrollTo({ left: 0, behavior: "smooth" });
  }
  onMount() {
    const vp = __privateMethod(this, _ShadCarousel_instances, vp_fn).call(this);
    vp.addEventListener("scroll", __privateGet(this, _update), { passive: true, signal: this.abortSignal });
    requestAnimationFrame(__privateGet(this, _update));
    for (const plugin of this.plugins) plugin.init(this);
  }
  render() {
    const vertical = this.orientation === "vertical";
    const prevPos = vertical ? "left-1/2 bottom-full mb-2 -translate-x-1/2" : "top-1/2 end-full me-2 -translate-y-1/2";
    const nextPos = vertical ? "left-1/2 top-full mt-2 -translate-x-1/2" : "top-1/2 start-full ms-2 -translate-y-1/2";
    const btn = "absolute z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-opacity hover:bg-accent disabled:pointer-events-none disabled:opacity-40";
    return html`
      <div class="relative">
        <div class="viewport"><div class="track"><slot></slot></div></div>
        <button
          class=${btn + " " + prevPos}
          aria-label="Previous slide"
          disabled=${!this.canPrev()}
          @click=${() => __privateMethod(this, _ShadCarousel_instances, scroll_fn).call(this, -1)}
        >
          <svg class="chev h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d=${vertical ? "m18 15-6-6-6 6" : "m15 18-6-6 6-6"} />
          </svg>
        </button>
        <button
          class=${btn + " " + nextPos}
          aria-label="Next slide"
          disabled=${!this.canNext()}
          @click=${() => __privateMethod(this, _ShadCarousel_instances, scroll_fn).call(this, 1)}
        >
          <svg class="chev h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d=${vertical ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6"} />
          </svg>
        </button>
      </div>
    `;
  }
};
_init8 = __decoratorStart(_a8);
_ShadCarousel_instances = new WeakSet();
vp_fn = function() {
  return this.shadowRoot.querySelector(".viewport");
};
_update = new WeakMap();
scroll_fn = function(dir) {
  const vp = __privateMethod(this, _ShadCarousel_instances, vp_fn).call(this);
  const horiz = this.orientation !== "vertical";
  const slide = this.firstElementChild;
  const gap = parseFloat(getComputedStyle(this.shadowRoot.querySelector(".track")).columnGap) || 0;
  if (horiz) {
    const rtl = getComputedStyle(this).direction === "rtl";
    vp.scrollBy({ left: dir * (rtl ? -1 : 1) * ((slide?.offsetWidth ?? vp.clientWidth) + gap), behavior: "smooth" });
  } else {
    vp.scrollBy({ top: dir * ((slide?.offsetHeight ?? vp.clientHeight) + gap), behavior: "smooth" });
  }
  this.emit("scroll", dir);
};
__decorateElement(_init8, 5, "orientation", _orientation_dec2, ShadCarousel);
__decorateElement(_init8, 5, "plugins", _plugins_dec, ShadCarousel);
ShadCarousel = __decorateElement(_init8, 0, "ShadCarousel", _ShadCarousel_decorators, ShadCarousel);
__publicField(ShadCarousel, "styles", [
  tw,
  css`
      :host { display: block; --slide-basis: 100%; --slide-gap: 1rem; --carousel-height: 14rem; }
      .viewport { overflow: hidden; }
      .track { display: flex; gap: var(--slide-gap); scroll-snap-type: x mandatory; }
      slot { display: contents; }
      ::slotted(*) { flex: 0 0 var(--slide-basis); min-width: 0; scroll-snap-align: start; }
      :host([orientation="vertical"]) .viewport { height: var(--carousel-height); }
      :host([orientation="vertical"]) .track { flex-direction: column; scroll-snap-type: y mandatory; }
      :host-context([dir="rtl"]) .chev { transform: scaleX(-1); }
    `
]);
__runInitializers(_init8, 1, ShadCarousel);

// packages/dom-ui-shad/src/ui/chart.ts
var H = 240;
var PAD_T = 8;
var PAD_B = 24;
var PAD_X = 8;
var esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
var _config_dec, _data_dec, _totals_dec, _interactive_dec, _legend_dec, _xkey_dec, _type_dec, _a9, _ShadChart_decorators, _init9, _w, _hover, _hidden, _ShadChart_instances, markup_fn, legend_fn, tooltip_fn;
_ShadChart_decorators = [Component.define()];
var ShadChart = class extends (_a9 = Component("shad-chart"), _type_dec = [Component.prop({ attribute: true })], _xkey_dec = [Component.prop({ attribute: true })], _legend_dec = [Component.prop({ attribute: true })], _interactive_dec = [Component.prop({ attribute: true })], _totals_dec = [Component.prop({ attribute: true })], _data_dec = [Component.prop()], _config_dec = [Component.prop()], _a9) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadChart_instances);
    __publicField(this, "type", __runInitializers(_init9, 8, this, "bar")), __runInitializers(_init9, 11, this);
    __publicField(this, "xkey", __runInitializers(_init9, 12, this, "")), __runInitializers(_init9, 15, this);
    __publicField(this, "legend", __runInitializers(_init9, 16, this, true)), __runInitializers(_init9, 19, this);
    __publicField(this, "interactive", __runInitializers(_init9, 20, this, false)), __runInitializers(_init9, 23, this);
    __publicField(this, "totals", __runInitializers(_init9, 24, this, false)), __runInitializers(_init9, 27, this);
    __publicField(this, "data", __runInitializers(_init9, 28, this, [])), __runInitializers(_init9, 31, this);
    __publicField(this, "config", __runInitializers(_init9, 32, this, {})), __runInitializers(_init9, 35, this);
    __privateAdd(this, _w, this.signal(0));
    __privateAdd(this, _hover, this.signal(-1));
    __privateAdd(this, _hidden, this.signal(/* @__PURE__ */ new Set()));
  }
  // series toggled off via the legend
  onMount() {
    const root = this.shadowRoot.querySelector(".chart");
    const ro = new ResizeObserver(([e]) => __privateGet(this, _w).set(Math.round(e.contentRect.width)));
    ro.observe(root);
    this.abortSignal.addEventListener("abort", () => ro.disconnect());
    root.addEventListener(
      "pointermove",
      (e) => {
        const n = this.data.length;
        const band = n ? (__privateGet(this, _w).call(this) - PAD_X * 2) / n : 0;
        const svg = root.querySelector("svg");
        if (!band || !svg) return;
        const rect = svg.getBoundingClientRect();
        __privateGet(this, _hover).set(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - rect.left - PAD_X) / band))));
      },
      { signal: this.abortSignal }
    );
    root.addEventListener("pointerleave", () => __privateGet(this, _hover).set(-1), { signal: this.abortSignal });
    root.addEventListener(
      "click",
      (e) => {
        if (!this.interactive) return;
        const item = e.target.closest("[data-series]");
        if (!item) return;
        const key = item.getAttribute("data-series");
        const next = new Set(__privateGet(this, _hidden).call(this));
        next.has(key) ? next.delete(key) : next.add(key);
        __privateGet(this, _hidden).set(next);
      },
      { signal: this.abortSignal }
    );
    this.effect(() => {
      root.innerHTML = __privateMethod(this, _ShadChart_instances, markup_fn).call(this);
    });
  }
  render() {
    return html`<div class="chart"></div>`;
  }
};
_init9 = __decoratorStart(_a9);
_w = new WeakMap();
_hover = new WeakMap();
_hidden = new WeakMap();
_ShadChart_instances = new WeakSet();
markup_fn = function() {
  const W = __privateGet(this, _w).call(this);
  if (W <= 0) return "";
  const series = Object.keys(this.config);
  const hidden = __privateGet(this, _hidden).call(this);
  const visible = series.filter((s) => !hidden.has(s));
  const n = this.data.length;
  const plotW = Math.max(0, W - PAD_X * 2);
  const plotH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...this.data.flatMap((d) => visible.map((s) => Number(d[s]) || 0)));
  const band = n ? plotW / n : 0;
  const yOf = (v) => PAD_T + plotH * (1 - v / max);
  const xc = (i) => PAD_X + band * i + band / 2;
  const baseline = PAD_T + plotH;
  const hover = __privateGet(this, _hover).call(this);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const y = PAD_T + plotH * t;
    return `<line class="grid" x1="${PAD_X}" x2="${W - PAD_X}" y1="${y}" y2="${y}"/>`;
  }).join("");
  let marks = "";
  if (this.type === "bar") {
    const groupW = band * 0.7;
    const barW = visible.length ? groupW / visible.length : 0;
    marks = this.data.map(
      (d, i) => visible.map((s, j) => {
        const y = yOf(Number(d[s]) || 0);
        const x = xc(i) - groupW / 2 + j * barW;
        return `<rect x="${x + 1}" y="${y}" width="${Math.max(0, barW - 2)}" height="${baseline - y}" rx="3" fill="${this.config[s].color}"/>`;
      }).join("")
    ).join("");
  } else {
    marks = visible.map((s) => {
      const line = "M" + this.data.map((d, i) => `${xc(i)},${yOf(Number(d[s]) || 0)}`).join(" L");
      const area = this.type === "area" ? `<path d="${line} L${xc(n - 1)},${baseline} L${xc(0)},${baseline} Z" fill="${this.config[s].color}" fill-opacity="0.15"/>` : "";
      return `${area}<path d="${line}" fill="none" stroke="${this.config[s].color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join("");
  }
  const guide = hover >= 0 ? `<line class="guide" x1="${xc(hover)}" x2="${xc(hover)}" y1="${PAD_T}" y2="${baseline}"/>` : "";
  const labels = this.data.map((d, i) => `<text class="xlabel" x="${xc(i)}" y="${H - 7}" text-anchor="middle">${esc(d[this.xkey])}</text>`).join("");
  const svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}">${grid}${guide}${marks}${labels}</svg>`;
  const tooltip = hover >= 0 && this.data[hover] && visible.length ? __privateMethod(this, _ShadChart_instances, tooltip_fn).call(this, visible, hover, xc(hover)) : "";
  const legend = this.legend ? __privateMethod(this, _ShadChart_instances, legend_fn).call(this, series, hidden) : "";
  return `<div class="plot relative" style="height:${H}px">${svg}${tooltip}</div>${legend}`;
};
legend_fn = function(series, hidden) {
  const items = series.map((s) => {
    const off = hidden.has(s);
    const total = this.totals ? ` <span class="font-mono font-semibold text-foreground">${this.data.reduce((a, d) => a + (Number(d[s]) || 0), 0)}</span>` : "";
    const inner = `<span class="h-2.5 w-2.5 rounded-[2px]" style="background:${this.config[s].color}"></span><span class="text-muted-foreground">${esc(this.config[s].label)}</span>${total}`;
    return this.interactive ? `<button type="button" data-series="${esc(s)}" class="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent${off ? " opacity-40" : ""}">${inner}</button>` : `<span class="inline-flex items-center gap-1.5 px-2 py-1 text-xs">${inner}</span>`;
  }).join("");
  return `<div class="mt-3 flex flex-wrap items-center justify-center gap-1">${items}</div>`;
};
tooltip_fn = function(series, i, x) {
  const row = this.data[i];
  const rows = series.map(
    (s) => `<div class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-[2px]" style="background:${this.config[s].color}"></span><span class="text-muted-foreground">${esc(this.config[s].label)}</span><span class="ml-auto font-mono font-medium">${esc(row[s])}</span></div>`
  ).join("");
  return `<div class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md" style="left:${x}px;top:8px"><div class="mb-1 font-medium">${esc(row[this.xkey])}</div>${rows}</div>`;
};
__decorateElement(_init9, 5, "type", _type_dec, ShadChart);
__decorateElement(_init9, 5, "xkey", _xkey_dec, ShadChart);
__decorateElement(_init9, 5, "legend", _legend_dec, ShadChart);
__decorateElement(_init9, 5, "interactive", _interactive_dec, ShadChart);
__decorateElement(_init9, 5, "totals", _totals_dec, ShadChart);
__decorateElement(_init9, 5, "data", _data_dec, ShadChart);
__decorateElement(_init9, 5, "config", _config_dec, ShadChart);
ShadChart = __decorateElement(_init9, 0, "ShadChart", _ShadChart_decorators, ShadChart);
__publicField(ShadChart, "styles", [
  tw,
  css`
      :host { display: block; }
      svg { display: block; width: 100%; }
      .grid { stroke: hsl(var(--border)); stroke-dasharray: 3 3; }
      .xlabel { fill: hsl(var(--muted-foreground)); font-size: 11px; }
      .guide { stroke: hsl(var(--border)); }
    `
]);
__runInitializers(_init9, 1, ShadChart);

// packages/dom-ui-shad/src/ui/input.ts
var _onInput_dec, _accessibleName_dec, _invalid_dec, _disabled_dec2, _value_dec, _placeholder_dec, _type_dec2, _a10, _ShadInput_decorators, _init10;
_ShadInput_decorators = [Component.define()];
var ShadInput = class extends (_a10 = Component("shad-input"), _type_dec2 = [Component.prop({ attribute: true })], _placeholder_dec = [Component.prop({ attribute: true })], _value_dec = [Component.prop({ attribute: true })], _disabled_dec2 = [Component.prop({ attribute: true })], _invalid_dec = [Component.prop({ attribute: true })], _accessibleName_dec = [Component.prop({ attribute: "aria-label" })], _onInput_dec = [Component.event()], _a10) {
  constructor() {
    super(...arguments);
    __runInitializers(_init10, 5, this);
    __publicField(this, "type", __runInitializers(_init10, 8, this, "text")), __runInitializers(_init10, 11, this);
    __publicField(this, "placeholder", __runInitializers(_init10, 12, this, "")), __runInitializers(_init10, 15, this);
    __publicField(this, "value", __runInitializers(_init10, 16, this, "")), __runInitializers(_init10, 19, this);
    __publicField(this, "disabled", __runInitializers(_init10, 20, this, false)), __runInitializers(_init10, 23, this);
    __publicField(this, "invalid", __runInitializers(_init10, 24, this, false)), __runInitializers(_init10, 27, this);
    __publicField(this, "accessibleName", __runInitializers(_init10, 28, this, "")), __runInitializers(_init10, 31, this);
  }
  onInput(e) {
    this.value = e.target.value;
    this.emit("input", this.value);
  }
  /** Delegate focus to the inner <input> so `<shad-label for>` can focus us. */
  focus(options) {
    this.shadowRoot?.querySelector("input")?.focus(options);
  }
  render() {
    return html`
      <input
        class=${cn(
      "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
      "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      this.invalid && "border-destructive focus-visible:ring-destructive"
    )}
        type=${this.type}
        placeholder=${this.placeholder}
        .value=${this.value}
        .disabled=${this.disabled}
        aria-invalid=${this.invalid ? "true" : "false"}
        aria-label=${this.accessibleName || null}
        @input=${this.onInput}
      />
    `;
  }
};
_init10 = __decoratorStart(_a10);
__decorateElement(_init10, 1, "onInput", _onInput_dec, ShadInput);
__decorateElement(_init10, 5, "type", _type_dec2, ShadInput);
__decorateElement(_init10, 5, "placeholder", _placeholder_dec, ShadInput);
__decorateElement(_init10, 5, "value", _value_dec, ShadInput);
__decorateElement(_init10, 5, "disabled", _disabled_dec2, ShadInput);
__decorateElement(_init10, 5, "invalid", _invalid_dec, ShadInput);
__decorateElement(_init10, 5, "accessibleName", _accessibleName_dec, ShadInput);
ShadInput = __decorateElement(_init10, 0, "ShadInput", _ShadInput_decorators, ShadInput);
__publicField(ShadInput, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init10, 1, ShadInput);

// packages/dom-ui-shad/src/ui/input-otp.ts
var PATTERNS = {
  digits: /[^0-9]/g,
  alphanumeric: /[^a-z0-9]/gi
};
var _groups_dec, _separator_dec2, _invalid_dec2, _disabled_dec3, _pattern_dec, _value_dec2, _maxlength_dec, _a11, _ShadInputOtp_decorators, _init11, _focused, _ShadInputOtp_instances, filterRe_fn, onInput_fn, groupSizes_fn, slot_fn;
_ShadInputOtp_decorators = [Component.define()];
var ShadInputOtp = class extends (_a11 = Component("shad-input-otp"), _maxlength_dec = [Component.prop({ attribute: true })], _value_dec2 = [Component.prop({ attribute: true })], _pattern_dec = [Component.prop({ attribute: true })], _disabled_dec3 = [Component.prop({ attribute: true })], _invalid_dec2 = [Component.prop({ attribute: true })], _separator_dec2 = [Component.prop({ attribute: true })], _groups_dec = [Component.prop()], _a11) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadInputOtp_instances);
    __publicField(this, "maxlength", __runInitializers(_init11, 8, this, 6)), __runInitializers(_init11, 11, this);
    __publicField(this, "value", __runInitializers(_init11, 12, this, "")), __runInitializers(_init11, 15, this);
    __publicField(this, "pattern", __runInitializers(_init11, 16, this, "digits")), __runInitializers(_init11, 19, this);
    __publicField(this, "disabled", __runInitializers(_init11, 20, this, false)), __runInitializers(_init11, 23, this);
    __publicField(this, "invalid", __runInitializers(_init11, 24, this, false)), __runInitializers(_init11, 27, this);
    __publicField(this, "separator", __runInitializers(_init11, 28, this, false)), __runInitializers(_init11, 31, this);
    __publicField(this, "groups", __runInitializers(_init11, 32, this, [])), __runInitializers(_init11, 35, this);
    // explicit group sizes, e.g. [3, 3]
    __privateAdd(this, _focused, this.signal(false));
  }
  onMount() {
    const input = this.shadowRoot.querySelector("input");
    if (input) input.value = this.value;
  }
  render() {
    const sizes = __privateMethod(this, _ShadInputOtp_instances, groupSizes_fn).call(this);
    let idx = 0;
    const groups = sizes.map((size) => {
      const start = idx;
      idx += size;
      return { start, size };
    });
    return html`<div
      class=${"relative flex items-center gap-2 " + (this.disabled ? "pointer-events-none opacity-50" : "")}
    >
      ${map(
      groups,
      (g, gi) => html`
          ${when(gi > 0, () => html`<div class="text-muted-foreground" aria-hidden="true">–</div>`)}
          <div data-slot="input-otp-group" class="flex items-center">
            ${map(Array.from({ length: g.size }, (_, k) => g.start + k), (i) => __privateMethod(this, _ShadInputOtp_instances, slot_fn).call(this, i))}
          </div>
        `
    )}
      <input
        data-slot="input-otp"
        class="absolute inset-0 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
        autocomplete="one-time-code"
        inputmode=${this.pattern === "alphanumeric" ? "text" : "numeric"}
        maxlength=${this.maxlength}
        .disabled=${this.disabled}
        @input=${(e) => __privateMethod(this, _ShadInputOtp_instances, onInput_fn).call(this, e)}
        @focus=${() => __privateGet(this, _focused).set(true)}
        @blur=${() => __privateGet(this, _focused).set(false)}
      />
    </div>`;
  }
};
_init11 = __decoratorStart(_a11);
_focused = new WeakMap();
_ShadInputOtp_instances = new WeakSet();
filterRe_fn = function() {
  return PATTERNS[this.pattern] ?? new RegExp(this.pattern.startsWith("[^") ? this.pattern : `[^${this.pattern}]`, "gi");
};
onInput_fn = function(e) {
  e.stopPropagation();
  const el2 = e.target;
  const clean = el2.value.replace(__privateMethod(this, _ShadInputOtp_instances, filterRe_fn).call(this), "").slice(0, this.maxlength);
  el2.value = clean;
  this.value = clean;
  this.emit("input", clean);
  if (clean.length === this.maxlength) this.emit("complete", clean);
};
// Group boundaries: explicit `groups`, else two halves when `separator`, else one.
groupSizes_fn = function() {
  if (this.groups.length) return this.groups;
  if (this.separator) {
    const half = Math.ceil(this.maxlength / 2);
    return [half, this.maxlength - half];
  }
  return [this.maxlength];
};
slot_fn = function(i) {
  const ch = this.value[i] ?? "";
  const active = __privateGet(this, _focused).call(this) && i === Math.min(this.value.length, this.maxlength - 1) && this.value.length < this.maxlength;
  const activeFilled = __privateGet(this, _focused).call(this) && i === this.value.length - 1 && this.value.length === this.maxlength;
  const on = active || activeFilled;
  return html`<div
      data-slot="input-otp-slot"
      data-active=${String(on)}
      aria-invalid=${this.invalid ? "true" : null}
      class=${"relative flex size-10 items-center justify-center border-y border-r border-input bg-background text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md " + (this.invalid ? "border-destructive " : "") + (on ? "z-10 border-ring ring-2 ring-ring/50 " + (this.invalid ? "ring-destructive/30 " : "") : "")}
    >
      ${ch}
      ${when(active && !ch, () => html`<div class="caret pointer-events-none absolute h-4 w-px bg-foreground"></div>`)}
    </div>`;
};
__decorateElement(_init11, 5, "maxlength", _maxlength_dec, ShadInputOtp);
__decorateElement(_init11, 5, "value", _value_dec2, ShadInputOtp);
__decorateElement(_init11, 5, "pattern", _pattern_dec, ShadInputOtp);
__decorateElement(_init11, 5, "disabled", _disabled_dec3, ShadInputOtp);
__decorateElement(_init11, 5, "invalid", _invalid_dec2, ShadInputOtp);
__decorateElement(_init11, 5, "separator", _separator_dec2, ShadInputOtp);
__decorateElement(_init11, 5, "groups", _groups_dec, ShadInputOtp);
ShadInputOtp = __decorateElement(_init11, 0, "ShadInputOtp", _ShadInputOtp_decorators, ShadInputOtp);
__publicField(ShadInputOtp, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      /* The caret blink shown in the active, empty slot while focused. */
      .caret { animation: otpCaret 1s steps(1) infinite; }
      @keyframes otpCaret { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
    `
]);
__runInitializers(_init11, 1, ShadInputOtp);

// packages/dom-ui-shad/src/ui/kbd.ts
var _ShadKbd_decorators, _init12, _a12;
_ShadKbd_decorators = [Component.define()];
var ShadKbd = class extends (_a12 = Component("shad-kbd")) {
  static styles = [
    tw,
    css`
      :host { display: inline-flex; vertical-align: middle; }
      slot { display: contents; }
      ::slotted(svg) { width: 0.75rem; height: 0.75rem; }
    `
  ];
  render() {
    return html`<kbd
      data-slot="kbd"
      class="pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none"
    >
      <slot></slot>
    </kbd>`;
  }
};
_init12 = __decoratorStart(_a12);
ShadKbd = __decorateElement(_init12, 0, "ShadKbd", _ShadKbd_decorators, ShadKbd);
__runInitializers(_init12, 1, ShadKbd);
var _ShadKbdGroup_decorators, _init13, _a13;
_ShadKbdGroup_decorators = [Component.define()];
var ShadKbdGroup = class extends (_a13 = Component("shad-kbd-group")) {
  static styles = [tw, css`:host { display: inline-flex; vertical-align: middle; } slot { display: contents; }`];
  render() {
    return html`<kbd data-slot="kbd-group" class="inline-flex items-center gap-1 text-muted-foreground"><slot></slot></kbd>`;
  }
};
_init13 = __decoratorStart(_a13);
ShadKbdGroup = __decorateElement(_init13, 0, "ShadKbdGroup", _ShadKbdGroup_decorators, ShadKbdGroup);
__runInitializers(_init13, 1, ShadKbdGroup);

// packages/dom-ui-shad/src/ui/item.ts
var _href_dec2, _size_dec2, _variant_dec3, _a14, _ShadItem_decorators, _init14, _ShadItem_instances, cls_fn;
_ShadItem_decorators = [Component.define()];
var ShadItem = class extends (_a14 = Component("shad-item"), _variant_dec3 = [Component.prop({ attribute: true, reflect: true })], _size_dec2 = [Component.prop({ attribute: true, reflect: true })], _href_dec2 = [Component.prop({ attribute: true })], _a14) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadItem_instances);
    __publicField(this, "variant", __runInitializers(_init14, 8, this, "default")), __runInitializers(_init14, 11, this);
    __publicField(this, "size", __runInitializers(_init14, 12, this, "default")), __runInitializers(_init14, 15, this);
    __publicField(this, "href", __runInitializers(_init14, 16, this, "")), __runInitializers(_init14, 19, this);
  }
  render() {
    const cls = __privateMethod(this, _ShadItem_instances, cls_fn).call(this);
    return this.href ? html`<a href=${this.href} data-slot="item" data-variant=${this.variant} data-size=${this.size} class=${cls}><slot></slot></a>` : html`<div data-slot="item" data-variant=${this.variant} data-size=${this.size} class=${cls}><slot></slot></div>`;
  }
};
_init14 = __decoratorStart(_a14);
_ShadItem_instances = new WeakSet();
cls_fn = function() {
  const base2 = "group/item flex w-full flex-wrap items-center gap-2.5 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  const variant = this.variant === "outline" ? " border border-border bg-background" : this.variant === "muted" ? " bg-muted/50" : " bg-background";
  const size = this.size === "xs" ? " px-2.5 py-1.5" : this.size === "sm" ? " px-3 py-2.5" : " px-4 py-3";
  const link = this.href ? " cursor-pointer hover:bg-muted" : "";
  return base2 + variant + size + link;
};
__decorateElement(_init14, 5, "variant", _variant_dec3, ShadItem);
__decorateElement(_init14, 5, "size", _size_dec2, ShadItem);
__decorateElement(_init14, 5, "href", _href_dec2, ShadItem);
ShadItem = __decorateElement(_init14, 0, "ShadItem", _ShadItem_decorators, ShadItem);
__publicField(ShadItem, "styles", [tw, css`:host { display: block; } slot { display: contents; }`]);
__runInitializers(_init14, 1, ShadItem);
var _ShadItemGroup_decorators, _init15, _a15;
_ShadItemGroup_decorators = [Component.define()];
var ShadItemGroup = class extends (_a15 = Component("shad-item-group")) {
  static styles = [tw, css`:host { display: block; width: 100%; } slot { display: contents; }`];
  render() {
    return html`<div role="list" data-slot="item-group" class="flex w-full flex-col"><slot></slot></div>`;
  }
};
_init15 = __decoratorStart(_a15);
ShadItemGroup = __decorateElement(_init15, 0, "ShadItemGroup", _ShadItemGroup_decorators, ShadItemGroup);
__runInitializers(_init15, 1, ShadItemGroup);
var _ShadItemSeparator_decorators, _init16, _a16;
_ShadItemSeparator_decorators = [Component.define()];
var ShadItemSeparator = class extends (_a16 = Component("shad-item-separator")) {
  static styles = [tw, css`:host { display: block; width: 100%; }`];
  render() {
    return html`<div role="separator" class="my-0 h-px w-full bg-border"></div>`;
  }
};
_init16 = __decoratorStart(_a16);
ShadItemSeparator = __decorateElement(_init16, 0, "ShadItemSeparator", _ShadItemSeparator_decorators, ShadItemSeparator);
__runInitializers(_init16, 1, ShadItemSeparator);
var _variant_dec4, _a17, _ShadItemMedia_decorators, _init17;
_ShadItemMedia_decorators = [Component.define()];
var ShadItemMedia = class extends (_a17 = Component("shad-item-media"), _variant_dec4 = [Component.prop({ attribute: true, reflect: true })], _a17) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init17, 8, this, "default")), __runInitializers(_init17, 11, this);
  }
  render() {
    const cls = this.variant === "icon" ? "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground" : this.variant === "image" ? "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md" : "flex shrink-0 items-center justify-center gap-2 bg-transparent";
    return html`<div data-slot="item-media" data-variant=${this.variant} class=${cls}><slot></slot></div>`;
  }
};
_init17 = __decoratorStart(_a17);
__decorateElement(_init17, 5, "variant", _variant_dec4, ShadItemMedia);
ShadItemMedia = __decorateElement(_init17, 0, "ShadItemMedia", _ShadItemMedia_decorators, ShadItemMedia);
__publicField(ShadItemMedia, "styles", [
  tw,
  css`
      :host { flex: 0 0 auto; display: block; align-self: center; }
      slot { display: contents; }
      ::slotted(svg) { width: 1.25rem; height: 1.25rem; }
      ::slotted(img) { width: 100%; height: 100%; object-fit: cover; }
    `
]);
__runInitializers(_init17, 1, ShadItemMedia);
var _ShadItemContent_decorators, _init18, _a18;
_ShadItemContent_decorators = [Component.define()];
var ShadItemContent = class extends (_a18 = Component("shad-item-content")) {
  static styles = [tw, css`:host { flex: 1 1 auto; display: block; min-width: 0; } slot { display: contents; }`];
  render() {
    return html`<div data-slot="item-content" class="flex flex-1 flex-col justify-center gap-1"><slot></slot></div>`;
  }
};
_init18 = __decoratorStart(_a18);
ShadItemContent = __decorateElement(_init18, 0, "ShadItemContent", _ShadItemContent_decorators, ShadItemContent);
__runInitializers(_init18, 1, ShadItemContent);
var _ShadItemTitle_decorators, _init19, _a19;
_ShadItemTitle_decorators = [Component.define()];
var ShadItemTitle = class extends (_a19 = Component("shad-item-title")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div data-slot="item-title" class="flex w-fit items-center gap-2 text-sm font-medium leading-snug">
      <slot></slot>
    </div>`;
  }
};
_init19 = __decoratorStart(_a19);
ShadItemTitle = __decorateElement(_init19, 0, "ShadItemTitle", _ShadItemTitle_decorators, ShadItemTitle);
__runInitializers(_init19, 1, ShadItemTitle);
var _ShadItemDescription_decorators, _init20, _a20;
_ShadItemDescription_decorators = [Component.define()];
var ShadItemDescription = class extends (_a20 = Component("shad-item-description")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<p
      data-slot="item-description"
      class="line-clamp-2 text-sm font-normal leading-normal text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary"
    >
      <slot></slot>
    </p>`;
  }
};
_init20 = __decoratorStart(_a20);
ShadItemDescription = __decorateElement(_init20, 0, "ShadItemDescription", _ShadItemDescription_decorators, ShadItemDescription);
__runInitializers(_init20, 1, ShadItemDescription);
var _ShadItemActions_decorators, _init21, _a21;
_ShadItemActions_decorators = [Component.define()];
var ShadItemActions = class extends (_a21 = Component("shad-item-actions")) {
  static styles = [tw, css`:host { flex: 0 0 auto; display: block; align-self: center; } slot { display: contents; }`];
  render() {
    return html`<div data-slot="item-actions" class="flex items-center gap-2"><slot></slot></div>`;
  }
};
_init21 = __decoratorStart(_a21);
ShadItemActions = __decorateElement(_init21, 0, "ShadItemActions", _ShadItemActions_decorators, ShadItemActions);
__runInitializers(_init21, 1, ShadItemActions);
var _ShadItemHeader_decorators, _init22, _a22;
_ShadItemHeader_decorators = [Component.define()];
var ShadItemHeader = class extends (_a22 = Component("shad-item-header")) {
  // Full-width → wraps to its own line at the top of the flex-wrap item.
  static styles = [tw, css`:host { display: block; width: 100%; order: -1; } slot { display: contents; }`];
  render() {
    return html`<div data-slot="item-header" class="flex w-full items-center justify-between gap-2"><slot></slot></div>`;
  }
};
_init22 = __decoratorStart(_a22);
ShadItemHeader = __decorateElement(_init22, 0, "ShadItemHeader", _ShadItemHeader_decorators, ShadItemHeader);
__runInitializers(_init22, 1, ShadItemHeader);
var _ShadItemFooter_decorators, _init23, _a23;
_ShadItemFooter_decorators = [Component.define()];
var ShadItemFooter = class extends (_a23 = Component("shad-item-footer")) {
  static styles = [tw, css`:host { display: block; width: 100%; order: 1; } slot { display: contents; }`];
  render() {
    return html`<div data-slot="item-footer" class="flex w-full items-center justify-between gap-2"><slot></slot></div>`;
  }
};
_init23 = __decoratorStart(_a23);
ShadItemFooter = __decorateElement(_init23, 0, "ShadItemFooter", _ShadItemFooter_decorators, ShadItemFooter);
__runInitializers(_init23, 1, ShadItemFooter);

// packages/dom-ui-shad/src/ui/input-group.ts
var _ShadInputGroup_decorators, _init24, _a24;
_ShadInputGroup_decorators = [Component.define()];
var ShadInputGroup = class extends (_a24 = Component("shad-input-group")) {
  static styles = [tw, css`:host { display: block; width: 100%; } slot { display: contents; }`];
  #block = this.signal(false);
  onMount() {
    this.#scan();
  }
  #scan() {
    const slot = this.shadowRoot.querySelector("slot");
    const block = slot.assignedElements().some(
      (el2) => el2.tagName === "SHAD-INPUT-GROUP-ADDON" && (el2.getAttribute("align") ?? "").startsWith("block")
    );
    this.#block.set(block);
  }
  render() {
    const block = this.#block();
    return html`<div
      role="group"
      data-slot="input-group"
      class=${"relative flex w-full min-w-0 rounded-lg border border-border bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 " + (block ? "h-auto flex-col items-stretch" : "h-9 items-center")}
    >
      <slot @slotchange=${() => this.#scan()}></slot>
    </div>`;
  }
};
_init24 = __decoratorStart(_a24);
ShadInputGroup = __decorateElement(_init24, 0, "ShadInputGroup", _ShadInputGroup_decorators, ShadInputGroup);
__runInitializers(_init24, 1, ShadInputGroup);
var _disabled_dec4, _type_dec3, _value_dec3, _placeholder_dec2, _a25, _ShadInputGroupInput_decorators, _init25;
_ShadInputGroupInput_decorators = [Component.define()];
var ShadInputGroupInput = class extends (_a25 = Component("shad-input-group-input"), _placeholder_dec2 = [Component.prop({ attribute: true })], _value_dec3 = [Component.prop({ attribute: true })], _type_dec3 = [Component.prop({ attribute: true })], _disabled_dec4 = [Component.prop({ attribute: true })], _a25) {
  constructor() {
    super(...arguments);
    __publicField(this, "placeholder", __runInitializers(_init25, 8, this, "")), __runInitializers(_init25, 11, this);
    __publicField(this, "value", __runInitializers(_init25, 12, this, "")), __runInitializers(_init25, 15, this);
    __publicField(this, "type", __runInitializers(_init25, 16, this, "text")), __runInitializers(_init25, 19, this);
    __publicField(this, "disabled", __runInitializers(_init25, 20, this, false)), __runInitializers(_init25, 23, this);
  }
  render() {
    return html`<input
      data-slot="input-group-control"
      class="h-9 w-full min-w-0 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      type=${this.type}
      placeholder=${this.placeholder}
      .value=${this.value}
      .disabled=${this.disabled}
    />`;
  }
};
_init25 = __decoratorStart(_a25);
__decorateElement(_init25, 5, "placeholder", _placeholder_dec2, ShadInputGroupInput);
__decorateElement(_init25, 5, "value", _value_dec3, ShadInputGroupInput);
__decorateElement(_init25, 5, "type", _type_dec3, ShadInputGroupInput);
__decorateElement(_init25, 5, "disabled", _disabled_dec4, ShadInputGroupInput);
ShadInputGroupInput = __decorateElement(_init25, 0, "ShadInputGroupInput", _ShadInputGroupInput_decorators, ShadInputGroupInput);
__publicField(ShadInputGroupInput, "styles", [tw, css`:host { flex: 1 1 0%; display: block; min-width: 0; }`]);
__runInitializers(_init25, 1, ShadInputGroupInput);
var _rows_dec, _value_dec4, _placeholder_dec3, _a26, _ShadInputGroupTextarea_decorators, _init26;
_ShadInputGroupTextarea_decorators = [Component.define()];
var ShadInputGroupTextarea = class extends (_a26 = Component("shad-input-group-textarea"), _placeholder_dec3 = [Component.prop({ attribute: true })], _value_dec4 = [Component.prop({ attribute: true })], _rows_dec = [Component.prop({ attribute: true })], _a26) {
  constructor() {
    super(...arguments);
    __publicField(this, "placeholder", __runInitializers(_init26, 8, this, "")), __runInitializers(_init26, 11, this);
    __publicField(this, "value", __runInitializers(_init26, 12, this, "")), __runInitializers(_init26, 15, this);
    __publicField(this, "rows", __runInitializers(_init26, 16, this, 3)), __runInitializers(_init26, 19, this);
  }
  render() {
    return html`<textarea
      data-slot="input-group-control"
      class="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
      rows=${this.rows}
      placeholder=${this.placeholder}
      .value=${this.value}
    ></textarea>`;
  }
};
_init26 = __decoratorStart(_a26);
__decorateElement(_init26, 5, "placeholder", _placeholder_dec3, ShadInputGroupTextarea);
__decorateElement(_init26, 5, "value", _value_dec4, ShadInputGroupTextarea);
__decorateElement(_init26, 5, "rows", _rows_dec, ShadInputGroupTextarea);
ShadInputGroupTextarea = __decorateElement(_init26, 0, "ShadInputGroupTextarea", _ShadInputGroupTextarea_decorators, ShadInputGroupTextarea);
__publicField(ShadInputGroupTextarea, "styles", [tw, css`:host { flex: 1 1 0%; display: block; min-width: 0; width: 100%; }`]);
__runInitializers(_init26, 1, ShadInputGroupTextarea);
var _align_dec, _a27, _ShadInputGroupAddon_decorators, _init27;
_ShadInputGroupAddon_decorators = [Component.define()];
var ShadInputGroupAddon = class extends (_a27 = Component("shad-input-group-addon"), _align_dec = [Component.prop({ attribute: true, reflect: true })], _a27) {
  constructor() {
    super(...arguments);
    __publicField(this, "align", __runInitializers(_init27, 8, this, "inline-start")), __runInitializers(_init27, 11, this);
  }
  render() {
    const pad3 = this.align === "inline-start" ? "pl-3" : this.align === "inline-end" ? "pr-3" : "w-full px-3 py-1.5";
    return html`<div
      role="group"
      data-slot="input-group-addon"
      class=${"flex cursor-text items-center gap-2 text-sm font-medium text-muted-foreground select-none [&>svg]:h-4 [&>svg]:w-4 " + pad3}
    >
      <slot></slot>
    </div>`;
  }
};
_init27 = __decoratorStart(_a27);
__decorateElement(_init27, 5, "align", _align_dec, ShadInputGroupAddon);
ShadInputGroupAddon = __decorateElement(_init27, 0, "ShadInputGroupAddon", _ShadInputGroupAddon_decorators, ShadInputGroupAddon);
__publicField(ShadInputGroupAddon, "styles", [
  tw,
  css`
      :host { display: flex; }
      :host([align="inline-start"]) { order: -1; }
      :host([align="inline-end"]) { order: 1; }
      :host([align="block-start"]) { order: -1; width: 100%; }
      :host([align="block-end"]) { order: 1; width: 100%; }
      slot { display: contents; }
      /* Slotted icons aren't matched by [&>svg] (they're projected); size them here. */
      ::slotted(svg) { width: 1rem; height: 1rem; }
    `
]);
__runInitializers(_init27, 1, ShadInputGroupAddon);
var _disabled_dec5, _variant_dec5, _a28, _ShadInputGroupButton_decorators, _init28;
_ShadInputGroupButton_decorators = [Component.define()];
var ShadInputGroupButton = class extends (_a28 = Component("shad-input-group-button"), _variant_dec5 = [Component.prop({ attribute: true })], _disabled_dec5 = [Component.prop({ attribute: true })], _a28) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init28, 8, this, "ghost")), __runInitializers(_init28, 11, this);
    __publicField(this, "disabled", __runInitializers(_init28, 12, this, false)), __runInitializers(_init28, 15, this);
  }
  render() {
    return html`<shad-button variant=${this.variant} size="xs" .disabled=${this.disabled}><slot></slot></shad-button>`;
  }
};
_init28 = __decoratorStart(_a28);
__decorateElement(_init28, 5, "variant", _variant_dec5, ShadInputGroupButton);
__decorateElement(_init28, 5, "disabled", _disabled_dec5, ShadInputGroupButton);
ShadInputGroupButton = __decorateElement(_init28, 0, "ShadInputGroupButton", _ShadInputGroupButton_decorators, ShadInputGroupButton);
__publicField(ShadInputGroupButton, "styles", [tw, css`:host { display: inline-flex; } ::slotted(svg) { width: 0.875rem; height: 0.875rem; }`]);
__runInitializers(_init28, 1, ShadInputGroupButton);

// packages/dom-ui-shad/src/ui/label.ts
var ACTIVATABLE = "shad-checkbox, shad-radio-group-item, shad-switch";
var _for_dec, _a29, _ShadLabel_decorators, _init29, _ShadLabel_instances, target_fn, _activate;
_ShadLabel_decorators = [Component.define()];
var ShadLabel = class extends (_a29 = Component("shad-label"), _for_dec = [Component.prop({ attribute: true })], _a29) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadLabel_instances);
    __publicField(this, "for", __runInitializers(_init29, 8, this, "")), __runInitializers(_init29, 11, this);
    __privateAdd(this, _activate, () => {
      const t = __privateMethod(this, _ShadLabel_instances, target_fn).call(this);
      if (!t) return;
      t.focus();
      if (t.matches(ACTIVATABLE)) t.click();
    });
  }
  onMount() {
    if (!this.for) return;
    queueMicrotask(() => {
      const t = __privateMethod(this, _ShadLabel_instances, target_fn).call(this);
      const name = this.textContent?.trim();
      if (t && name && !t.getAttribute("aria-label")) t.setAttribute("aria-label", name);
    });
  }
  render() {
    return html`<label
      class=${cn("contents text-sm font-medium leading-none", this.for && "cursor-pointer select-none")}
      @click=${this.for ? __privateGet(this, _activate) : null}
      ><slot></slot
    ></label>`;
  }
};
_init29 = __decoratorStart(_a29);
_ShadLabel_instances = new WeakSet();
// querySelector on getRootNode(), not document — so an id reference resolves
// inside the current shadow root (a native `for` IDREF can't cross that line).
target_fn = function() {
  if (!this.for) return null;
  return this.getRootNode().querySelector(`#${CSS.escape(this.for)}`);
};
_activate = new WeakMap();
__decorateElement(_init29, 5, "for", _for_dec, ShadLabel);
ShadLabel = __decorateElement(_init29, 0, "ShadLabel", _ShadLabel_decorators, ShadLabel);
__publicField(ShadLabel, "styles", [tw, css`:host { display: inline-block }`]);
__runInitializers(_init29, 1, ShadLabel);

// packages/dom-ui-shad/src/ui/separator.ts
var _orientation_dec3, _a30, _ShadSeparator_decorators, _init30;
_ShadSeparator_decorators = [Component.define()];
var ShadSeparator = class extends (_a30 = Component("shad-separator"), _orientation_dec3 = [Component.prop({ attribute: true, reflect: true })], _a30) {
  constructor() {
    super(...arguments);
    __publicField(this, "orientation", __runInitializers(_init30, 8, this, "horizontal")), __runInitializers(_init30, 11, this);
  }
  onMount() {
    this.setAttribute("role", "none");
  }
  render() {
    return html``;
  }
};
_init30 = __decoratorStart(_a30);
__decorateElement(_init30, 5, "orientation", _orientation_dec3, ShadSeparator);
ShadSeparator = __decorateElement(_init30, 0, "ShadSeparator", _ShadSeparator_decorators, ShadSeparator);
__publicField(ShadSeparator, "styles", [
  tw,
  css`
      :host { display: block; flex-shrink: 0; background-color: hsl(var(--border)); }
      :host(:not([orientation="vertical"])) { height: 1px; width: 100%; }
      :host([orientation="vertical"]) { width: 1px; align-self: stretch; }
    `
]);
__runInitializers(_init30, 1, ShadSeparator);

// packages/dom-ui-shad/src/ui/scroll-area.ts
var _orientation_dec4, _a31, _ShadScrollArea_decorators, _init31;
_ShadScrollArea_decorators = [Component.define()];
var ShadScrollArea = class extends (_a31 = Component("shad-scroll-area"), _orientation_dec4 = [Component.prop({ attribute: true, reflect: true })], _a31) {
  constructor() {
    super(...arguments);
    __publicField(this, "orientation", __runInitializers(_init31, 8, this, "vertical")), __runInitializers(_init31, 11, this);
  }
  render() {
    return html`<div class="viewport" tabindex="0"><slot></slot></div>`;
  }
};
_init31 = __decoratorStart(_a31);
__decorateElement(_init31, 5, "orientation", _orientation_dec4, ShadScrollArea);
ShadScrollArea = __decorateElement(_init31, 0, "ShadScrollArea", _ShadScrollArea_decorators, ShadScrollArea);
__publicField(ShadScrollArea, "styles", [
  tw,
  css`
      :host { display: block; overflow: hidden; position: relative; background: hsl(var(--background)); }
      .viewport {
        height: 100%;
        width: 100%;
        border-radius: inherit;
        scrollbar-width: thin;
        scrollbar-color: hsl(var(--border)) transparent;
      }
      :host([orientation="vertical"]) .viewport,
      :host(:not([orientation])) .viewport { overflow-x: hidden; overflow-y: auto; }
      :host([orientation="horizontal"]) .viewport { overflow-x: auto; overflow-y: hidden; }
      :host([orientation="both"]) .viewport { overflow: auto; }

      /* WebKit: a thin, rounded thumb inset from the edge (transparent track). */
      .viewport::-webkit-scrollbar { width: 10px; height: 10px; }
      .viewport::-webkit-scrollbar-track { background: transparent; }
      .viewport::-webkit-scrollbar-thumb {
        background-color: hsl(var(--border));
        border-radius: 9999px;
        border: 3px solid transparent;
        background-clip: padding-box;
      }
      .viewport::-webkit-scrollbar-thumb:hover { background-color: hsl(var(--muted-foreground) / 0.5); background-clip: padding-box; }
      .viewport::-webkit-scrollbar-corner { background: transparent; }
    `
]);
__runInitializers(_init31, 1, ShadScrollArea);

// packages/dom-ui-shad/src/ui/sidebar.ts
var SURFACE = "background: hsl(var(--sidebar));";
var _open_dec, _a32, _ShadSidebarProvider_decorators, _init32;
_ShadSidebarProvider_decorators = [Component.define()];
var ShadSidebarProvider = class extends (_a32 = Component("shad-sidebar-provider"), _open_dec = [Component.prop({ attribute: true, reflect: true })], _a32) {
  constructor() {
    super(...arguments);
    __publicField(this, "open", __runInitializers(_init32, 8, this, true)), __runInitializers(_init32, 11, this);
  }
  toggle() {
    this.open = !this.open;
  }
  onMount() {
    this.classList.add("group/sidebar");
    this.dataset.state = this.open ? "expanded" : "collapsed";
    this.addEventListener("sidebartoggle", () => this.toggle(), { signal: this.abortSignal });
    addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        this.toggle();
      }
    }, { signal: this.abortSignal });
  }
  onUpdate() {
    this.dataset.state = this.open ? "expanded" : "collapsed";
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init32 = __decoratorStart(_a32);
__decorateElement(_init32, 5, "open", _open_dec, ShadSidebarProvider);
ShadSidebarProvider = __decorateElement(_init32, 0, "ShadSidebarProvider", _ShadSidebarProvider_decorators, ShadSidebarProvider);
__publicField(ShadSidebarProvider, "styles", [
  tw,
  css`
      :host {
        display: flex;
        width: 100%;
        min-height: 100%;
        --sidebar-width: 16rem;
        --sidebar-width-icon: 3.25rem;
      }
    `
]);
__runInitializers(_init32, 1, ShadSidebarProvider);
var _ShadSidebar_decorators, _init33, _a33;
_ShadSidebar_decorators = [Component.define()];
var ShadSidebar = class extends (_a33 = Component("shad-sidebar")) {
  static styles = [
    tw,
    css`
      :host {
        display: flex;
        flex-direction: column;
        width: var(--sidebar-width);
        flex-shrink: 0;
        border-right: 1px solid hsl(var(--sidebar-border));
        ${SURFACE}
        transition: width 0.2s ease;
        overflow: hidden;
      }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { width: var(--sidebar-width-icon); }
      slot { display: contents; }
    `
  ];
  render() {
    return html`<slot></slot>`;
  }
};
_init33 = __decoratorStart(_a33);
ShadSidebar = __decorateElement(_init33, 0, "ShadSidebar", _ShadSidebar_decorators, ShadSidebar);
__runInitializers(_init33, 1, ShadSidebar);
var _ShadSidebarHeader_decorators, _init34, _a34;
_ShadSidebarHeader_decorators = [Component.define()];
var ShadSidebarHeader = class extends (_a34 = Component("shad-sidebar-header")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div class="flex flex-col gap-2 p-2"><slot></slot></div>`;
  }
};
_init34 = __decoratorStart(_a34);
ShadSidebarHeader = __decorateElement(_init34, 0, "ShadSidebarHeader", _ShadSidebarHeader_decorators, ShadSidebarHeader);
__runInitializers(_init34, 1, ShadSidebarHeader);
var _ShadSidebarFooter_decorators, _init35, _a35;
_ShadSidebarFooter_decorators = [Component.define()];
var ShadSidebarFooter = class extends (_a35 = Component("shad-sidebar-footer")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div class="mt-auto flex flex-col gap-2 p-2"><slot></slot></div>`;
  }
};
_init35 = __decoratorStart(_a35);
ShadSidebarFooter = __decorateElement(_init35, 0, "ShadSidebarFooter", _ShadSidebarFooter_decorators, ShadSidebarFooter);
__runInitializers(_init35, 1, ShadSidebarFooter);
var _ShadSidebarContent_decorators, _init36, _a36;
_ShadSidebarContent_decorators = [Component.define()];
var ShadSidebarContent = class extends (_a36 = Component("shad-sidebar-content")) {
  static styles = [tw, css`:host { display: flex; min-height: 0; flex: 1 1 0%; flex-direction: column; } slot { display: contents; }`];
  render() {
    return html`<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2"><slot></slot></div>`;
  }
};
_init36 = __decoratorStart(_a36);
ShadSidebarContent = __decorateElement(_init36, 0, "ShadSidebarContent", _ShadSidebarContent_decorators, ShadSidebarContent);
__runInitializers(_init36, 1, ShadSidebarContent);
var _ShadSidebarGroup_decorators, _init37, _a37;
_ShadSidebarGroup_decorators = [Component.define()];
var ShadSidebarGroup = class extends (_a37 = Component("shad-sidebar-group")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div class="relative flex w-full min-w-0 flex-col p-2"><slot></slot></div>`;
  }
};
_init37 = __decoratorStart(_a37);
ShadSidebarGroup = __decorateElement(_init37, 0, "ShadSidebarGroup", _ShadSidebarGroup_decorators, ShadSidebarGroup);
__runInitializers(_init37, 1, ShadSidebarGroup);
var _ShadSidebarGroupContent_decorators, _init38, _a38;
_ShadSidebarGroupContent_decorators = [Component.define()];
var ShadSidebarGroupContent = class extends (_a38 = Component("shad-sidebar-group-content")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div class="w-full text-sm"><slot></slot></div>`;
  }
};
_init38 = __decoratorStart(_a38);
ShadSidebarGroupContent = __decorateElement(_init38, 0, "ShadSidebarGroupContent", _ShadSidebarGroupContent_decorators, ShadSidebarGroupContent);
__runInitializers(_init38, 1, ShadSidebarGroupContent);
var _ShadSidebarMenu_decorators, _init39, _a39;
_ShadSidebarMenu_decorators = [Component.define()];
var ShadSidebarMenu = class extends (_a39 = Component("shad-sidebar-menu")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<ul class="flex w-full min-w-0 flex-col gap-1"><slot></slot></ul>`;
  }
};
_init39 = __decoratorStart(_a39);
ShadSidebarMenu = __decorateElement(_init39, 0, "ShadSidebarMenu", _ShadSidebarMenu_decorators, ShadSidebarMenu);
__runInitializers(_init39, 1, ShadSidebarMenu);
var _defaultOpen_dec, _a40, _ShadSidebarMenuItem_decorators, _init40;
_ShadSidebarMenuItem_decorators = [Component.define()];
var ShadSidebarMenuItem = class extends (_a40 = Component("shad-sidebar-menu-item"), _defaultOpen_dec = [Component.prop({ attribute: "default-open" })], _a40) {
  constructor() {
    super(...arguments);
    __publicField(this, "defaultOpen", __runInitializers(_init40, 8, this, false)), __runInitializers(_init40, 11, this);
  }
  onMount() {
    if (!this.querySelector("shad-sidebar-menu-sub")) return;
    this.classList.add("group/collapsible");
    this.dataset.state = this.defaultOpen ? "open" : "closed";
    this.querySelector("shad-sidebar-menu-button")?.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        this.dataset.state = this.dataset.state === "open" ? "closed" : "open";
      },
      { signal: this.abortSignal }
    );
  }
  render() {
    return html`<li class="group/menu-item relative list-none"><slot></slot></li>`;
  }
};
_init40 = __decoratorStart(_a40);
__decorateElement(_init40, 5, "defaultOpen", _defaultOpen_dec, ShadSidebarMenuItem);
ShadSidebarMenuItem = __decorateElement(_init40, 0, "ShadSidebarMenuItem", _ShadSidebarMenuItem_decorators, ShadSidebarMenuItem);
__publicField(ShadSidebarMenuItem, "styles", [tw, css`:host { display: block; position: relative; } slot { display: contents; }`]);
__runInitializers(_init40, 1, ShadSidebarMenuItem);
var _ShadSidebarMenuSub_decorators, _init41, _a41;
_ShadSidebarMenuSub_decorators = [Component.define()];
var ShadSidebarMenuSub = class extends (_a41 = Component("shad-sidebar-menu-sub")) {
  static styles = [
    tw,
    css`
      :host { display: block; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { display: none; }
      :host-context(shad-sidebar-menu-item[data-state="closed"]) { display: none; }
      slot { display: contents; }
    `
  ];
  render() {
    return html`<ul class="mx-3.5 flex min-w-0 flex-col gap-1 border-l border-border px-2.5 py-0.5"><slot></slot></ul>`;
  }
};
_init41 = __decoratorStart(_a41);
ShadSidebarMenuSub = __decorateElement(_init41, 0, "ShadSidebarMenuSub", _ShadSidebarMenuSub_decorators, ShadSidebarMenuSub);
__runInitializers(_init41, 1, ShadSidebarMenuSub);
var _ShadSidebarMenuSubItem_decorators, _init42, _a42;
_ShadSidebarMenuSubItem_decorators = [Component.define()];
var ShadSidebarMenuSubItem = class extends (_a42 = Component("shad-sidebar-menu-sub-item")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<li class="relative list-none"><slot></slot></li>`;
  }
};
_init42 = __decoratorStart(_a42);
ShadSidebarMenuSubItem = __decorateElement(_init42, 0, "ShadSidebarMenuSubItem", _ShadSidebarMenuSubItem_decorators, ShadSidebarMenuSubItem);
__runInitializers(_init42, 1, ShadSidebarMenuSubItem);
var _ShadSidebarGroupLabel_decorators, _init43, _a43;
_ShadSidebarGroupLabel_decorators = [Component.define()];
var ShadSidebarGroupLabel = class extends (_a43 = Component("shad-sidebar-group-label")) {
  static styles = [
    tw,
    css`
      :host { display: block; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { opacity: 0; }
      slot { display: contents; }
    `
  ];
  render() {
    return html`<div class="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground"><slot></slot></div>`;
  }
};
_init43 = __decoratorStart(_a43);
ShadSidebarGroupLabel = __decorateElement(_init43, 0, "ShadSidebarGroupLabel", _ShadSidebarGroupLabel_decorators, ShadSidebarGroupLabel);
__runInitializers(_init43, 1, ShadSidebarGroupLabel);
var _href_dec3, _size_dec3, _active_dec, _a44, _ShadSidebarMenuButton_decorators, _init44;
_ShadSidebarMenuButton_decorators = [Component.define()];
var ShadSidebarMenuButton = class extends (_a44 = Component("shad-sidebar-menu-button"), _active_dec = [Component.prop({ attribute: true })], _size_dec3 = [Component.prop({ attribute: true })], _href_dec3 = [Component.prop({ attribute: true })], _a44) {
  constructor() {
    super(...arguments);
    __publicField(this, "active", __runInitializers(_init44, 8, this, false)), __runInitializers(_init44, 11, this);
    __publicField(this, "size", __runInitializers(_init44, 12, this, "default")), __runInitializers(_init44, 15, this);
    __publicField(this, "href", __runInitializers(_init44, 16, this, "")), __runInitializers(_init44, 19, this);
  }
  render() {
    const cls = "btn flex w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring " + (this.size === "lg" ? "h-12" : "h-8") + (this.active ? " bg-accent font-medium text-accent-foreground" : "");
    return this.href ? html`<a href=${this.href} data-active=${String(this.active)} class=${cls}><slot></slot></a>` : html`<button type="button" data-active=${String(this.active)} class=${cls}><slot></slot></button>`;
  }
};
_init44 = __decoratorStart(_a44);
__decorateElement(_init44, 5, "active", _active_dec, ShadSidebarMenuButton);
__decorateElement(_init44, 5, "size", _size_dec3, ShadSidebarMenuButton);
__decorateElement(_init44, 5, "href", _href_dec3, ShadSidebarMenuButton);
ShadSidebarMenuButton = __decorateElement(_init44, 0, "ShadSidebarMenuButton", _ShadSidebarMenuButton_decorators, ShadSidebarMenuButton);
__publicField(ShadSidebarMenuButton, "styles", [
  tw,
  css`
      :host { display: block; }
      slot { display: contents; }
      ::slotted(svg) { width: 1rem; height: 1rem; flex-shrink: 0; }
      /* Collapsed: square icon button (the labels themselves hide via the
         group-data utility on the slotted markup — ::slotted can't be scoped by
         :host-context). */
      :host-context(shad-sidebar-provider[data-state="collapsed"]) .btn { justify-content: center; padding: 0; width: 2rem; }
    `
]);
__runInitializers(_init44, 1, ShadSidebarMenuButton);
var _href_dec4, _active_dec2, _a45, _ShadSidebarMenuSubButton_decorators, _init45;
_ShadSidebarMenuSubButton_decorators = [Component.define()];
var ShadSidebarMenuSubButton = class extends (_a45 = Component("shad-sidebar-menu-sub-button"), _active_dec2 = [Component.prop({ attribute: true })], _href_dec4 = [Component.prop({ attribute: true })], _a45) {
  constructor() {
    super(...arguments);
    __publicField(this, "active", __runInitializers(_init45, 8, this, false)), __runInitializers(_init45, 11, this);
    __publicField(this, "href", __runInitializers(_init45, 12, this, "")), __runInitializers(_init45, 15, this);
  }
  render() {
    const cls = "flex h-7 w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground " + (this.active ? "bg-accent text-accent-foreground" : "");
    return this.href ? html`<a href=${this.href} class=${cls}><slot></slot></a>` : html`<button type="button" class=${cls}><slot></slot></button>`;
  }
};
_init45 = __decoratorStart(_a45);
__decorateElement(_init45, 5, "active", _active_dec2, ShadSidebarMenuSubButton);
__decorateElement(_init45, 5, "href", _href_dec4, ShadSidebarMenuSubButton);
ShadSidebarMenuSubButton = __decorateElement(_init45, 0, "ShadSidebarMenuSubButton", _ShadSidebarMenuSubButton_decorators, ShadSidebarMenuSubButton);
__publicField(ShadSidebarMenuSubButton, "styles", [tw, css`:host { display: block; } slot { display: contents; } ::slotted(svg){width:1rem;height:1rem}`]);
__runInitializers(_init45, 1, ShadSidebarMenuSubButton);
var _ShadSidebarMenuAction_decorators, _init46, _a46;
_ShadSidebarMenuAction_decorators = [Component.define()];
var ShadSidebarMenuAction = class extends (_a46 = Component("shad-sidebar-menu-action")) {
  static styles = [
    tw,
    css`
      :host { position: absolute; right: 0.375rem; top: 0.375rem; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { display: none; }
      slot { display: contents; }
      ::slotted(svg){width:1rem;height:1rem}
    `
  ];
  render() {
    return html`<button type="button" class="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"><slot></slot></button>`;
  }
};
_init46 = __decoratorStart(_a46);
ShadSidebarMenuAction = __decorateElement(_init46, 0, "ShadSidebarMenuAction", _ShadSidebarMenuAction_decorators, ShadSidebarMenuAction);
__runInitializers(_init46, 1, ShadSidebarMenuAction);
var _ShadSidebarMenuBadge_decorators, _init47, _a47;
_ShadSidebarMenuBadge_decorators = [Component.define()];
var ShadSidebarMenuBadge = class extends (_a47 = Component("shad-sidebar-menu-badge")) {
  static styles = [
    tw,
    css`
      :host { position: absolute; right: 0.375rem; top: 50%; transform: translateY(-50%); pointer-events: none; }
      :host-context(shad-sidebar-provider[data-state="collapsed"]) { display: none; }
      slot { display: contents; }
    `
  ];
  render() {
    return html`<div class="flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-muted-foreground"><slot></slot></div>`;
  }
};
_init47 = __decoratorStart(_a47);
ShadSidebarMenuBadge = __decorateElement(_init47, 0, "ShadSidebarMenuBadge", _ShadSidebarMenuBadge_decorators, ShadSidebarMenuBadge);
__runInitializers(_init47, 1, ShadSidebarMenuBadge);
var _ShadSidebarTrigger_decorators, _init48, _a48;
_ShadSidebarTrigger_decorators = [Component.define()];
var ShadSidebarTrigger = class extends (_a48 = Component("shad-sidebar-trigger")) {
  static styles = [tw, css`:host { display: inline-flex; }`];
  render() {
    return html`<button
      type="button"
      aria-label="Toggle Sidebar"
      class="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      @click=${() => this.dispatchEvent(new CustomEvent("sidebartoggle", { bubbles: true, composed: true }))}
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>
      <span class="sr-only">Toggle Sidebar</span>
    </button>`;
  }
};
_init48 = __decoratorStart(_a48);
ShadSidebarTrigger = __decorateElement(_init48, 0, "ShadSidebarTrigger", _ShadSidebarTrigger_decorators, ShadSidebarTrigger);
__runInitializers(_init48, 1, ShadSidebarTrigger);
var _ShadSidebarRail_decorators, _init49, _a49;
_ShadSidebarRail_decorators = [Component.define()];
var ShadSidebarRail = class extends (_a49 = Component("shad-sidebar-rail")) {
  static styles = [
    tw,
    css`
      :host { position: absolute; inset-block: 0; right: -0.5rem; width: 1rem; cursor: w-resize; z-index: 20; }
      :host(:hover) .bar { background: hsl(var(--border)); }
      .bar { position: absolute; inset-block: 0; left: 50%; width: 2px; transform: translateX(-50%); transition: background 0.15s; }
    `
  ];
  render() {
    return html`<button type="button" aria-label="Toggle Sidebar" tabindex="-1" class="h-full w-full" @click=${() => this.dispatchEvent(new CustomEvent("sidebartoggle", { bubbles: true, composed: true }))}><span class="bar"></span></button>`;
  }
};
_init49 = __decoratorStart(_a49);
ShadSidebarRail = __decorateElement(_init49, 0, "ShadSidebarRail", _ShadSidebarRail_decorators, ShadSidebarRail);
__runInitializers(_init49, 1, ShadSidebarRail);
var _ShadSidebarInset_decorators, _init50, _a50;
_ShadSidebarInset_decorators = [Component.define()];
var ShadSidebarInset = class extends (_a50 = Component("shad-sidebar-inset")) {
  static styles = [tw, css`:host { display: flex; min-width: 0; flex: 1 1 0%; flex-direction: column; background: hsl(var(--background)); } slot { display: contents; }`];
  render() {
    return html`<div class="flex min-h-0 flex-1 flex-col"><slot></slot></div>`;
  }
};
_init50 = __decoratorStart(_a50);
ShadSidebarInset = __decorateElement(_init50, 0, "ShadSidebarInset", _ShadSidebarInset_decorators, ShadSidebarInset);
__runInitializers(_init50, 1, ShadSidebarInset);

// packages/dom-ui-shad/src/ui/skeleton.ts
var _ShadSkeleton_decorators, _init51, _a51;
_ShadSkeleton_decorators = [Component.define()];
var ShadSkeleton = class extends (_a51 = Component("shad-skeleton")) {
  static styles = [tw, css`:host { display: block; border-radius: 0.375rem; }`];
  render() {
    return html`<div class="h-full w-full animate-pulse rounded-[inherit] bg-muted"></div>`;
  }
};
_init51 = __decoratorStart(_a51);
ShadSkeleton = __decorateElement(_init51, 0, "ShadSkeleton", _ShadSkeleton_decorators, ShadSkeleton);
__runInitializers(_init51, 1, ShadSkeleton);

// packages/dom-ui-shad/src/ui/slider.ts
var _disabled_dec6, _orientation_dec5, _step_dec, _max_dec, _min_dec, _value_dec5, _a52, _ShadSlider_decorators, _init52, _ShadSlider_instances, vertical_fn, rtl_fn, pct_fn, setThumb_fn, fromPointer_fn, startDrag_fn, onTrack_fn, onKey_fn;
_ShadSlider_decorators = [Component.define()];
var ShadSlider = class extends (_a52 = Component("shad-slider"), _value_dec5 = [Component.prop()], _min_dec = [Component.prop({ attribute: true })], _max_dec = [Component.prop({ attribute: true })], _step_dec = [Component.prop({ attribute: true })], _orientation_dec5 = [Component.prop({ attribute: true })], _disabled_dec6 = [Component.prop({ attribute: true })], _a52) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadSlider_instances);
    __publicField(this, "value", __runInitializers(_init52, 8, this, [50])), __runInitializers(_init52, 11, this);
    __publicField(this, "min", __runInitializers(_init52, 12, this, 0)), __runInitializers(_init52, 15, this);
    __publicField(this, "max", __runInitializers(_init52, 16, this, 100)), __runInitializers(_init52, 19, this);
    __publicField(this, "step", __runInitializers(_init52, 20, this, 1)), __runInitializers(_init52, 23, this);
    __publicField(this, "orientation", __runInitializers(_init52, 24, this, "horizontal")), __runInitializers(_init52, 27, this);
    __publicField(this, "disabled", __runInitializers(_init52, 28, this, false)), __runInitializers(_init52, 31, this);
  }
  onMount() {
    this.addEventListener("keydown", (e) => __privateMethod(this, _ShadSlider_instances, onKey_fn).call(this, e), { signal: this.abortSignal });
  }
  render() {
    const vertical = __privateMethod(this, _ShadSlider_instances, vertical_fn).call(this);
    const rtl = __privateMethod(this, _ShadSlider_instances, rtl_fn).call(this);
    const pcts = this.value.map((v) => __privateMethod(this, _ShadSlider_instances, pct_fn).call(this, v));
    const rangeStart = this.value.length === 1 ? 0 : Math.min(...pcts);
    const rangeEnd = Math.max(...pcts);
    const startEdge = vertical ? "bottom" : rtl ? "right" : "left";
    const endEdge = vertical ? "top" : rtl ? "left" : "right";
    const rangeStyle = `${startEdge}:${rangeStart}%;${endEdge}:${100 - rangeEnd}%`;
    return html`<span
      data-orientation=${this.orientation}
      data-disabled=${this.disabled ? "" : null}
      class=${"relative flex touch-none select-none items-center " + (vertical ? "h-full min-h-40 flex-col" : "w-full")}
    >
      <span
        data-track
        class=${"relative grow overflow-hidden rounded-full bg-muted " + (vertical ? "h-full w-1.5" : "h-1.5 w-full")}
        @pointerdown=${(e) => __privateMethod(this, _ShadSlider_instances, onTrack_fn).call(this, e)}
      >
        <span class=${"absolute bg-primary " + (vertical ? "w-full" : "h-full")} style=${rangeStyle}></span>
      </span>
      ${map(this.value, (_, i) => {
      const pos = `${pcts[i]}%`;
      const style = vertical ? `bottom:${pos};transform:translateY(50%)` : `${rtl ? "right" : "left"}:${pos};transform:translateX(${rtl ? "50%" : "-50%"})`;
      return html`<span
          role="slider"
          data-thumb=${String(i)}
          tabindex=${this.disabled ? "-1" : "0"}
          aria-valuemin=${String(this.min)}
          aria-valuemax=${String(this.max)}
          aria-valuenow=${String(this.value[i])}
          aria-orientation=${this.orientation}
          class="absolute block size-4 shrink-0 cursor-grab rounded-full border border-primary bg-background outline-none transition-colors hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/40 active:cursor-grabbing"
          style=${style}
          @pointerdown=${(e) => __privateMethod(this, _ShadSlider_instances, startDrag_fn).call(this, i, e)}
        ></span>`;
    })}
    </span>`;
  }
};
_init52 = __decoratorStart(_a52);
_ShadSlider_instances = new WeakSet();
vertical_fn = function() {
  return this.orientation === "vertical";
};
rtl_fn = function() {
  return !__privateMethod(this, _ShadSlider_instances, vertical_fn).call(this) && getComputedStyle(this).direction === "rtl";
};
pct_fn = function(v) {
  return (v - this.min) / (this.max - this.min) * 100;
};
setThumb_fn = function(i, raw) {
  let v = Math.round((raw - this.min) / this.step) * this.step + this.min;
  v = Math.max(this.min, Math.min(this.max, v));
  const lo = i > 0 ? this.value[i - 1] : this.min;
  const hi = i < this.value.length - 1 ? this.value[i + 1] : this.max;
  v = Math.max(lo, Math.min(hi, v));
  if (v === this.value[i]) return;
  const next = [...this.value];
  next[i] = v;
  this.value = next;
  this.emit("change", next);
};
fromPointer_fn = function(e) {
  const track = this.shadowRoot.querySelector("[data-track]").getBoundingClientRect();
  let frac = __privateMethod(this, _ShadSlider_instances, vertical_fn).call(this) ? 1 - (e.clientY - track.top) / track.height : (e.clientX - track.left) / track.width;
  if (__privateMethod(this, _ShadSlider_instances, rtl_fn).call(this)) frac = 1 - frac;
  frac = Math.max(0, Math.min(1, frac));
  return this.min + frac * (this.max - this.min);
};
startDrag_fn = function(i, e) {
  if (this.disabled) return;
  e.preventDefault();
  const move = (ev) => __privateMethod(this, _ShadSlider_instances, setThumb_fn).call(this, i, __privateMethod(this, _ShadSlider_instances, fromPointer_fn).call(this, ev));
  const up = () => document.removeEventListener("pointermove", move);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up, { once: true });
};
onTrack_fn = function(e) {
  if (this.disabled) return;
  const v = __privateMethod(this, _ShadSlider_instances, fromPointer_fn).call(this, e);
  let nearest = 0, best = Infinity;
  this.value.forEach((tv, i) => {
    const d = Math.abs(tv - v);
    if (d < best) best = d, nearest = i;
  });
  __privateMethod(this, _ShadSlider_instances, setThumb_fn).call(this, nearest, v);
  __privateMethod(this, _ShadSlider_instances, startDrag_fn).call(this, nearest, e);
};
onKey_fn = function(e) {
  if (this.disabled) return;
  const thumb = e.composedPath().find((n) => n?.dataset?.thumb != null);
  if (!thumb) return;
  const i = Number(thumb.dataset.thumb);
  const dec = __privateMethod(this, _ShadSlider_instances, vertical_fn).call(this) ? "ArrowDown" : __privateMethod(this, _ShadSlider_instances, rtl_fn).call(this) ? "ArrowRight" : "ArrowLeft";
  const inc = __privateMethod(this, _ShadSlider_instances, vertical_fn).call(this) ? "ArrowUp" : __privateMethod(this, _ShadSlider_instances, rtl_fn).call(this) ? "ArrowLeft" : "ArrowRight";
  if (e.key !== inc && e.key !== dec) return;
  e.preventDefault();
  __privateMethod(this, _ShadSlider_instances, setThumb_fn).call(this, i, this.value[i] + (e.key === inc ? this.step : -this.step));
  requestAnimationFrame(() => this.shadowRoot.querySelectorAll("[data-thumb]")[i]?.focus());
};
__decorateElement(_init52, 5, "value", _value_dec5, ShadSlider);
__decorateElement(_init52, 5, "min", _min_dec, ShadSlider);
__decorateElement(_init52, 5, "max", _max_dec, ShadSlider);
__decorateElement(_init52, 5, "step", _step_dec, ShadSlider);
__decorateElement(_init52, 5, "orientation", _orientation_dec5, ShadSlider);
__decorateElement(_init52, 5, "disabled", _disabled_dec6, ShadSlider);
ShadSlider = __decorateElement(_init52, 0, "ShadSlider", _ShadSlider_decorators, ShadSlider);
__publicField(ShadSlider, "styles", [
  tw,
  css`
      :host { display: block; }
      :host([orientation="vertical"]) { height: 100%; min-height: 10rem; width: auto; }
      [data-disabled] { opacity: 0.5; pointer-events: none; }
    `
]);
__runInitializers(_init52, 1, ShadSlider);

// packages/dom-ui-shad/src/ui/spinner.ts
var _ShadSpinner_decorators, _init53, _a53;
_ShadSpinner_decorators = [Component.define()];
var ShadSpinner = class extends (_a53 = Component("shad-spinner")) {
  static styles = [tw, css`:host { display: inline-flex; width: 1rem; height: 1rem; }`];
  render() {
    return html`<svg
      class="h-full w-full animate-spin"
      role="status"
      aria-label="Loading"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>`;
  }
};
_init53 = __decoratorStart(_a53);
ShadSpinner = __decorateElement(_init53, 0, "ShadSpinner", _ShadSpinner_decorators, ShadSpinner);
__runInitializers(_init53, 1, ShadSpinner);

// packages/dom-ui-shad/src/ui/toast.ts
var _id = 0;
function emit(message, opts = {}) {
  const id = ++_id;
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("shad-toast", { detail: { id, message, ...opts } }));
  }
  return id;
}
var toast = Object.assign((m, o) => emit(m, o), {
  success: (m, o) => emit(m, { ...o, type: "success" }),
  error: (m, o) => emit(m, { ...o, type: "error" }),
  warning: (m, o) => emit(m, { ...o, type: "warning" }),
  info: (m, o) => emit(m, { ...o, type: "info" }),
  loading: (m, o) => emit(m, { ...o, type: "loading" }),
  message: (m, o) => emit(m, o),
  dismiss: (id) => typeof document !== "undefined" && document.dispatchEvent(new CustomEvent("shad-toast-dismiss", { detail: { id } }))
});
var ICONS = {
  success: html`<svg class="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>`,
  error: html`<svg class="h-4 w-4 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>`,
  warning: html`<svg class="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>`,
  info: html`<svg class="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>`,
  loading: html`<svg class="h-4 w-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>`
};
var _position_dec, _a54, _ShadToaster_decorators, _init54, _toasts, _timers, _ShadToaster_instances, add_fn, arm_fn, dismiss_fn, card_fn;
_ShadToaster_decorators = [Component.define()];
var ShadToaster = class extends (_a54 = Component("shad-toaster"), _position_dec = [Component.prop({ attribute: true, reflect: true })], _a54) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadToaster_instances);
    __publicField(this, "position", __runInitializers(_init54, 8, this, "bottom-right")), __runInitializers(_init54, 11, this);
    __privateAdd(this, _toasts, this.signal([]));
    __privateAdd(this, _timers, /* @__PURE__ */ new Map());
  }
  onMount() {
    document.addEventListener("shad-toast", (e) => __privateMethod(this, _ShadToaster_instances, add_fn).call(this, e.detail), { signal: this.abortSignal });
    document.addEventListener("shad-toast-dismiss", (e) => {
      const id = e.detail?.id;
      if (id == null) __privateGet(this, _toasts).set([]);
      else __privateMethod(this, _ShadToaster_instances, dismiss_fn).call(this, id);
    }, { signal: this.abortSignal });
  }
  render() {
    const groups = /* @__PURE__ */ new Map();
    for (const t of __privateGet(this, _toasts).call(this)) {
      const pos = t.position || this.position || "bottom-right";
      (groups.get(pos) ?? groups.set(pos, []).get(pos)).push(t);
    }
    return html`${map(
      [...groups.entries()],
      ([pos, list]) => {
        const [y, x] = pos.split("-");
        return html`<div class="region" data-y=${y} data-x=${x} style=${`--enter:${y === "top" ? "-1rem" : "1rem"}`}>
          ${map(list, (t) => __privateMethod(this, _ShadToaster_instances, card_fn).call(this, t))}
        </div>`;
      }
    )}`;
  }
};
_init54 = __decoratorStart(_a54);
_toasts = new WeakMap();
_timers = new WeakMap();
_ShadToaster_instances = new WeakSet();
add_fn = function(t) {
  __privateGet(this, _toasts).set([...__privateGet(this, _toasts).call(this), t]);
  if (t.type !== "loading") __privateMethod(this, _ShadToaster_instances, arm_fn).call(this, t.id, t.duration ?? 4e3);
};
arm_fn = function(id, ms) {
  clearTimeout(__privateGet(this, _timers).get(id));
  __privateGet(this, _timers).set(id, setTimeout(() => __privateMethod(this, _ShadToaster_instances, dismiss_fn).call(this, id), ms));
};
dismiss_fn = function(id) {
  clearTimeout(__privateGet(this, _timers).get(id));
  __privateGet(this, _timers).delete(id);
  __privateGet(this, _toasts).set(__privateGet(this, _toasts).call(this).filter((t) => t.id !== id));
};
card_fn = function(t) {
  const icon = t.type && t.type !== "default" ? ICONS[t.type] : null;
  return html`<div
      role="status"
      class="toast flex w-[356px] max-w-[calc(100vw-2rem)] items-start gap-2.5 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
      @pointerenter=${() => clearTimeout(__privateGet(this, _timers).get(t.id))}
      @pointerleave=${() => t.type !== "loading" && __privateMethod(this, _ShadToaster_instances, arm_fn).call(this, t.id, t.duration ?? 4e3)}
    >
      ${when(icon, () => html`<span class="mt-0.5 shrink-0">${icon}</span>`)}
      <div class="flex-1">
        <div class="font-medium leading-tight">${t.message}</div>
        ${when(t.description, () => html`<div class="mt-1 text-sm text-muted-foreground">${t.description}</div>`)}
      </div>
      ${when(
    t.action,
    () => html`<button
          class="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          @click=${() => {
      t.action.onClick();
      __privateMethod(this, _ShadToaster_instances, dismiss_fn).call(this, t.id);
    }}
        >${t.action.label}</button>`
  )}
      <button
        aria-label="Close"
        class="shrink-0 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
        @click=${() => __privateMethod(this, _ShadToaster_instances, dismiss_fn).call(this, t.id)}
      ><svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
    </div>`;
};
__decorateElement(_init54, 5, "position", _position_dec, ShadToaster);
ShadToaster = __decorateElement(_init54, 0, "ShadToaster", _ShadToaster_decorators, ShadToaster);
__publicField(ShadToaster, "styles", [
  tw,
  css`
      :host { display: contents; }
      /* One fixed region per active position; toasts group into their own region. */
      .region { position: fixed; z-index: 100; display: flex; flex-direction: column; gap: 0.75rem; pointer-events: none; }
      .region[data-y="top"] { top: 1.5rem; }
      .region[data-y="bottom"] { bottom: 1.5rem; flex-direction: column-reverse; }
      .region[data-x="right"] { right: 1.5rem; align-items: flex-end; }
      .region[data-x="left"] { left: 1.5rem; align-items: flex-start; }
      .region[data-x="center"] { left: 50%; transform: translateX(-50%); align-items: center; }
      .toast { pointer-events: auto; animation: toastIn 0.2s cubic-bezier(0.21, 1.02, 0.73, 1); }
      @keyframes toastIn { from { opacity: 0; transform: translateY(var(--enter, 1rem)) scale(0.96); } }
    `
]);
__runInitializers(_init54, 1, ShadToaster);

// packages/dom-ui-shad/src/ui/avatar.ts
var SIZES = {
  sm: "h-8 w-8 text-xs",
  default: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base"
};
var _onError_dec, _failed_dec, _size_dec4, _alt_dec, _src_dec, _a55, _ShadAvatar_decorators, _init55;
_ShadAvatar_decorators = [Component.define()];
var ShadAvatar = class extends (_a55 = Component("shad-avatar"), _src_dec = [Component.prop({ attribute: true })], _alt_dec = [Component.prop({ attribute: true })], _size_dec4 = [Component.prop({ attribute: true })], _failed_dec = [Component.prop()], _onError_dec = [Component.event()], _a55) {
  constructor() {
    super(...arguments);
    __runInitializers(_init55, 5, this);
    __publicField(this, "src", __runInitializers(_init55, 8, this, "")), __runInitializers(_init55, 11, this);
    __publicField(this, "alt", __runInitializers(_init55, 12, this, "")), __runInitializers(_init55, 15, this);
    __publicField(this, "size", __runInitializers(_init55, 16, this, "default")), __runInitializers(_init55, 19, this);
    __publicField(this, "failed", __runInitializers(_init55, 20, this, false)), __runInitializers(_init55, 23, this);
  }
  onError() {
    this.failed = true;
  }
  render() {
    const sz = SIZES[this.size] ?? SIZES.default;
    const hasBadge = !!this.querySelector('[slot="badge"]');
    return html`
      <span class=${cn("relative inline-flex shrink-0", sz)}>
        <span class="flex h-full w-full overflow-hidden rounded-full bg-secondary">
          ${when(
      this.src && !this.failed,
      () => html`<img
              class="aspect-square h-full w-full object-cover"
              src=${this.src}
              alt=${this.alt}
              @error=${this.onError}
            />`,
      () => html`<span class="flex h-full w-full items-center justify-center font-medium text-muted-foreground"
              ><slot></slot
            ></span>`
    )}
        </span>
        <span class=${"absolute bottom-0 right-0 " + (hasBadge ? "flex" : "hidden")}><slot name="badge"></slot></span>
      </span>
    `;
  }
};
_init55 = __decoratorStart(_a55);
__decorateElement(_init55, 1, "onError", _onError_dec, ShadAvatar);
__decorateElement(_init55, 5, "src", _src_dec, ShadAvatar);
__decorateElement(_init55, 5, "alt", _alt_dec, ShadAvatar);
__decorateElement(_init55, 5, "size", _size_dec4, ShadAvatar);
__decorateElement(_init55, 5, "failed", _failed_dec, ShadAvatar);
ShadAvatar = __decorateElement(_init55, 0, "ShadAvatar", _ShadAvatar_decorators, ShadAvatar);
__publicField(ShadAvatar, "styles", [tw, css`:host { display: inline-flex }`]);
__runInitializers(_init55, 1, ShadAvatar);
var _ShadAvatarGroup_decorators, _init56, _a56;
_ShadAvatarGroup_decorators = [Component.define()];
var ShadAvatarGroup = class extends (_a56 = Component("shad-avatar-group")) {
  // Overlap children and ring each with the page background so they read as a
  // stack. `margin-inline-start` (not -left) keeps the overlap correct in RTL.
  static styles = [
    tw,
    css`
      :host { display: inline-flex; }
      /* !important beats the slotted avatar's OWN-tree Tailwind preflight
         (* { margin: 0 }), which otherwise wins via shadow-cascade proximity. */
      ::slotted(*) {
        margin-inline-start: -0.5rem !important;
        border-radius: 9999px;
        box-shadow: 0 0 0 2px hsl(var(--background));
      }
      ::slotted(:first-child) { margin-inline-start: 0 !important; }
    `
  ];
  render() {
    return html`<slot></slot>`;
  }
};
_init56 = __decoratorStart(_a56);
ShadAvatarGroup = __decorateElement(_init56, 0, "ShadAvatarGroup", _ShadAvatarGroup_decorators, ShadAvatarGroup);
__runInitializers(_init56, 1, ShadAvatarGroup);

// packages/dom-ui-shad/src/ui/alert.ts
var alertClass = variants(
  "alert relative grid w-full gap-y-0.5 rounded-lg border px-4 py-3 text-left text-sm",
  {
    variant: {
      default: "bg-card text-card-foreground border-border",
      destructive: "border-destructive/50 text-destructive"
    }
  },
  { variant: "default" }
);
var _variant_dec6, _a57, _ShadAlert_decorators, _init57;
_ShadAlert_decorators = [Component.define()];
var ShadAlert = class extends (_a57 = Component("shad-alert"), _variant_dec6 = [Component.prop({ attribute: true })], _a57) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init57, 8, this, "default")), __runInitializers(_init57, 11, this);
  }
  render() {
    const hasIcon = !!this.querySelector('[slot="icon"]');
    const col2 = hasIcon ? " col-start-2" : "";
    const desc = this.variant === "destructive" ? "text-destructive/90" : "text-muted-foreground";
    return html`
      <div role="alert" class=${alertClass({ variant: this.variant }) + (hasIcon ? " grid-cols-[auto_1fr] gap-x-3" : " grid-cols-1")}>
        <span class=${hasIcon ? "row-span-2 self-start translate-y-0.5" : "hidden"}><slot name="icon"></slot></span>
        <div class=${"font-medium leading-none tracking-tight" + col2}><slot name="title"></slot></div>
        <div class=${"text-sm [&_p]:leading-relaxed " + desc + col2}><slot></slot></div>
      </div>
    `;
  }
};
_init57 = __decoratorStart(_a57);
__decorateElement(_init57, 5, "variant", _variant_dec6, ShadAlert);
ShadAlert = __decorateElement(_init57, 0, "ShadAlert", _ShadAlert_decorators, ShadAlert);
__publicField(ShadAlert, "styles", [
  tw,
  css`
      :host { display: block; }
      ::slotted([slot="icon"]) { width: 1rem; height: 1rem; }
    `
]);
__runInitializers(_init57, 1, ShadAlert);

// packages/dom-ui-shad/src/ui/aspect-ratio.ts
var _ratio_dec, _a58, _ShadAspectRatio_decorators, _init58;
_ShadAspectRatio_decorators = [Component.define()];
var ShadAspectRatio = class extends (_a58 = Component("shad-aspect-ratio"), _ratio_dec = [Component.prop({ attribute: true })], _a58) {
  constructor() {
    super(...arguments);
    __publicField(this, "ratio", __runInitializers(_init58, 8, this, 16 / 9)), __runInitializers(_init58, 11, this);
  }
  render() {
    return html`<div class="ratio" style=${styleMap({ aspectRatio: String(this.ratio) })}><slot></slot></div>`;
  }
};
_init58 = __decoratorStart(_a58);
__decorateElement(_init58, 5, "ratio", _ratio_dec, ShadAspectRatio);
ShadAspectRatio = __decorateElement(_init58, 0, "ShadAspectRatio", _ShadAspectRatio_decorators, ShadAspectRatio);
__publicField(ShadAspectRatio, "styles", [
  tw,
  css`
      :host { display: block; }
      .ratio { width: 100%; }
      ::slotted(*) { display: block; width: 100%; height: 100%; }
      ::slotted(img), ::slotted(video) { object-fit: cover; }
    `
]);
__runInitializers(_init58, 1, ShadAspectRatio);

// packages/dom-ui-shad/src/ui/switch.ts
var SIZES2 = {
  default: { track: "h-[1.15rem] w-8", thumb: "size-4", on: "14px", off: "2px" },
  sm: { track: "h-4 w-7", thumb: "size-3", on: "14px", off: "2px" }
};
var _toggle_dec, _accessibleName_dec2, _size_dec5, _invalid_dec3, _disabled_dec7, _checked_dec, _a59, _ShadSwitch_decorators, _init59;
_ShadSwitch_decorators = [Component.define()];
var ShadSwitch = class extends (_a59 = Component("shad-switch"), _checked_dec = [Component.prop({ attribute: true, reflect: true })], _disabled_dec7 = [Component.prop({ attribute: true })], _invalid_dec3 = [Component.prop({ attribute: true })], _size_dec5 = [Component.prop({ attribute: true })], _accessibleName_dec2 = [Component.prop({ attribute: "aria-label" })], _toggle_dec = [Component.event()], _a59) {
  constructor() {
    super(...arguments);
    __runInitializers(_init59, 5, this);
    __publicField(this, "checked", __runInitializers(_init59, 8, this, false)), __runInitializers(_init59, 11, this);
    __publicField(this, "disabled", __runInitializers(_init59, 12, this, false)), __runInitializers(_init59, 15, this);
    __publicField(this, "invalid", __runInitializers(_init59, 16, this, false)), __runInitializers(_init59, 19, this);
    __publicField(this, "size", __runInitializers(_init59, 20, this, "default")), __runInitializers(_init59, 23, this);
    __publicField(this, "accessibleName", __runInitializers(_init59, 24, this, "")), __runInitializers(_init59, 27, this);
  }
  toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.emit("change", this.checked);
  }
  onMount() {
    this.addEventListener("click", () => this.toggle(), { signal: this.abortSignal });
  }
  /** Delegate focus to the focusable inner control. */
  focus(options) {
    this.shadowRoot?.querySelector("button")?.focus(options);
  }
  render() {
    const sz = SIZES2[this.size] ?? SIZES2.default;
    return html`
      <button
        type="button"
        role="switch"
        aria-checked=${String(this.checked)}
        aria-invalid=${this.invalid ? "true" : "false"}
        aria-label=${this.accessibleName || null}
        data-size=${this.size}
        class=${classMap({
      [`relative inline-flex shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${sz.track}`]: true,
      "bg-primary": this.checked && !this.invalid,
      "bg-input": !this.checked && !this.invalid,
      "bg-destructive/20 ring-2 ring-destructive/30": this.invalid
    })}
        .disabled=${this.disabled}
      >
        <span
          class=${"thumb pointer-events-none block rounded-full bg-background shadow-sm " + sz.thumb}
          style=${styleMap({ transform: `translateX(${this.checked ? sz.on : sz.off})` })}
        ></span>
      </button>
    `;
  }
};
_init59 = __decoratorStart(_a59);
__decorateElement(_init59, 1, "toggle", _toggle_dec, ShadSwitch);
__decorateElement(_init59, 5, "checked", _checked_dec, ShadSwitch);
__decorateElement(_init59, 5, "disabled", _disabled_dec7, ShadSwitch);
__decorateElement(_init59, 5, "invalid", _invalid_dec3, ShadSwitch);
__decorateElement(_init59, 5, "size", _size_dec5, ShadSwitch);
__decorateElement(_init59, 5, "accessibleName", _accessibleName_dec2, ShadSwitch);
ShadSwitch = __decorateElement(_init59, 0, "ShadSwitch", _ShadSwitch_decorators, ShadSwitch);
__publicField(ShadSwitch, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      .thumb { transition: transform 0.2s ease; }
    `
]);
__runInitializers(_init59, 1, ShadSwitch);

// packages/dom-ui-shad/src/ui/checkbox.ts
var _toggle_dec2, _accessibleName_dec3, _invalid_dec4, _disabled_dec8, _checked_dec2, _a60, _ShadCheckbox_decorators, _init60;
_ShadCheckbox_decorators = [Component.define()];
var ShadCheckbox = class extends (_a60 = Component("shad-checkbox"), _checked_dec2 = [Component.prop({ attribute: true })], _disabled_dec8 = [Component.prop({ attribute: true })], _invalid_dec4 = [Component.prop({ attribute: true })], _accessibleName_dec3 = [Component.prop({ attribute: "aria-label" })], _toggle_dec2 = [Component.event()], _a60) {
  constructor() {
    super(...arguments);
    __runInitializers(_init60, 5, this);
    __publicField(this, "checked", __runInitializers(_init60, 8, this, false)), __runInitializers(_init60, 11, this);
    __publicField(this, "disabled", __runInitializers(_init60, 12, this, false)), __runInitializers(_init60, 15, this);
    __publicField(this, "invalid", __runInitializers(_init60, 16, this, false)), __runInitializers(_init60, 19, this);
    __publicField(this, "accessibleName", __runInitializers(_init60, 20, this, "")), __runInitializers(_init60, 23, this);
  }
  toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.emit("change", this.checked);
  }
  onMount() {
    this.addEventListener("click", () => this.toggle(), { signal: this.abortSignal });
  }
  /** Delegate focus to the focusable inner control (host has no tabindex). */
  focus(options) {
    this.shadowRoot?.querySelector("button")?.focus(options);
  }
  render() {
    return html`
      <button
        type="button"
        role="checkbox"
        aria-checked=${String(this.checked)}
        aria-invalid=${this.invalid ? "true" : "false"}
        aria-label=${this.accessibleName || null}
        class=${classMap({
      "peer flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50": true,
      "border-primary focus-visible:ring-ring": !this.invalid,
      "border-destructive focus-visible:ring-destructive": this.invalid,
      "bg-primary text-primary-foreground": this.checked,
      "bg-background": !this.checked
    })}
        .disabled=${this.disabled}
      >
        <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    `;
  }
};
_init60 = __decoratorStart(_a60);
__decorateElement(_init60, 1, "toggle", _toggle_dec2, ShadCheckbox);
__decorateElement(_init60, 5, "checked", _checked_dec2, ShadCheckbox);
__decorateElement(_init60, 5, "disabled", _disabled_dec8, ShadCheckbox);
__decorateElement(_init60, 5, "invalid", _invalid_dec4, ShadCheckbox);
__decorateElement(_init60, 5, "accessibleName", _accessibleName_dec3, ShadCheckbox);
ShadCheckbox = __decorateElement(_init60, 0, "ShadCheckbox", _ShadCheckbox_decorators, ShadCheckbox);
__publicField(ShadCheckbox, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      /* Check mark draw-in: the path is dashed to its own length and offset out
         of view, then offset back to 0 when checked. */
      .check {
        width: 0.75rem;
        height: 0.75rem;
      }
      .check path {
        stroke-dasharray: 24;
        stroke-dashoffset: 24;
        transition: stroke-dashoffset 200ms cubic-bezier(0.65, 0, 0.35, 1);
      }
      button[aria-checked="true"] .check path {
        stroke-dashoffset: 0;
      }
    `
]);
__runInitializers(_init60, 1, ShadCheckbox);

// packages/dom-ui-shad/src/ui/collapsible.ts
var _toggle_dec3, _chevron_dec, _open_dec2, _a61, _ShadCollapsible_decorators, _init61;
_ShadCollapsible_decorators = [Component.define()];
var ShadCollapsible = class extends (_a61 = Component("shad-collapsible"), _open_dec2 = [Component.prop({ attribute: true, reflect: true })], _chevron_dec = [Component.prop({ attribute: true })], _toggle_dec3 = [Component.event()], _a61) {
  constructor() {
    super(...arguments);
    __runInitializers(_init61, 5, this);
    __publicField(this, "open", __runInitializers(_init61, 8, this, false)), __runInitializers(_init61, 11, this);
    __publicField(this, "chevron", __runInitializers(_init61, 12, this, false)), __runInitializers(_init61, 15, this);
  }
  toggle() {
    this.open = !this.open;
    this.emit("change", this.open);
  }
  render() {
    return html`
      <button
        type="button"
        id="trigger"
        aria-controls="content"
        aria-expanded=${String(this.open)}
        class="flex w-full items-center justify-between gap-2 text-left"
        @click=${this.toggle}
      >
        <slot name="trigger"></slot>
        ${when(
      this.chevron,
      () => html`<svg
            class="chevron h-4 w-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>`
    )}
      </button>
      <div id="content" role="region" aria-labelledby="trigger" class="content" data-open=${this.open}>
        <div><div><slot></slot></div></div>
      </div>
    `;
  }
};
_init61 = __decoratorStart(_a61);
__decorateElement(_init61, 1, "toggle", _toggle_dec3, ShadCollapsible);
__decorateElement(_init61, 5, "open", _open_dec2, ShadCollapsible);
__decorateElement(_init61, 5, "chevron", _chevron_dec, ShadCollapsible);
ShadCollapsible = __decorateElement(_init61, 0, "ShadCollapsible", _ShadCollapsible_decorators, ShadCollapsible);
__publicField(ShadCollapsible, "styles", [
  tw,
  css`
      :host { display: block; }
      /* Smooth height via an animated grid track (no JS measuring). */
      .content { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms ease; }
      .content[data-open] { grid-template-rows: 1fr; }
      .content > div { overflow: hidden; }
      .chevron { transition: transform 200ms ease; }
      :host([open]) .chevron { transform: rotate(180deg); }
    `
]);
__runInitializers(_init61, 1, ShadCollapsible);

// packages/dom-ui-shad/src/ui/combobox.ts
var _invalid_dec5, _disabled_dec9, _clearable_dec, _placeholder_dec4, _multiple_dec, _values_dec, _value_dec6, _options_dec, _a62, _ShadCombobox_decorators, _init62, _open, _query, _active, _maxH, _flip, _ShadCombobox_instances, close_fn, toggle_fn, filtered_fn, isSelected_fn, select_fn, clear_fn, onKey_fn2, row_fn, groups_fn;
_ShadCombobox_decorators = [Component.define()];
var ShadCombobox = class extends (_a62 = Component("shad-combobox"), _options_dec = [Component.prop()], _value_dec6 = [Component.prop({ attribute: true })], _values_dec = [Component.prop()], _multiple_dec = [Component.prop({ attribute: true })], _placeholder_dec4 = [Component.prop({ attribute: true })], _clearable_dec = [Component.prop({ attribute: true })], _disabled_dec9 = [Component.prop({ attribute: true })], _invalid_dec5 = [Component.prop({ attribute: true })], _a62) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadCombobox_instances);
    __publicField(this, "options", __runInitializers(_init62, 8, this, [])), __runInitializers(_init62, 11, this);
    __publicField(this, "value", __runInitializers(_init62, 12, this, "")), __runInitializers(_init62, 15, this);
    __publicField(this, "values", __runInitializers(_init62, 16, this, [])), __runInitializers(_init62, 19, this);
    __publicField(this, "multiple", __runInitializers(_init62, 20, this, false)), __runInitializers(_init62, 23, this);
    __publicField(this, "placeholder", __runInitializers(_init62, 24, this, "Select…")), __runInitializers(_init62, 27, this);
    __publicField(this, "clearable", __runInitializers(_init62, 28, this, false)), __runInitializers(_init62, 31, this);
    __publicField(this, "disabled", __runInitializers(_init62, 32, this, false)), __runInitializers(_init62, 35, this);
    __publicField(this, "invalid", __runInitializers(_init62, 36, this, false)), __runInitializers(_init62, 39, this);
    __privateAdd(this, _open, this.signal(false));
    __privateAdd(this, _query, this.signal(""));
    __privateAdd(this, _active, this.signal(0));
    __privateAdd(this, _maxH, this.signal(240));
    // list height capped to available viewport space
    __privateAdd(this, _flip, this.signal(false));
  }
  // open upward when there's more room above
  onMount() {
    document.addEventListener(
      "click",
      (e) => {
        if (__privateGet(this, _open).call(this) && !e.composedPath().includes(this)) __privateMethod(this, _ShadCombobox_instances, close_fn).call(this);
      },
      { signal: this.abortSignal }
    );
  }
  render() {
    const open = __privateGet(this, _open).call(this);
    const filtered = __privateMethod(this, _ShadCombobox_instances, filtered_fn).call(this);
    const grouped = this.options.some((o) => o.group);
    const hasValue = this.multiple ? this.values.length > 0 : !!this.value;
    const selectedLabel = this.options.find((o) => o.value === this.value)?.label;
    return html`
      <button
        type="button"
        aria-expanded=${String(open)}
        class=${cn(
      "flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      this.invalid ? "border-destructive focus-visible:ring-destructive" : "border-border",
      "disabled:cursor-not-allowed disabled:opacity-50"
    )}
        .disabled=${this.disabled}
        @click=${() => __privateMethod(this, _ShadCombobox_instances, toggle_fn).call(this)}
      >
        <span class="flex flex-1 flex-wrap items-center gap-1 overflow-hidden text-left">
          ${this.multiple ? this.values.length ? map(
      this.values,
      (v) => html`<span class="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-foreground">
                    ${this.options.find((o) => o.value === v)?.label ?? v}
                    <span
                      class="cursor-pointer text-muted-foreground hover:text-foreground"
                      @click=${(e) => {
        e.stopPropagation();
        this.values = this.values.filter((x) => x !== v);
        this.emit("change", this.values);
      }}
                      >✕</span
                    >
                  </span>`
    ) : html`<span class="text-muted-foreground">${this.placeholder}</span>` : selectedLabel ? html`<span class="truncate">${selectedLabel}</span>` : html`<span class="text-muted-foreground">${this.placeholder}</span>`}
        </span>
        <span class="flex shrink-0 items-center gap-1">
          ${when(
      this.clearable && hasValue,
      () => html`<span class="cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Clear" @click=${(e) => __privateMethod(this, _ShadCombobox_instances, clear_fn).call(this, e)}>✕</span>`
    )}
          <svg class="h-4 w-4 shrink-0 text-muted-foreground opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      ${when(
      open,
      () => html`<div class=${cn(
        "absolute left-0 z-50 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md",
        __privateGet(this, _flip).call(this) ? "bottom-full mb-1" : "top-full mt-1"
      )}>
          <div class="flex items-center gap-2 border-b border-border px-3">
            <svg class="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              class="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search…"
              .value=${__privateGet(this, _query).call(this)}
              @input=${(e) => (__privateGet(this, _query).set(e.target.value), __privateGet(this, _active).set(0))}
              @keydown=${(e) => __privateMethod(this, _ShadCombobox_instances, onKey_fn2).call(this, e)}
            />
          </div>
          <div class="overflow-auto p-1" style=${"max-height:" + __privateGet(this, _maxH).call(this) + "px"}>
            ${filtered.length === 0 ? html`<div class="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</div>` : grouped ? __privateMethod(this, _ShadCombobox_instances, groups_fn).call(this, filtered) : map(filtered, (o, i) => __privateMethod(this, _ShadCombobox_instances, row_fn).call(this, o, i))}
          </div>
        </div>`
    )}
    `;
  }
};
_init62 = __decoratorStart(_a62);
_open = new WeakMap();
_query = new WeakMap();
_active = new WeakMap();
_maxH = new WeakMap();
_flip = new WeakMap();
_ShadCombobox_instances = new WeakSet();
close_fn = function() {
  __privateGet(this, _open).set(false);
  __privateGet(this, _query).set("");
};
toggle_fn = function() {
  if (this.disabled) return;
  const next = !__privateGet(this, _open).call(this);
  if (next) {
    __privateGet(this, _query).set("");
    __privateGet(this, _active).set(0);
    const r = this.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    const flip = below < 220 && above > below;
    __privateGet(this, _flip).set(flip);
    __privateGet(this, _maxH).set(Math.max(120, Math.min(288, (flip ? above : below) - 52)));
    requestAnimationFrame(() => this.shadowRoot.querySelector("input")?.focus());
  }
  __privateGet(this, _open).set(next);
};
filtered_fn = function() {
  const q = __privateGet(this, _query).call(this).toLowerCase();
  return this.options.filter((o) => o.label.toLowerCase().includes(q));
};
isSelected_fn = function(v) {
  return this.multiple ? this.values.includes(v) : this.value === v;
};
select_fn = function(o) {
  if (this.multiple) {
    const set = new Set(this.values);
    set.has(o.value) ? set.delete(o.value) : set.add(o.value);
    this.values = [...set];
    this.emit("change", this.values);
  } else {
    this.value = o.value;
    this.emit("change", this.value);
    __privateMethod(this, _ShadCombobox_instances, close_fn).call(this);
  }
};
clear_fn = function(e) {
  e.stopPropagation();
  if (this.multiple) this.values = [];
  else this.value = "";
  this.emit("change", this.multiple ? [] : "");
};
onKey_fn2 = function(e) {
  const f = __privateMethod(this, _ShadCombobox_instances, filtered_fn).call(this);
  if (e.key === "ArrowDown") e.preventDefault(), __privateGet(this, _active).set(Math.min(__privateGet(this, _active).call(this) + 1, f.length - 1));
  else if (e.key === "ArrowUp") e.preventDefault(), __privateGet(this, _active).set(Math.max(__privateGet(this, _active).call(this) - 1, 0));
  else if (e.key === "Enter") {
    e.preventDefault();
    const o = f[__privateGet(this, _active).call(this)];
    if (o) __privateMethod(this, _ShadCombobox_instances, select_fn).call(this, o);
  } else if (e.key === "Escape") __privateMethod(this, _ShadCombobox_instances, close_fn).call(this);
};
row_fn = function(o, i) {
  return html`<div
      role="option"
      aria-selected=${String(__privateMethod(this, _ShadCombobox_instances, isSelected_fn).call(this, o.value))}
      class=${cn(
    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
    i === __privateGet(this, _active).call(this) && "bg-accent text-accent-foreground"
  )}
      @click=${() => __privateMethod(this, _ShadCombobox_instances, select_fn).call(this, o)}
      @pointerenter=${() => __privateGet(this, _active).set(i)}
    >
      <svg
        class=${"h-4 w-4 " + (__privateMethod(this, _ShadCombobox_instances, isSelected_fn).call(this, o.value) ? "opacity-100" : "opacity-0")}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <span class="flex-1">${o.label}</span>
    </div>`;
};
groups_fn = function(filtered) {
  const names = [...new Set(filtered.map((o) => o.group ?? ""))];
  return map(
    names,
    (g) => html`
        ${when(g, () => html`<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">${g}</div>`)}
        ${map(
      filtered.filter((o) => (o.group ?? "") === g),
      (o) => __privateMethod(this, _ShadCombobox_instances, row_fn).call(this, o, filtered.indexOf(o))
    )}
      `
  );
};
__decorateElement(_init62, 5, "options", _options_dec, ShadCombobox);
__decorateElement(_init62, 5, "value", _value_dec6, ShadCombobox);
__decorateElement(_init62, 5, "values", _values_dec, ShadCombobox);
__decorateElement(_init62, 5, "multiple", _multiple_dec, ShadCombobox);
__decorateElement(_init62, 5, "placeholder", _placeholder_dec4, ShadCombobox);
__decorateElement(_init62, 5, "clearable", _clearable_dec, ShadCombobox);
__decorateElement(_init62, 5, "disabled", _disabled_dec9, ShadCombobox);
__decorateElement(_init62, 5, "invalid", _invalid_dec5, ShadCombobox);
ShadCombobox = __decorateElement(_init62, 0, "ShadCombobox", _ShadCombobox_decorators, ShadCombobox);
__publicField(ShadCombobox, "styles", [tw, css`:host { display: block; position: relative; }`]);
__runInitializers(_init62, 1, ShadCombobox);

// packages/dom-ui-shad/src/ui/command.ts
var _placeholder_dec5, _items_dec2, _a63, _ShadCommand_decorators, _init63, _query2, _active2, _ShadCommand_instances, filtered_fn2, select_fn2, onKey_fn3, row_fn2, groups_fn2;
_ShadCommand_decorators = [Component.define()];
var ShadCommand = class extends (_a63 = Component("shad-command"), _items_dec2 = [Component.prop()], _placeholder_dec5 = [Component.prop({ attribute: true })], _a63) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadCommand_instances);
    __publicField(this, "items", __runInitializers(_init63, 8, this, [])), __runInitializers(_init63, 11, this);
    __publicField(this, "placeholder", __runInitializers(_init63, 12, this, "Type a command or search…")), __runInitializers(_init63, 15, this);
    __privateAdd(this, _query2, this.signal(""));
    __privateAdd(this, _active2, this.signal(0));
  }
  render() {
    const filtered = __privateMethod(this, _ShadCommand_instances, filtered_fn2).call(this);
    const grouped = this.items.some((i) => i.group);
    return html`
      <div class="overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
        <div class="flex items-center gap-2 border-b border-border px-3">
          <svg class="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            class="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder=${this.placeholder}
            .value=${__privateGet(this, _query2).call(this)}
            @input=${(e) => (__privateGet(this, _query2).set(e.target.value), __privateGet(this, _active2).set(0))}
            @keydown=${(e) => __privateMethod(this, _ShadCommand_instances, onKey_fn3).call(this, e)}
          />
        </div>
        <div class="max-h-80 overflow-auto p-1">
          ${filtered.length === 0 ? html`<div class="py-6 text-center text-sm text-muted-foreground">No results found.</div>` : grouped ? __privateMethod(this, _ShadCommand_instances, groups_fn2).call(this, filtered) : map(filtered, (it, i) => __privateMethod(this, _ShadCommand_instances, row_fn2).call(this, it, i))}
        </div>
      </div>
    `;
  }
};
_init63 = __decoratorStart(_a63);
_query2 = new WeakMap();
_active2 = new WeakMap();
_ShadCommand_instances = new WeakSet();
filtered_fn2 = function() {
  const q = __privateGet(this, _query2).call(this).toLowerCase();
  return this.items.filter((i) => i.label.toLowerCase().includes(q));
};
select_fn2 = function(it) {
  this.emit("select", it.value);
};
onKey_fn3 = function(e) {
  const f = __privateMethod(this, _ShadCommand_instances, filtered_fn2).call(this);
  if (e.key === "ArrowDown") e.preventDefault(), __privateGet(this, _active2).set(Math.min(__privateGet(this, _active2).call(this) + 1, f.length - 1));
  else if (e.key === "ArrowUp") e.preventDefault(), __privateGet(this, _active2).set(Math.max(__privateGet(this, _active2).call(this) - 1, 0));
  else if (e.key === "Enter") {
    e.preventDefault();
    const it = f[__privateGet(this, _active2).call(this)];
    if (it) __privateMethod(this, _ShadCommand_instances, select_fn2).call(this, it);
  } else if (e.key === "Escape") __privateGet(this, _query2).set("");
};
row_fn2 = function(it, i) {
  return html`<div
      role="option"
      aria-selected=${String(i === __privateGet(this, _active2).call(this))}
      class=${"flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm" + (i === __privateGet(this, _active2).call(this) ? " bg-accent text-accent-foreground" : "")}
      @click=${() => __privateMethod(this, _ShadCommand_instances, select_fn2).call(this, it)}
      @pointerenter=${() => __privateGet(this, _active2).set(i)}
    >
      ${when(it.icon, () => html`<span class="flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4">${it.icon}</span>`)}
      <span class="flex-1">${it.label}</span>
      ${when(it.shortcut, () => html`<span class="ml-auto text-xs tracking-widest text-muted-foreground">${it.shortcut}</span>`)}
    </div>`;
};
groups_fn2 = function(filtered) {
  const names = [...new Set(filtered.map((i) => i.group ?? ""))];
  return map(
    names,
    (g, gi) => html`
        ${when(gi > 0, () => html`<div class="-mx-1 my-1 h-px bg-border"></div>`)}
        ${when(g, () => html`<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">${g}</div>`)}
        ${map(
      filtered.filter((i) => (i.group ?? "") === g),
      (it) => __privateMethod(this, _ShadCommand_instances, row_fn2).call(this, it, filtered.indexOf(it))
    )}
      `
  );
};
__decorateElement(_init63, 5, "items", _items_dec2, ShadCommand);
__decorateElement(_init63, 5, "placeholder", _placeholder_dec5, ShadCommand);
ShadCommand = __decorateElement(_init63, 0, "ShadCommand", _ShadCommand_decorators, ShadCommand);
__publicField(ShadCommand, "styles", [tw, css`:host { display: block; }`]);
__runInitializers(_init63, 1, ShadCommand);

// packages/dom-ui-shad/src/ui/context-menu.ts
var CHECK = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
var DOT = html`<svg class="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>`;
var _items_dec3, _a64, _ShadContextMenu_decorators, _init64, _open2, _x, _y, _sub, _subX, _subY, _checks, _radios, _ShadContextMenu_instances, openAt_fn, close_fn2, run_fn, toggleCheck_fn, pickRadio_fn, row_fn3, panel_fn;
_ShadContextMenu_decorators = [Component.define()];
var ShadContextMenu = class extends (_a64 = Component("shad-context-menu"), _items_dec3 = [Component.prop()], _a64) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadContextMenu_instances);
    __publicField(this, "items", __runInitializers(_init64, 8, this, [])), __runInitializers(_init64, 11, this);
    __privateAdd(this, _open2, this.signal(false));
    __privateAdd(this, _x, this.signal(0));
    __privateAdd(this, _y, this.signal(0));
    __privateAdd(this, _sub, this.signal(-1));
    // index of the open top-level submenu (-1 = none)
    __privateAdd(this, _subX, this.signal(0));
    __privateAdd(this, _subY, this.signal(0));
    __privateAdd(this, _checks, this.signal(/* @__PURE__ */ new Set()));
    __privateAdd(this, _radios, this.signal({}));
  }
  onMount() {
    const checks = /* @__PURE__ */ new Set();
    const radios = {};
    const walk = (es) => es.forEach((e) => {
      if (e.checkbox && e.checked && e.value) checks.add(e.value);
      if (e.radio && e.checked && e.value) radios[e.radio] = e.value;
      if (e.items) walk(e.items);
    });
    walk(this.items);
    __privateGet(this, _checks).set(checks);
    __privateGet(this, _radios).set(radios);
    this.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      __privateMethod(this, _ShadContextMenu_instances, openAt_fn).call(this, e.clientX, e.clientY);
    }, { signal: this.abortSignal });
    document.addEventListener("click", (e) => {
      if (__privateGet(this, _open2).call(this) && !e.composedPath().some((n) => n instanceof HTMLElement && n.hasAttribute("data-menu"))) __privateMethod(this, _ShadContextMenu_instances, close_fn2).call(this);
    }, { signal: this.abortSignal });
    document.addEventListener("keydown", (e) => {
      if (__privateGet(this, _open2).call(this) && e.key === "Escape") __privateMethod(this, _ShadContextMenu_instances, close_fn2).call(this);
    }, { signal: this.abortSignal });
  }
  render() {
    const panels = [];
    if (__privateGet(this, _open2).call(this)) {
      panels.push(__privateMethod(this, _ShadContextMenu_instances, panel_fn).call(this, this.items, true, `left:${__privateGet(this, _x).call(this)}px;top:${__privateGet(this, _y).call(this)}px`));
      const sub = __privateGet(this, _sub).call(this);
      const subItems = sub >= 0 ? this.items[sub]?.items : void 0;
      if (subItems) panels.push(__privateMethod(this, _ShadContextMenu_instances, panel_fn).call(this, subItems, false, `left:${__privateGet(this, _subX).call(this)}px;top:${__privateGet(this, _subY).call(this)}px`));
    }
    return html`<slot></slot>${panels}`;
  }
};
_init64 = __decoratorStart(_a64);
_open2 = new WeakMap();
_x = new WeakMap();
_y = new WeakMap();
_sub = new WeakMap();
_subX = new WeakMap();
_subY = new WeakMap();
_checks = new WeakMap();
_radios = new WeakMap();
_ShadContextMenu_instances = new WeakSet();
openAt_fn = function(x, y) {
  __privateGet(this, _sub).set(-1);
  __privateGet(this, _x).set(x);
  __privateGet(this, _y).set(y);
  __privateGet(this, _open2).set(true);
  requestAnimationFrame(() => {
    const m = this.shadowRoot.querySelector("[data-menu]");
    if (!m) return;
    const r = m.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) __privateGet(this, _x).set(Math.max(8, innerWidth - r.width - 8));
    if (y + r.height > innerHeight - 8) __privateGet(this, _y).set(Math.max(8, innerHeight - r.height - 8));
  });
};
close_fn2 = function() {
  __privateGet(this, _open2).set(false);
  __privateGet(this, _sub).set(-1);
};
run_fn = function(e) {
  if (e.disabled) return;
  this.emit("select", e.value ?? e.label);
  __privateMethod(this, _ShadContextMenu_instances, close_fn2).call(this);
};
toggleCheck_fn = function(e) {
  if (e.disabled || !e.value) return;
  const next = new Set(__privateGet(this, _checks).call(this));
  next.has(e.value) ? next.delete(e.value) : next.add(e.value);
  __privateGet(this, _checks).set(next);
  this.emit("checkedchange", { value: e.value, checked: next.has(e.value) });
};
pickRadio_fn = function(e) {
  if (e.disabled || !e.radio || !e.value) return;
  __privateGet(this, _radios).set({ ...__privateGet(this, _radios).call(this), [e.radio]: e.value });
  this.emit("radiochange", { group: e.radio, value: e.value });
};
row_fn3 = function(e, i, top) {
  if (e.separator) return html`<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>`;
  if (e.heading) return html`<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">${e.label}</div>`;
  const base2 = "relative flex cursor-default items-center gap-1.5 rounded-md py-1 text-sm outline-none select-none data-disabled:pointer-events-none [&>svg]:h-4 [&>svg]:w-4";
  const hover = e.destructive ? "hover:bg-destructive/10 hover:text-destructive text-destructive" : "hover:bg-accent hover:text-accent-foreground";
  const dim = e.disabled ? " pointer-events-none opacity-50" : "";
  if (e.checkbox) {
    const on = !!e.value && __privateGet(this, _checks).call(this).has(e.value);
    return html`<div role="menuitemcheckbox" aria-checked=${String(on)} class=${base2 + " pl-2 pr-8 " + hover + dim} @click=${() => __privateMethod(this, _ShadContextMenu_instances, toggleCheck_fn).call(this, e)}>
        <span class="pointer-events-none absolute right-2 flex h-4 w-4 items-center justify-center">${when(on, () => CHECK)}</span>
        ${e.label}
      </div>`;
  }
  if (e.radio) {
    const on = __privateGet(this, _radios).call(this)[e.radio] === e.value;
    return html`<div role="menuitemradio" aria-checked=${String(on)} class=${base2 + " pl-2 pr-8 " + hover + dim} @click=${() => __privateMethod(this, _ShadContextMenu_instances, pickRadio_fn).call(this, e)}>
        <span class="pointer-events-none absolute right-2 flex h-4 w-4 items-center justify-center">${when(on, () => DOT)}</span>
        ${e.label}
      </div>`;
  }
  if (e.items) {
    const openSub = top && __privateGet(this, _sub).call(this) === i;
    return html`<div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded=${String(openSub)}
        class=${base2 + " px-2 " + hover + (openSub ? " bg-accent text-accent-foreground" : "") + dim}
        @pointerenter=${(ev) => {
      if (!top) return;
      const r = ev.currentTarget.getBoundingClientRect();
      __privateGet(this, _subX).set(r.right - 4);
      __privateGet(this, _subY).set(r.top - 4);
      __privateGet(this, _sub).set(i);
    }}
      >
        ${when(e.icon, () => e.icon)}
        <span class="flex-1">${e.label}</span>
        <svg class="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </div>`;
  }
  return html`<div
      role="menuitem"
      class=${base2 + " px-2 " + hover + dim}
      @pointerenter=${() => top && __privateGet(this, _sub).set(-1)}
      @click=${() => __privateMethod(this, _ShadContextMenu_instances, run_fn).call(this, e)}
    >
      ${when(e.icon, () => e.icon)}
      <span class="flex-1">${e.label}</span>
      ${when(e.shortcut, () => html`<span class="ml-auto text-xs tracking-widest text-muted-foreground">${e.shortcut}</span>`)}
    </div>`;
};
panel_fn = function(entries, top, style) {
  return html`<div
      role="menu"
      data-menu
      class="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style=${style}
    >
      ${map(entries, (e, i) => __privateMethod(this, _ShadContextMenu_instances, row_fn3).call(this, e, i, top))}
    </div>`;
};
__decorateElement(_init64, 5, "items", _items_dec3, ShadContextMenu);
ShadContextMenu = __decorateElement(_init64, 0, "ShadContextMenu", _ShadContextMenu_decorators, ShadContextMenu);
__publicField(ShadContextMenu, "styles", [tw, css`:host { display: contents; }`]);
__runInitializers(_init64, 1, ShadContextMenu);

// packages/dom-ui-shad/src/ui/dropdown-menu.ts
var CHECK2 = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
var DOT2 = html`<svg class="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>`;
var _side_dec, _align_dec2, _items_dec4, _a65, _ShadDropdownMenu_decorators, _init65, _open3, _x2, _y2, _sub2, _subX2, _subY2, _checks2, _radios2, _ShadDropdownMenu_instances, trigger_fn, toggle_fn2, close_fn3, run_fn2, toggleCheck_fn2, pickRadio_fn2, row_fn4, panel_fn2;
_ShadDropdownMenu_decorators = [Component.define()];
var ShadDropdownMenu = class extends (_a65 = Component("shad-dropdown-menu"), _items_dec4 = [Component.prop()], _align_dec2 = [Component.prop({ attribute: true })], _side_dec = [Component.prop({ attribute: true })], _a65) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadDropdownMenu_instances);
    __publicField(this, "items", __runInitializers(_init65, 8, this, [])), __runInitializers(_init65, 11, this);
    __publicField(this, "align", __runInitializers(_init65, 12, this, "start")), __runInitializers(_init65, 15, this);
    __publicField(this, "side", __runInitializers(_init65, 16, this, "bottom")), __runInitializers(_init65, 19, this);
    __privateAdd(this, _open3, this.signal(false));
    __privateAdd(this, _x2, this.signal(0));
    __privateAdd(this, _y2, this.signal(0));
    __privateAdd(this, _sub2, this.signal(-1));
    __privateAdd(this, _subX2, this.signal(0));
    __privateAdd(this, _subY2, this.signal(0));
    __privateAdd(this, _checks2, this.signal(/* @__PURE__ */ new Set()));
    __privateAdd(this, _radios2, this.signal({}));
  }
  onMount() {
    const checks = /* @__PURE__ */ new Set();
    const radios = {};
    const walk = (es) => es.forEach((e) => {
      if (e.checkbox && e.checked && e.value) checks.add(e.value);
      if (e.radio && e.checked && e.value) radios[e.radio] = e.value;
      if (e.items) walk(e.items);
    });
    walk(this.items);
    __privateGet(this, _checks2).set(checks);
    __privateGet(this, _radios2).set(radios);
    document.addEventListener(
      "click",
      (e) => {
        if (!__privateGet(this, _open3).call(this)) return;
        const path = e.composedPath();
        if (path.includes(__privateMethod(this, _ShadDropdownMenu_instances, trigger_fn).call(this))) return;
        if (path.some((n) => n instanceof HTMLElement && n.hasAttribute("data-menu"))) return;
        __privateMethod(this, _ShadDropdownMenu_instances, close_fn3).call(this);
      },
      { signal: this.abortSignal }
    );
    document.addEventListener("keydown", (e) => {
      if (__privateGet(this, _open3).call(this) && e.key === "Escape") __privateMethod(this, _ShadDropdownMenu_instances, close_fn3).call(this);
    }, { signal: this.abortSignal });
    addEventListener("scroll", () => __privateGet(this, _open3).call(this) && __privateMethod(this, _ShadDropdownMenu_instances, close_fn3).call(this), { capture: true, passive: true, signal: this.abortSignal });
  }
  render() {
    const panels = [];
    if (__privateGet(this, _open3).call(this)) {
      panels.push(__privateMethod(this, _ShadDropdownMenu_instances, panel_fn2).call(this, this.items, true, `left:${__privateGet(this, _x2).call(this)}px;top:${__privateGet(this, _y2).call(this)}px`));
      const sub = __privateGet(this, _sub2).call(this);
      const subItems = sub >= 0 ? this.items[sub]?.items : void 0;
      if (subItems) panels.push(__privateMethod(this, _ShadDropdownMenu_instances, panel_fn2).call(this, subItems, false, `left:${__privateGet(this, _subX2).call(this)}px;top:${__privateGet(this, _subY2).call(this)}px`));
    }
    return html`<slot @click=${() => __privateMethod(this, _ShadDropdownMenu_instances, toggle_fn2).call(this)}></slot>${panels}`;
  }
};
_init65 = __decoratorStart(_a65);
_open3 = new WeakMap();
_x2 = new WeakMap();
_y2 = new WeakMap();
_sub2 = new WeakMap();
_subX2 = new WeakMap();
_subY2 = new WeakMap();
_checks2 = new WeakMap();
_radios2 = new WeakMap();
_ShadDropdownMenu_instances = new WeakSet();
trigger_fn = function() {
  return this.shadowRoot.querySelector("slot").assignedElements()[0] ?? null;
};
toggle_fn2 = function() {
  if (__privateGet(this, _open3).call(this)) return __privateMethod(this, _ShadDropdownMenu_instances, close_fn3).call(this);
  const t = __privateMethod(this, _ShadDropdownMenu_instances, trigger_fn).call(this);
  if (!t) return;
  const r = t.getBoundingClientRect();
  __privateGet(this, _sub2).set(-1);
  const horiz = this.side === "right" || this.side === "left";
  __privateGet(this, _x2).set(horiz ? this.side === "right" ? r.right + 4 : r.left : this.align === "end" ? r.right : r.left);
  __privateGet(this, _y2).set(horiz ? r.top : r.bottom + 4);
  __privateGet(this, _open3).set(true);
  requestAnimationFrame(() => {
    const m = this.shadowRoot.querySelector("[data-menu]");
    if (!m) return;
    const mr = m.getBoundingClientRect();
    const gap = 4;
    let x, y;
    if (horiz) {
      x = this.side === "right" ? r.right + gap : r.left - mr.width - gap;
      if (x + mr.width > innerWidth - 8) x = r.left - mr.width - gap;
      if (x < 8) x = r.right + gap;
      y = this.align === "end" ? r.bottom - mr.height : r.top;
      y = Math.max(8, Math.min(y, innerHeight - mr.height - 8));
    } else {
      x = this.align === "end" ? r.right - mr.width : r.left;
      if (x + mr.width > innerWidth - 8) x = Math.max(8, innerWidth - mr.width - 8);
      if (x < 8) x = 8;
      y = this.side === "top" ? r.top - mr.height - gap : r.bottom + gap;
      if (this.side !== "top" && y + mr.height > innerHeight - 8) y = Math.max(8, r.top - mr.height - gap);
    }
    __privateGet(this, _x2).set(x);
    __privateGet(this, _y2).set(y);
  });
};
close_fn3 = function() {
  __privateGet(this, _open3).set(false);
  __privateGet(this, _sub2).set(-1);
};
run_fn2 = function(e) {
  if (e.disabled) return;
  this.emit("select", e.value ?? e.label);
  __privateMethod(this, _ShadDropdownMenu_instances, close_fn3).call(this);
};
toggleCheck_fn2 = function(e) {
  if (e.disabled || !e.value) return;
  const next = new Set(__privateGet(this, _checks2).call(this));
  next.has(e.value) ? next.delete(e.value) : next.add(e.value);
  __privateGet(this, _checks2).set(next);
  this.emit("checkedchange", { value: e.value, checked: next.has(e.value) });
};
pickRadio_fn2 = function(e) {
  if (e.disabled || !e.radio || !e.value) return;
  __privateGet(this, _radios2).set({ ...__privateGet(this, _radios2).call(this), [e.radio]: e.value });
  this.emit("radiochange", { group: e.radio, value: e.value });
};
row_fn4 = function(e, i, top) {
  if (e.separator) return html`<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>`;
  if (e.heading) return html`<div class="px-1.5 py-1 text-xs font-medium text-muted-foreground">${e.label}</div>`;
  const base2 = "relative flex cursor-default items-center gap-1.5 rounded-md py-1 text-sm outline-none select-none data-disabled:pointer-events-none [&>svg]:h-4 [&>svg]:w-4";
  const hover = e.destructive ? "hover:bg-destructive/10 hover:text-destructive text-destructive" : "hover:bg-accent hover:text-accent-foreground";
  const dim = e.disabled ? " pointer-events-none opacity-50" : "";
  if (e.checkbox) {
    const on = !!e.value && __privateGet(this, _checks2).call(this).has(e.value);
    return html`<div role="menuitemcheckbox" aria-checked=${String(on)} class=${base2 + " pl-7 pr-2 " + hover + dim} @click=${() => __privateMethod(this, _ShadDropdownMenu_instances, toggleCheck_fn2).call(this, e)}>
        <span class="pointer-events-none absolute left-1.5 flex h-4 w-4 items-center justify-center">${when(on, () => CHECK2)}</span>
        ${when(e.icon, () => e.icon)}${e.label}
      </div>`;
  }
  if (e.radio) {
    const on = __privateGet(this, _radios2).call(this)[e.radio] === e.value;
    return html`<div role="menuitemradio" aria-checked=${String(on)} class=${base2 + " pl-7 pr-2 " + hover + dim} @click=${() => __privateMethod(this, _ShadDropdownMenu_instances, pickRadio_fn2).call(this, e)}>
        <span class="pointer-events-none absolute left-1.5 flex h-4 w-4 items-center justify-center">${when(on, () => DOT2)}</span>
        ${when(e.icon, () => e.icon)}${e.label}
      </div>`;
  }
  if (e.items) {
    const openSub = top && __privateGet(this, _sub2).call(this) === i;
    return html`<div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded=${String(openSub)}
        class=${base2 + " px-1.5 " + hover + (openSub ? " bg-accent text-accent-foreground" : "") + dim}
        @pointerenter=${(ev) => {
      if (!top) return;
      const rect = ev.currentTarget.getBoundingClientRect();
      __privateGet(this, _subX2).set(rect.right - 4);
      __privateGet(this, _subY2).set(rect.top - 4);
      __privateGet(this, _sub2).set(i);
    }}
      >
        ${when(e.icon, () => e.icon)}
        <span class="flex-1">${e.label}</span>
        <svg class="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </div>`;
  }
  return html`<div
      role="menuitem"
      aria-disabled=${e.disabled ? "true" : null}
      class=${base2 + " px-1.5 " + hover + dim}
      @pointerenter=${() => top && __privateGet(this, _sub2).set(-1)}
      @click=${() => __privateMethod(this, _ShadDropdownMenu_instances, run_fn2).call(this, e)}
    >
      ${when(e.icon, () => e.icon)}
      <span class="flex-1">${e.label}</span>
      ${when(e.shortcut, () => html`<span class="ml-auto text-xs tracking-widest text-muted-foreground">${e.shortcut}</span>`)}
    </div>`;
};
panel_fn2 = function(entries, top, style) {
  return html`<div
      role="menu"
      data-menu
      class="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-left text-popover-foreground shadow-md"
      style=${style}
    >
      ${map(entries, (e, i) => __privateMethod(this, _ShadDropdownMenu_instances, row_fn4).call(this, e, i, top))}
    </div>`;
};
__decorateElement(_init65, 5, "items", _items_dec4, ShadDropdownMenu);
__decorateElement(_init65, 5, "align", _align_dec2, ShadDropdownMenu);
__decorateElement(_init65, 5, "side", _side_dec, ShadDropdownMenu);
ShadDropdownMenu = __decorateElement(_init65, 0, "ShadDropdownMenu", _ShadDropdownMenu_decorators, ShadDropdownMenu);
__publicField(ShadDropdownMenu, "styles", [tw, css`:host { display: inline-block; }`]);
__runInitializers(_init65, 1, ShadDropdownMenu);

// packages/dom-ui-shad/src/ui/menubar.ts
var CHECK3 = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
var DOT3 = html`<svg class="h-2 w-2" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" /></svg>`;
var _menus_dec, _a66, _ShadMenubar_decorators, _init66, _open4, _x3, _y3, _sub3, _subX3, _subY3, _checks3, _radios3, _ShadMenubar_instances, openMenu_fn, close_fn4, run_fn3, toggleCheck_fn3, pickRadio_fn3, row_fn5, panel_fn3;
_ShadMenubar_decorators = [Component.define()];
var ShadMenubar = class extends (_a66 = Component("shad-menubar"), _menus_dec = [Component.prop()], _a66) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadMenubar_instances);
    __publicField(this, "menus", __runInitializers(_init66, 8, this, [])), __runInitializers(_init66, 11, this);
    __privateAdd(this, _open4, this.signal(-1));
    // open top-level menu index (-1 = none)
    __privateAdd(this, _x3, this.signal(0));
    __privateAdd(this, _y3, this.signal(0));
    __privateAdd(this, _sub3, this.signal(-1));
    // open submenu index within the current menu
    __privateAdd(this, _subX3, this.signal(0));
    __privateAdd(this, _subY3, this.signal(0));
    __privateAdd(this, _checks3, this.signal(/* @__PURE__ */ new Set()));
    __privateAdd(this, _radios3, this.signal({}));
  }
  onMount() {
    const checks = /* @__PURE__ */ new Set();
    const radios = {};
    const walk = (es) => es.forEach((e) => {
      if (e.checkbox && e.checked && e.value) checks.add(e.value);
      if (e.radio && e.checked && e.value) radios[e.radio] = e.value;
      if (e.items) walk(e.items);
    });
    this.menus.forEach((m) => walk(m.items));
    __privateGet(this, _checks3).set(checks);
    __privateGet(this, _radios3).set(radios);
    document.addEventListener(
      "click",
      (e) => {
        if (__privateGet(this, _open4).call(this) < 0) return;
        const path = e.composedPath();
        if (path.some((n) => n instanceof HTMLElement && (n.hasAttribute("data-menu") || n.hasAttribute("data-mb-trigger")))) return;
        __privateMethod(this, _ShadMenubar_instances, close_fn4).call(this);
      },
      { signal: this.abortSignal }
    );
    document.addEventListener("keydown", (e) => {
      if (__privateGet(this, _open4).call(this) >= 0 && e.key === "Escape") __privateMethod(this, _ShadMenubar_instances, close_fn4).call(this);
    }, { signal: this.abortSignal });
    addEventListener("scroll", () => __privateGet(this, _open4).call(this) >= 0 && __privateMethod(this, _ShadMenubar_instances, close_fn4).call(this), { capture: true, passive: true, signal: this.abortSignal });
  }
  render() {
    const open = __privateGet(this, _open4).call(this);
    const panels = [];
    if (open >= 0) {
      const items = this.menus[open]?.items ?? [];
      panels.push(__privateMethod(this, _ShadMenubar_instances, panel_fn3).call(this, items, true, `left:${__privateGet(this, _x3).call(this)}px;top:${__privateGet(this, _y3).call(this)}px`));
      const sub = __privateGet(this, _sub3).call(this);
      const subItems = sub >= 0 ? items[sub]?.items : void 0;
      if (subItems) panels.push(__privateMethod(this, _ShadMenubar_instances, panel_fn3).call(this, subItems, false, `left:${__privateGet(this, _subX3).call(this)}px;top:${__privateGet(this, _subY3).call(this)}px`));
    }
    return html`
      <div role="menubar" class="flex h-9 items-center gap-0.5 rounded-md border border-border bg-background p-[3px]">
        ${map(
      this.menus,
      (m, i) => html`<button
            type="button"
            role="menuitem"
            data-mb-trigger
            aria-haspopup="menu"
            aria-expanded=${String(open === i)}
            class=${"flex cursor-default items-center rounded-sm px-2 py-1 text-sm font-medium outline-none select-none hover:bg-muted " + (open === i ? "bg-muted" : "")}
            @click=${() => open === i ? __privateMethod(this, _ShadMenubar_instances, close_fn4).call(this) : __privateMethod(this, _ShadMenubar_instances, openMenu_fn).call(this, i)}
            @pointerenter=${() => open >= 0 && open !== i && __privateMethod(this, _ShadMenubar_instances, openMenu_fn).call(this, i)}
          >
            ${m.label}
          </button>`
    )}
      </div>
      ${panels}
    `;
  }
};
_init66 = __decoratorStart(_a66);
_open4 = new WeakMap();
_x3 = new WeakMap();
_y3 = new WeakMap();
_sub3 = new WeakMap();
_subX3 = new WeakMap();
_subY3 = new WeakMap();
_checks3 = new WeakMap();
_radios3 = new WeakMap();
_ShadMenubar_instances = new WeakSet();
openMenu_fn = function(i) {
  const trigger = this.shadowRoot.querySelectorAll("[data-mb-trigger]")[i];
  if (!trigger) return;
  const r = trigger.getBoundingClientRect();
  __privateGet(this, _sub3).set(-1);
  __privateGet(this, _x3).set(r.left);
  __privateGet(this, _y3).set(r.bottom + 6);
  __privateGet(this, _open4).set(i);
  requestAnimationFrame(() => {
    const m = this.shadowRoot.querySelector("[data-menu]");
    if (!m) return;
    const mr = m.getBoundingClientRect();
    if (r.left + mr.width > innerWidth - 8) __privateGet(this, _x3).set(Math.max(8, innerWidth - mr.width - 8));
  });
};
close_fn4 = function() {
  __privateGet(this, _open4).set(-1);
  __privateGet(this, _sub3).set(-1);
};
run_fn3 = function(e) {
  if (e.disabled) return;
  this.emit("select", e.value ?? e.label);
  __privateMethod(this, _ShadMenubar_instances, close_fn4).call(this);
};
toggleCheck_fn3 = function(e) {
  if (e.disabled || !e.value) return;
  const next = new Set(__privateGet(this, _checks3).call(this));
  next.has(e.value) ? next.delete(e.value) : next.add(e.value);
  __privateGet(this, _checks3).set(next);
  this.emit("checkedchange", { value: e.value, checked: next.has(e.value) });
};
pickRadio_fn3 = function(e) {
  if (e.disabled || !e.radio || !e.value) return;
  __privateGet(this, _radios3).set({ ...__privateGet(this, _radios3).call(this), [e.radio]: e.value });
  this.emit("radiochange", { group: e.radio, value: e.value });
};
row_fn5 = function(e, i, top) {
  if (e.separator) return html`<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>`;
  if (e.heading) return html`<div class="px-1.5 py-1 text-xs font-medium text-muted-foreground">${e.label}</div>`;
  const base2 = "relative flex cursor-default items-center gap-1.5 rounded-md py-1 text-sm outline-none select-none [&>svg]:h-4 [&>svg]:w-4";
  const hover = e.destructive ? "hover:bg-destructive/10 hover:text-destructive text-destructive" : "hover:bg-accent hover:text-accent-foreground";
  const dim = e.disabled ? " pointer-events-none opacity-50" : "";
  if (e.checkbox) {
    const on = !!e.value && __privateGet(this, _checks3).call(this).has(e.value);
    return html`<div role="menuitemcheckbox" aria-checked=${String(on)} class=${base2 + " pl-7 pr-2 " + hover + dim} @click=${() => __privateMethod(this, _ShadMenubar_instances, toggleCheck_fn3).call(this, e)}>
        <span class="pointer-events-none absolute left-1.5 flex h-4 w-4 items-center justify-center">${when(on, () => CHECK3)}</span>
        ${when(e.icon, () => e.icon)}${e.label}
      </div>`;
  }
  if (e.radio) {
    const on = __privateGet(this, _radios3).call(this)[e.radio] === e.value;
    return html`<div role="menuitemradio" aria-checked=${String(on)} class=${base2 + " pl-7 pr-2 " + hover + dim} @click=${() => __privateMethod(this, _ShadMenubar_instances, pickRadio_fn3).call(this, e)}>
        <span class="pointer-events-none absolute left-1.5 flex h-4 w-4 items-center justify-center">${when(on, () => DOT3)}</span>
        ${when(e.icon, () => e.icon)}${e.label}
      </div>`;
  }
  if (e.items) {
    const openSub = top && __privateGet(this, _sub3).call(this) === i;
    return html`<div
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded=${String(openSub)}
        class=${base2 + " px-1.5 " + hover + (openSub ? " bg-accent text-accent-foreground" : "") + dim}
        @pointerenter=${(ev) => {
      if (!top) return;
      const rect = ev.currentTarget.getBoundingClientRect();
      __privateGet(this, _subX3).set(rect.right - 4);
      __privateGet(this, _subY3).set(rect.top - 4);
      __privateGet(this, _sub3).set(i);
    }}
      >
        ${when(e.icon, () => e.icon)}
        <span class="flex-1">${e.label}</span>
        <svg class="ml-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </div>`;
  }
  return html`<div
      role="menuitem"
      aria-disabled=${e.disabled ? "true" : null}
      class=${base2 + " px-1.5 " + hover + dim}
      @pointerenter=${() => top && __privateGet(this, _sub3).set(-1)}
      @click=${() => __privateMethod(this, _ShadMenubar_instances, run_fn3).call(this, e)}
    >
      ${when(e.icon, () => e.icon)}
      <span class="flex-1">${e.label}</span>
      ${when(e.shortcut, () => html`<span class="ml-auto text-xs tracking-widest text-muted-foreground">${e.shortcut}</span>`)}
    </div>`;
};
panel_fn3 = function(entries, top, style) {
  return html`<div
      role="menu"
      data-menu
      class="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style=${style}
    >
      ${map(entries, (e, i) => __privateMethod(this, _ShadMenubar_instances, row_fn5).call(this, e, i, top))}
    </div>`;
};
__decorateElement(_init66, 5, "menus", _menus_dec, ShadMenubar);
ShadMenubar = __decorateElement(_init66, 0, "ShadMenubar", _ShadMenubar_decorators, ShadMenubar);
__publicField(ShadMenubar, "styles", [tw, css`:host { display: inline-block; }`]);
__runInitializers(_init66, 1, ShadMenubar);

// packages/dom-ui-shad/src/ui/navigation-menu.ts
var TRIGGER = "inline-flex h-9 w-max cursor-default items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";
var _items_dec5, _a67, _ShadNavigationMenu_decorators, _init67, _open5, _left, _openT, _closeT, _ShadNavigationMenu_instances, scheduleOpen_fn, scheduleClose_fn, hardClose_fn, panelBody_fn;
_ShadNavigationMenu_decorators = [Component.define()];
var ShadNavigationMenu = class extends (_a67 = Component("shad-navigation-menu"), _items_dec5 = [Component.prop()], _a67) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadNavigationMenu_instances);
    __publicField(this, "items", __runInitializers(_init67, 8, this, [])), __runInitializers(_init67, 11, this);
    __privateAdd(this, _open5, this.signal(-1));
    __privateAdd(this, _left, this.signal(0));
    __privateAdd(this, _openT, 0);
    __privateAdd(this, _closeT, 0);
  }
  onMount() {
    addEventListener("scroll", () => __privateGet(this, _open5).call(this) >= 0 && __privateMethod(this, _ShadNavigationMenu_instances, hardClose_fn).call(this), { capture: true, passive: true, signal: this.abortSignal });
  }
  render() {
    const open = __privateGet(this, _open5).call(this);
    return html`<nav>
      <ul class="flex w-max items-center gap-1 rounded-lg border border-border bg-background p-1">
        ${map(this.items, (item, i) => {
      if (item.href != null && !item.links && !item.content) {
        return html`<li><a href=${item.href} class=${TRIGGER}>${item.label}</a></li>`;
      }
      return html`<li class="relative">
            <button
              type="button"
              data-nav-trigger
              data-open=${open === i ? "" : null}
              aria-expanded=${String(open === i)}
              class=${TRIGGER + (open === i ? " bg-muted" : "")}
              @pointerenter=${() => __privateMethod(this, _ShadNavigationMenu_instances, scheduleOpen_fn).call(this, i)}
              @pointerleave=${() => __privateMethod(this, _ShadNavigationMenu_instances, scheduleClose_fn).call(this)}
              @focusin=${() => __privateMethod(this, _ShadNavigationMenu_instances, scheduleOpen_fn).call(this, i)}
              @click=${() => open === i ? __privateMethod(this, _ShadNavigationMenu_instances, hardClose_fn).call(this) : __privateMethod(this, _ShadNavigationMenu_instances, scheduleOpen_fn).call(this, i)}
            >
              ${item.label}
              <svg class="chev relative top-px size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </li>`;
    })}
      </ul>
      ${when(
      open >= 0,
      () => html`<div
          data-panel
          data-open
          class="absolute top-full z-50 mt-1.5 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          style=${`left:${__privateGet(this, _left).call(this)}px`}
          @pointerenter=${() => clearTimeout(__privateGet(this, _closeT))}
          @pointerleave=${() => __privateMethod(this, _ShadNavigationMenu_instances, scheduleClose_fn).call(this)}
        >
          ${__privateMethod(this, _ShadNavigationMenu_instances, panelBody_fn).call(this, this.items[open])}
        </div>`
    )}
    </nav>`;
  }
};
_init67 = __decoratorStart(_a67);
_open5 = new WeakMap();
_left = new WeakMap();
_openT = new WeakMap();
_closeT = new WeakMap();
_ShadNavigationMenu_instances = new WeakSet();
scheduleOpen_fn = function(i) {
  clearTimeout(__privateGet(this, _closeT));
  if (__privateGet(this, _open5).call(this) === i) return;
  const delay = __privateGet(this, _open5).call(this) >= 0 ? 0 : 150;
  __privateSet(this, _openT, window.setTimeout(() => {
    const triggers = this.shadowRoot.querySelectorAll("[data-nav-trigger]");
    const t = triggers[i];
    if (t) __privateGet(this, _left).set(t.offsetLeft);
    __privateGet(this, _open5).set(i);
  }, delay));
};
scheduleClose_fn = function() {
  clearTimeout(__privateGet(this, _openT));
  __privateSet(this, _closeT, window.setTimeout(() => __privateGet(this, _open5).set(-1), 150));
};
hardClose_fn = function() {
  clearTimeout(__privateGet(this, _openT));
  clearTimeout(__privateGet(this, _closeT));
  __privateGet(this, _open5).set(-1);
};
panelBody_fn = function(item) {
  if (item.content) return item.content;
  return html`<ul class=${"grid gap-1 p-2 " + (item.width ?? "w-[420px]")} style=${item.cols ? `grid-template-columns:repeat(${item.cols},minmax(0,1fr))` : ""}>
      ${map(
    item.links ?? [],
    (l) => html`<li>
          <a
            href=${l.href}
            class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-muted focus:bg-muted"
            @click=${() => __privateMethod(this, _ShadNavigationMenu_instances, hardClose_fn).call(this)}
          >
            <div class="text-sm font-medium leading-none">${l.title}</div>
            ${when(l.description, () => html`<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">${l.description}</p>`)}
          </a>
        </li>`
  )}
    </ul>`;
};
__decorateElement(_init67, 5, "items", _items_dec5, ShadNavigationMenu);
ShadNavigationMenu = __decorateElement(_init67, 0, "ShadNavigationMenu", _ShadNavigationMenu_decorators, ShadNavigationMenu);
__publicField(ShadNavigationMenu, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      nav { position: relative; }
      .chev { transition: transform 0.3s; }
      [data-open] .chev { transform: rotate(180deg); }
      [data-panel] { animation: navIn 0.15s ease-out; }
      @keyframes navIn { from { opacity: 0; transform: translateY(-4px); } }
    `
]);
__runInitializers(_init67, 1, ShadNavigationMenu);

// packages/dom-ui-shad/src/ui/textarea.ts
var _onInput_dec2, _disabled_dec10, _rows_dec2, _value_dec7, _placeholder_dec6, _a68, _ShadTextarea_decorators, _init68;
_ShadTextarea_decorators = [Component.define()];
var ShadTextarea = class extends (_a68 = Component("shad-textarea"), _placeholder_dec6 = [Component.prop({ attribute: true })], _value_dec7 = [Component.prop({ attribute: true })], _rows_dec2 = [Component.prop({ attribute: true })], _disabled_dec10 = [Component.prop({ attribute: true })], _onInput_dec2 = [Component.event()], _a68) {
  constructor() {
    super(...arguments);
    __runInitializers(_init68, 5, this);
    __publicField(this, "placeholder", __runInitializers(_init68, 8, this, "")), __runInitializers(_init68, 11, this);
    __publicField(this, "value", __runInitializers(_init68, 12, this, "")), __runInitializers(_init68, 15, this);
    __publicField(this, "rows", __runInitializers(_init68, 16, this, 3)), __runInitializers(_init68, 19, this);
    __publicField(this, "disabled", __runInitializers(_init68, 20, this, false)), __runInitializers(_init68, 23, this);
  }
  onInput(e) {
    this.value = e.target.value;
    this.emit("input", this.value);
  }
  render() {
    return html`
      <textarea
        class=${cn(
      "flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
      "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    )}
        placeholder=${this.placeholder}
        rows=${this.rows}
        .value=${this.value}
        .disabled=${this.disabled}
        @input=${this.onInput}
      ></textarea>
    `;
  }
};
_init68 = __decoratorStart(_a68);
__decorateElement(_init68, 1, "onInput", _onInput_dec2, ShadTextarea);
__decorateElement(_init68, 5, "placeholder", _placeholder_dec6, ShadTextarea);
__decorateElement(_init68, 5, "value", _value_dec7, ShadTextarea);
__decorateElement(_init68, 5, "rows", _rows_dec2, ShadTextarea);
__decorateElement(_init68, 5, "disabled", _disabled_dec10, ShadTextarea);
ShadTextarea = __decorateElement(_init68, 0, "ShadTextarea", _ShadTextarea_decorators, ShadTextarea);
__publicField(ShadTextarea, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init68, 1, ShadTextarea);

// packages/dom-ui-shad/src/ui/progress.ts
var _value_dec8, _a69, _ShadProgress_decorators, _init69;
_ShadProgress_decorators = [Component.define()];
var ShadProgress = class extends (_a69 = Component("shad-progress"), _value_dec8 = [Component.prop({ attribute: true })], _a69) {
  constructor() {
    super(...arguments);
    __publicField(this, "value", __runInitializers(_init69, 8, this, 0)), __runInitializers(_init69, 11, this);
  }
  // 0–100
  render() {
    const pct = Math.max(0, Math.min(100, this.value));
    return html`
      <div
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${String(pct)}
        class=${cn("relative flex h-1 w-full items-center overflow-hidden rounded-full bg-muted")}
      >
        <div
          class="size-full flex-1 bg-primary transition-all"
          style=${styleMap({ transform: `translateX(-${100 - pct}%)` })}
        ></div>
      </div>
    `;
  }
};
_init69 = __decoratorStart(_a69);
__decorateElement(_init69, 5, "value", _value_dec8, ShadProgress);
ShadProgress = __decorateElement(_init69, 0, "ShadProgress", _ShadProgress_decorators, ShadProgress);
__publicField(ShadProgress, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init69, 1, ShadProgress);

// packages/dom-ui-shad/src/ui/resizable.ts
var _orientation_dec6, _a70, _ShadResizablePanelGroup_decorators, _init70, _ShadResizablePanelGroup_instances, horizontal_fn, panelsAround_fn, grow_fn, apply_fn, emitLayout_fn;
_ShadResizablePanelGroup_decorators = [Component.define()];
var ShadResizablePanelGroup = class extends (_a70 = Component("shad-resizable-panel-group"), _orientation_dec6 = [Component.prop({ attribute: true, reflect: true })], _a70) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadResizablePanelGroup_instances);
    __publicField(this, "orientation", __runInitializers(_init70, 8, this, "horizontal")), __runInitializers(_init70, 11, this);
  }
  onMount() {
    const panels = [...this.children].filter((c) => c.tagName === "SHAD-RESIZABLE-PANEL");
    panels.forEach((p) => {
      const ds = parseFloat(p.getAttribute("default-size") || "");
      p.style.flexGrow = String(isNaN(ds) ? 100 / panels.length : ds);
    });
    for (const h of this.children) {
      if (h.tagName !== "SHAD-RESIZABLE-HANDLE") continue;
      const pair = __privateMethod(this, _ShadResizablePanelGroup_instances, panelsAround_fn).call(this, h);
      if (!pair) continue;
      const [prev, next] = pair;
      const total = __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, prev) + __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, next);
      if (total) h.setAttribute("aria-valuenow", String(Math.round(__privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, prev) / total * 100)));
    }
    this.addEventListener("pointerdown", (e) => {
      const handle = e.composedPath().find((n) => n?.tagName === "SHAD-RESIZABLE-HANDLE");
      if (!handle) return;
      const pair = __privateMethod(this, _ShadResizablePanelGroup_instances, panelsAround_fn).call(this, handle);
      if (!pair) return;
      e.preventDefault();
      e.stopPropagation();
      const [prev, next] = pair;
      const horizontal = __privateMethod(this, _ShadResizablePanelGroup_instances, horizontal_fn).call(this);
      const groupPx = horizontal ? this.getBoundingClientRect().width : this.getBoundingClientRect().height;
      const start = horizontal ? e.clientX : e.clientY;
      const p0 = __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, prev), n0 = __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, next), total = p0 + n0;
      handle.setAttribute("data-separator", "active");
      const onMove = (ev) => {
        const pos = horizontal ? ev.clientX : ev.clientY;
        const frac = (pos - start) / groupPx * total;
        __privateMethod(this, _ShadResizablePanelGroup_instances, apply_fn).call(this, handle, prev, next, p0 + frac, n0 - frac, total);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        handle.setAttribute("data-separator", "inactive");
        document.body.style.userSelect = "";
      };
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp, { once: true });
    }, { signal: this.abortSignal });
    this.addEventListener("keydown", (e) => {
      const ke = e;
      const handle = e.composedPath().find((n) => n?.tagName === "SHAD-RESIZABLE-HANDLE");
      if (!handle) return;
      const pair = __privateMethod(this, _ShadResizablePanelGroup_instances, panelsAround_fn).call(this, handle);
      if (!pair) return;
      const horizontal = __privateMethod(this, _ShadResizablePanelGroup_instances, horizontal_fn).call(this);
      const dec = horizontal ? "ArrowLeft" : "ArrowUp";
      const inc = horizontal ? "ArrowRight" : "ArrowDown";
      if (ke.key !== dec && ke.key !== inc) return;
      e.preventDefault();
      const [prev, next] = pair;
      const p0 = __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, prev), n0 = __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, next), total = p0 + n0;
      const step = total * 0.05 * (ke.key === inc ? 1 : -1);
      __privateMethod(this, _ShadResizablePanelGroup_instances, apply_fn).call(this, handle, prev, next, p0 + step, n0 - step, total);
    }, { signal: this.abortSignal });
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init70 = __decoratorStart(_a70);
_ShadResizablePanelGroup_instances = new WeakSet();
horizontal_fn = function() {
  return this.orientation !== "vertical";
};
panelsAround_fn = function(handle) {
  const kids = [...this.children];
  const i = kids.indexOf(handle);
  const prev = kids[i - 1], next = kids[i + 1];
  if (prev?.tagName === "SHAD-RESIZABLE-PANEL" && next?.tagName === "SHAD-RESIZABLE-PANEL") {
    return [prev, next];
  }
  return null;
};
grow_fn = function(p) {
  return parseFloat(p.style.flexGrow) || 0;
};
apply_fn = function(handle, prev, next, p, n, total) {
  const min = total * 0.05;
  if (p < min) n -= min - p, p = min;
  if (n < min) p -= min - n, n = min;
  prev.style.flexGrow = String(p);
  next.style.flexGrow = String(n);
  handle.setAttribute("aria-valuenow", String(Math.round(p / total * 100)));
  __privateMethod(this, _ShadResizablePanelGroup_instances, emitLayout_fn).call(this);
};
// Emit the whole group's layout as panel sizes in percent (sums to 100).
emitLayout_fn = function() {
  const panels = [...this.children].filter((c) => c.tagName === "SHAD-RESIZABLE-PANEL");
  const sum = panels.reduce((a, p) => a + __privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, p), 0) || 1;
  this.emit("resize", panels.map((p) => Math.round(__privateMethod(this, _ShadResizablePanelGroup_instances, grow_fn).call(this, p) / sum * 1e3) / 10));
};
__decorateElement(_init70, 5, "orientation", _orientation_dec6, ShadResizablePanelGroup);
ShadResizablePanelGroup = __decorateElement(_init70, 0, "ShadResizablePanelGroup", _ShadResizablePanelGroup_decorators, ShadResizablePanelGroup);
__publicField(ShadResizablePanelGroup, "styles", [
  tw,
  css`
      :host { display: flex; height: 100%; width: 100%; overflow: hidden; background: hsl(var(--background)); }
      :host([orientation="vertical"]) { flex-direction: column; }
      slot { display: contents; }
    `
]);
__runInitializers(_init70, 1, ShadResizablePanelGroup);
var _defaultSize_dec, _a71, _ShadResizablePanel_decorators, _init71;
_ShadResizablePanel_decorators = [Component.define()];
var ShadResizablePanel = class extends (_a71 = Component("shad-resizable-panel"), _defaultSize_dec = [Component.prop({ attribute: "default-size" })], _a71) {
  constructor() {
    super(...arguments);
    __publicField(this, "defaultSize", __runInitializers(_init71, 8, this, "")), __runInitializers(_init71, 11, this);
  }
  render() {
    return html`<div class="min-h-0 min-w-0 flex-1 overflow-hidden"><slot></slot></div>`;
  }
};
_init71 = __decoratorStart(_a71);
__decorateElement(_init71, 5, "defaultSize", _defaultSize_dec, ShadResizablePanel);
ShadResizablePanel = __decorateElement(_init71, 0, "ShadResizablePanel", _ShadResizablePanel_decorators, ShadResizablePanel);
__publicField(ShadResizablePanel, "styles", [
  tw,
  css`
      :host { display: flex; overflow: hidden; flex-grow: 1; flex-shrink: 1; flex-basis: 0; min-width: 0; min-height: 0; }
      slot { display: contents; }
    `
]);
__runInitializers(_init71, 1, ShadResizablePanel);
var _withHandle_dec, _a72, _ShadResizableHandle_decorators, _init72;
_ShadResizableHandle_decorators = [Component.define()];
var ShadResizableHandle = class extends (_a72 = Component("shad-resizable-handle"), _withHandle_dec = [Component.prop({ attribute: "with-handle" })], _a72) {
  constructor() {
    super(...arguments);
    __publicField(this, "withHandle", __runInitializers(_init72, 8, this, false)), __runInitializers(_init72, 11, this);
  }
  onMount() {
    this.setAttribute("role", "separator");
    this.setAttribute("tabindex", "0");
    this.setAttribute("aria-valuemin", "0");
    this.setAttribute("aria-valuemax", "100");
    const vertical = this.closest('shad-resizable-panel-group[orientation="vertical"]') != null;
    this.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
    this.setAttribute("data-separator", "inactive");
  }
  render() {
    return this.withHandle ? html`<div class="grip"></div>` : html``;
  }
};
_init72 = __decoratorStart(_a72);
__decorateElement(_init72, 5, "withHandle", _withHandle_dec, ShadResizableHandle);
ShadResizableHandle = __decorateElement(_init72, 0, "ShadResizableHandle", _ShadResizableHandle_decorators, ShadResizableHandle);
__publicField(ShadResizableHandle, "styles", [
  tw,
  css`
      :host {
        position: relative;
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        background: hsl(var(--border));
        outline: none;
        width: 1px;
        cursor: col-resize;
        touch-action: none;
      }
      :host(:focus-visible) { box-shadow: 0 0 0 1px hsl(var(--ring)); }
      /* Vertical group → a horizontal divider. */
      :host-context(shad-resizable-panel-group[orientation="vertical"]) { width: auto; height: 1px; cursor: row-resize; }
      .grip { z-index: 10; display: flex; height: 1.5rem; width: 0.25rem; flex-shrink: 0; border-radius: 0.5rem; background: hsl(var(--border)); }
      :host-context(shad-resizable-panel-group[orientation="vertical"]) .grip { height: 0.25rem; width: 1.5rem; }
    `
]);
__runInitializers(_init72, 1, ShadResizableHandle);

// packages/dom-ui-shad/src/ui/radio-group.ts
var _invalid_dec6, _disabled_dec11, _value_dec9, _a73, _ShadRadioGroup_decorators, _init73, _ShadRadioGroup_instances, items_fn, select_fn3, sync_fn;
_ShadRadioGroup_decorators = [Component.define()];
var ShadRadioGroup = class extends (_a73 = Component("shad-radio-group"), _value_dec9 = [Component.prop({ attribute: true, reflect: true })], _disabled_dec11 = [Component.prop({ attribute: true })], _invalid_dec6 = [Component.prop({ attribute: true })], _a73) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadRadioGroup_instances);
    __publicField(this, "value", __runInitializers(_init73, 8, this, "")), __runInitializers(_init73, 11, this);
    __publicField(this, "disabled", __runInitializers(_init73, 12, this, false)), __runInitializers(_init73, 15, this);
    __publicField(this, "invalid", __runInitializers(_init73, 16, this, false)), __runInitializers(_init73, 19, this);
  }
  onMount() {
    this.addEventListener("click", (e) => {
      const item = e.composedPath().find((n) => n?.tagName === "SHAD-RADIO-GROUP-ITEM");
      if (item && !item.disabled && !this.disabled) __privateMethod(this, _ShadRadioGroup_instances, select_fn3).call(this, item.value);
    }, { signal: this.abortSignal });
    this.addEventListener("keydown", (e) => {
      const k = e.key;
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(k)) return;
      e.preventDefault();
      const items = __privateMethod(this, _ShadRadioGroup_instances, items_fn).call(this).filter((i) => !i.disabled);
      if (!items.length) return;
      const cur = items.findIndex((i) => i.value === this.value);
      const dir = k === "ArrowDown" || k === "ArrowRight" ? 1 : -1;
      const next = items[(cur + dir + items.length) % items.length];
      __privateMethod(this, _ShadRadioGroup_instances, select_fn3).call(this, next.value);
      next.focus?.();
    }, { signal: this.abortSignal });
    __privateMethod(this, _ShadRadioGroup_instances, sync_fn).call(this);
  }
  // Re-sync children after any (re)render — covers programmatic `value` changes.
  onUpdate() {
    __privateMethod(this, _ShadRadioGroup_instances, sync_fn).call(this);
  }
  render() {
    return html`<div role="radiogroup" aria-required="false" class="grid gap-3"><slot @slotchange=${() => __privateMethod(this, _ShadRadioGroup_instances, sync_fn).call(this)}></slot></div>`;
  }
};
_init73 = __decoratorStart(_a73);
_ShadRadioGroup_instances = new WeakSet();
items_fn = function() {
  return [...this.querySelectorAll("shad-radio-group-item")];
};
select_fn3 = function(v) {
  if (v === this.value) return;
  this.value = v;
  __privateMethod(this, _ShadRadioGroup_instances, sync_fn).call(this);
  this.emit("change", v);
};
sync_fn = function() {
  for (const it of __privateMethod(this, _ShadRadioGroup_instances, items_fn).call(this)) {
    it.checked = it.value === this.value;
    it.invalid = this.invalid;
    if (this.disabled) it.disabled = true;
  }
};
__decorateElement(_init73, 5, "value", _value_dec9, ShadRadioGroup);
__decorateElement(_init73, 5, "disabled", _disabled_dec11, ShadRadioGroup);
__decorateElement(_init73, 5, "invalid", _invalid_dec6, ShadRadioGroup);
ShadRadioGroup = __decorateElement(_init73, 0, "ShadRadioGroup", _ShadRadioGroup_decorators, ShadRadioGroup);
__publicField(ShadRadioGroup, "styles", [tw, css`:host { display: block; } slot { display: contents; }`]);
__runInitializers(_init73, 1, ShadRadioGroup);
var _invalid_dec7, _disabled_dec12, _checked_dec3, _value_dec10, _a74, _ShadRadioGroupItem_decorators, _init74;
_ShadRadioGroupItem_decorators = [Component.define()];
var ShadRadioGroupItem = class extends (_a74 = Component("shad-radio-group-item"), _value_dec10 = [Component.prop({ attribute: true })], _checked_dec3 = [Component.prop({ attribute: true, reflect: true })], _disabled_dec12 = [Component.prop({ attribute: true })], _invalid_dec7 = [Component.prop({ attribute: true })], _a74) {
  constructor() {
    super(...arguments);
    __publicField(this, "value", __runInitializers(_init74, 8, this, "")), __runInitializers(_init74, 11, this);
    __publicField(this, "checked", __runInitializers(_init74, 12, this, false)), __runInitializers(_init74, 15, this);
    __publicField(this, "disabled", __runInitializers(_init74, 16, this, false)), __runInitializers(_init74, 19, this);
    __publicField(this, "invalid", __runInitializers(_init74, 20, this, false)), __runInitializers(_init74, 23, this);
  }
  /** Delegate focus to the inner button (host has no tabindex). */
  focus(opts) {
    this.shadowRoot?.querySelector("button")?.focus(opts);
  }
  render() {
    return html`<button
      type="button"
      role="radio"
      aria-checked=${String(this.checked)}
      aria-invalid=${this.invalid ? "true" : "false"}
      data-state=${this.checked ? "checked" : "unchecked"}
      class=${"relative flex aspect-square size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 " + (this.invalid ? "border-destructive " : "") + (this.checked ? "border-primary bg-primary" : "border-input")}
      .disabled=${this.disabled}
    >
      ${when(
      this.checked,
      () => html`<span class="size-2 rounded-full bg-primary-foreground"></span>`
    )}
    </button>`;
  }
};
_init74 = __decoratorStart(_a74);
__decorateElement(_init74, 5, "value", _value_dec10, ShadRadioGroupItem);
__decorateElement(_init74, 5, "checked", _checked_dec3, ShadRadioGroupItem);
__decorateElement(_init74, 5, "disabled", _disabled_dec12, ShadRadioGroupItem);
__decorateElement(_init74, 5, "invalid", _invalid_dec7, ShadRadioGroupItem);
ShadRadioGroupItem = __decorateElement(_init74, 0, "ShadRadioGroupItem", _ShadRadioGroupItem_decorators, ShadRadioGroupItem);
__publicField(ShadRadioGroupItem, "styles", [tw, css`:host { display: inline-flex; }`]);
__runInitializers(_init74, 1, ShadRadioGroupItem);

// packages/dom-ui-shad/src/ui/pagination.ts
var CHEV_LEFT = html`<svg class="rtl-flip h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>`;
var CHEV_RIGHT = html`<svg class="rtl-flip h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
var ELLIPSIS = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>`;
var _hrefFor_dec, _iconsOnly_dec, _siblings_dec, _total_dec, _page_dec, _a75, _ShadPagination_decorators, _init75, _ShadPagination_instances, go_fn, pages_fn, cell_fn;
_ShadPagination_decorators = [Component.define()];
var ShadPagination = class extends (_a75 = Component("shad-pagination"), _page_dec = [Component.prop({ attribute: true })], _total_dec = [Component.prop({ attribute: true })], _siblings_dec = [Component.prop({ attribute: true })], _iconsOnly_dec = [Component.prop({ attribute: "icons-only" })], _hrefFor_dec = [Component.prop()], _a75) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadPagination_instances);
    __publicField(this, "page", __runInitializers(_init75, 8, this, 1)), __runInitializers(_init75, 11, this);
    __publicField(this, "total", __runInitializers(_init75, 12, this, 1)), __runInitializers(_init75, 15, this);
    __publicField(this, "siblings", __runInitializers(_init75, 16, this, 1)), __runInitializers(_init75, 19, this);
    __publicField(this, "iconsOnly", __runInitializers(_init75, 20, this, false)), __runInitializers(_init75, 23, this);
    __publicField(this, "hrefFor", __runInitializers(_init75, 24, this)), __runInitializers(_init75, 27, this);
  }
  render() {
    const pages = __privateMethod(this, _ShadPagination_instances, pages_fn).call(this);
    const base2 = "inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
    const ghostIcon = base2 + " size-9 hover:bg-muted hover:text-accent-foreground";
    const activeIcon = base2 + " size-9 border border-border bg-background hover:bg-muted";
    const edge = base2 + (this.iconsOnly ? " size-9 hover:bg-muted" : " h-9 gap-1 px-2.5 hover:bg-muted");
    return html`<nav role="navigation" aria-label="pagination" class="mx-auto flex w-full justify-center">
      <ul class="flex items-center gap-1">
        <li>
          ${__privateMethod(this, _ShadPagination_instances, cell_fn).call(this, this.page - 1, edge, this.iconsOnly ? CHEV_LEFT : html`${CHEV_LEFT}<span class="hidden sm:block">Previous</span>`, "Go to previous page", this.page <= 1)}
        </li>
        ${map(
      pages,
      (p) => p === "…" ? html`<li><span aria-hidden="true" class="flex size-9 items-center justify-center text-muted-foreground">${ELLIPSIS}<span class="sr-only">More pages</span></span></li>` : html`<li>${__privateMethod(this, _ShadPagination_instances, cell_fn).call(this, p, p === this.page ? activeIcon : ghostIcon, String(p), `Go to page ${p}`)}</li>`
    )}
        <li>
          ${__privateMethod(this, _ShadPagination_instances, cell_fn).call(this, this.page + 1, edge, this.iconsOnly ? CHEV_RIGHT : html`<span class="hidden sm:block">Next</span>${CHEV_RIGHT}`, "Go to next page", this.page >= this.total)}
        </li>
      </ul>
    </nav>`;
  }
};
_init75 = __decoratorStart(_a75);
_ShadPagination_instances = new WeakSet();
go_fn = function(p) {
  if (p < 1 || p > this.total || p === this.page) return;
  this.page = p;
  this.emit("change", p);
};
// Page numbers with "…" gaps: always first + last, plus current ± siblings.
pages_fn = function() {
  const total = Math.max(1, this.total);
  const keep = /* @__PURE__ */ new Set([1, total]);
  for (let i = this.page - this.siblings; i <= this.page + this.siblings; i++) {
    if (i >= 1 && i <= total) keep.add(i);
  }
  const sorted = [...keep].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const n of sorted) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
};
// A clickable cell: an <a> when hrefFor is set, else a <button>.
cell_fn = function(p, cls, body, label, disabled = false) {
  const onClick = (e) => {
    if (disabled) return e.preventDefault();
    if (!this.hrefFor) e.preventDefault();
    __privateMethod(this, _ShadPagination_instances, go_fn).call(this, p);
  };
  if (this.hrefFor && !disabled) {
    return html`<a href=${this.hrefFor(p)} aria-label=${label ?? null} class=${cls} @click=${onClick}>${body}</a>`;
  }
  return html`<button type="button" aria-label=${label ?? null} class=${cls + (disabled ? " pointer-events-none opacity-50" : "")} .disabled=${disabled} @click=${onClick}>${body}</button>`;
};
__decorateElement(_init75, 5, "page", _page_dec, ShadPagination);
__decorateElement(_init75, 5, "total", _total_dec, ShadPagination);
__decorateElement(_init75, 5, "siblings", _siblings_dec, ShadPagination);
__decorateElement(_init75, 5, "iconsOnly", _iconsOnly_dec, ShadPagination);
__decorateElement(_init75, 5, "hrefFor", _hrefFor_dec, ShadPagination);
ShadPagination = __decorateElement(_init75, 0, "ShadPagination", _ShadPagination_decorators, ShadPagination);
__publicField(ShadPagination, "styles", [
  tw,
  css`
      :host { display: block; }
      /* RTL: flip the prev/next chevrons (the row order mirrors on its own). */
      :host-context([dir="rtl"]) .rtl-flip { transform: scaleX(-1); }
    `
]);
__runInitializers(_init75, 1, ShadPagination);

// packages/dom-ui-shad/src/ui/toggle.ts
var toggleClass = variants(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variant: {
      default: "bg-transparent",
      outline: "border border-border bg-transparent hover:bg-accent"
    },
    size: { default: "h-10 px-3", sm: "h-9 px-2.5", lg: "h-11 px-5" }
  },
  { variant: "default", size: "default" }
);
var _toggle_dec4, _disabled_dec13, _size_dec6, _variant_dec7, _pressed_dec, _a76, _ShadToggle_decorators, _init76;
_ShadToggle_decorators = [Component.define()];
var ShadToggle = class extends (_a76 = Component("shad-toggle"), _pressed_dec = [Component.prop({ attribute: true })], _variant_dec7 = [Component.prop({ attribute: true })], _size_dec6 = [Component.prop({ attribute: true })], _disabled_dec13 = [Component.prop({ attribute: true })], _toggle_dec4 = [Component.event()], _a76) {
  constructor() {
    super(...arguments);
    __runInitializers(_init76, 5, this);
    __publicField(this, "pressed", __runInitializers(_init76, 8, this, false)), __runInitializers(_init76, 11, this);
    __publicField(this, "variant", __runInitializers(_init76, 12, this, "default")), __runInitializers(_init76, 15, this);
    __publicField(this, "size", __runInitializers(_init76, 16, this, "default")), __runInitializers(_init76, 19, this);
    __publicField(this, "disabled", __runInitializers(_init76, 20, this, false)), __runInitializers(_init76, 23, this);
  }
  toggle() {
    if (this.disabled) return;
    this.pressed = !this.pressed;
    this.emit("change", this.pressed);
  }
  render() {
    return html`
      <button
        aria-pressed=${String(this.pressed)}
        class=${classMap({
      [toggleClass({ variant: this.variant, size: this.size })]: true,
      "bg-input text-foreground": this.pressed
    })}
        .disabled=${this.disabled}
        @click=${this.toggle}
      >
        <slot></slot>
      </button>
    `;
  }
};
_init76 = __decoratorStart(_a76);
__decorateElement(_init76, 1, "toggle", _toggle_dec4, ShadToggle);
__decorateElement(_init76, 5, "pressed", _pressed_dec, ShadToggle);
__decorateElement(_init76, 5, "variant", _variant_dec7, ShadToggle);
__decorateElement(_init76, 5, "size", _size_dec6, ShadToggle);
__decorateElement(_init76, 5, "disabled", _disabled_dec13, ShadToggle);
ShadToggle = __decorateElement(_init76, 0, "ShadToggle", _ShadToggle_decorators, ShadToggle);
__publicField(ShadToggle, "styles", [tw, css`:host { display: inline-block }`]);
__runInitializers(_init76, 1, ShadToggle);

// packages/dom-ui-shad/src/ui/tabs.ts
var _active_dec3, _title_dec, _value_dec11, _a77, _ShadTab_decorators, _init77;
_ShadTab_decorators = [Component.define()];
var ShadTab = class extends (_a77 = Component("shad-tab"), _value_dec11 = [Component.prop({ attribute: true })], _title_dec = [Component.prop({ attribute: true })], _active_dec3 = [Component.prop({ reflect: true })], _a77) {
  constructor() {
    super(...arguments);
    __publicField(this, "value", __runInitializers(_init77, 8, this, "")), __runInitializers(_init77, 11, this);
    __publicField(this, "title", __runInitializers(_init77, 12, this, "")), __runInitializers(_init77, 15, this);
    __publicField(this, "active", __runInitializers(_init77, 16, this, false)), __runInitializers(_init77, 19, this);
  }
  render() {
    return html`<div role="tabpanel" class="mt-2 text-sm"><slot></slot></div>`;
  }
};
_init77 = __decoratorStart(_a77);
__decorateElement(_init77, 5, "value", _value_dec11, ShadTab);
__decorateElement(_init77, 5, "title", _title_dec, ShadTab);
__decorateElement(_init77, 5, "active", _active_dec3, ShadTab);
ShadTab = __decorateElement(_init77, 0, "ShadTab", _ShadTab_decorators, ShadTab);
__publicField(ShadTab, "styles", [tw, css`
    :host { display: block }
    :host(:not([active])) { display: none }
  `]);
__runInitializers(_init77, 1, ShadTab);
var _value_dec12, _a78, _ShadTabs_decorators, _init78, _ShadTabs_instances, tabs_fn, sync_fn2, select_fn4;
_ShadTabs_decorators = [Component.define()];
var ShadTabs = class extends (_a78 = Component("shad-tabs"), _value_dec12 = [Component.prop({ attribute: true })], _a78) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadTabs_instances);
    __publicField(this, "value", __runInitializers(_init78, 8, this, "")), __runInitializers(_init78, 11, this);
  }
  onMount() {
    __privateMethod(this, _ShadTabs_instances, sync_fn2).call(this);
    this.shadowRoot?.querySelector("slot")?.addEventListener("slotchange", () => __privateMethod(this, _ShadTabs_instances, sync_fn2).call(this), {
      signal: this.abortSignal
    });
  }
  render() {
    const tabs = __privateMethod(this, _ShadTabs_instances, tabs_fn).call(this).map((t) => ({
      value: t.getAttribute("value") ?? "",
      title: t.getAttribute("title") || t.getAttribute("value") || ""
    }));
    return html`
      <div
        role="tablist"
        class="inline-flex h-10 items-center justify-center rounded-md bg-secondary p-1 text-muted-foreground"
      >
        ${map(
      tabs,
      (t) => html`<button
            role="tab"
            aria-selected=${String(t.value === this.value)}
            class=${classMap({
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring": true,
        "bg-background text-foreground shadow-sm": t.value === this.value
      })}
            @click=${() => __privateMethod(this, _ShadTabs_instances, select_fn4).call(this, t.value)}
          >
            ${t.title}
          </button>`
    )}
      </div>
      <slot></slot>
    `;
  }
};
_init78 = __decoratorStart(_a78);
_ShadTabs_instances = new WeakSet();
tabs_fn = function() {
  return [...this.querySelectorAll("shad-tab")];
};
// Flip each child's `active` prop; `reflect` mirrors it to the attribute so the
// child's `:host([active])` CSS shows the matching panel. Re-render the triggers.
sync_fn2 = function() {
  const tabs = __privateMethod(this, _ShadTabs_instances, tabs_fn).call(this);
  if (!this.value && tabs[0]) this.value = tabs[0].getAttribute("value") ?? "";
  for (const t of tabs) {
    t.active = t.getAttribute("value") === this.value;
  }
  this.requestUpdate();
};
select_fn4 = function(value) {
  this.value = value;
  __privateMethod(this, _ShadTabs_instances, sync_fn2).call(this);
};
__decorateElement(_init78, 5, "value", _value_dec12, ShadTabs);
ShadTabs = __decorateElement(_init78, 0, "ShadTabs", _ShadTabs_decorators, ShadTabs);
__publicField(ShadTabs, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init78, 1, ShadTabs);

// packages/dom-ui-shad/src/ui/dialog.ts
var X_ICON = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`;
var _stickyFooter_dec, _closeButton_dec, _open_dec3, _a79, _ShadDialog_decorators, _init79;
_ShadDialog_decorators = [Component.define()];
var ShadDialog = class extends (_a79 = Component("shad-dialog"), _open_dec3 = [Component.prop({ attribute: true })], _closeButton_dec = [Component.prop({ attribute: "close-button" })], _stickyFooter_dec = [Component.prop({ attribute: "sticky-footer" })], _a79) {
  constructor() {
    super(...arguments);
    __publicField(this, "open", __runInitializers(_init79, 8, this, false)), __runInitializers(_init79, 11, this);
    __publicField(this, "closeButton", __runInitializers(_init79, 12, this, true)), __runInitializers(_init79, 15, this);
    __publicField(this, "stickyFooter", __runInitializers(_init79, 16, this, false)), __runInitializers(_init79, 19, this);
  }
  show() {
    this.open = true;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit("close");
  }
  onMount() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.open && e.key === "Escape") this.close();
      },
      { signal: this.abortSignal }
    );
  }
  // Lock page scroll while open; restore when closed or removed.
  onUpdate() {
    if (typeof document !== "undefined") document.body.style.overflow = this.open ? "hidden" : "";
  }
  onUnmount() {
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }
  render() {
    if (!this.open) return html``;
    const footerClass = this.stickyFooter ? "-mx-6 -mb-6 mt-2 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end" : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
    return html`
      <div
        class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0"
        @click=${() => this.close()}
      ></div>
      <div
        role="dialog"
        aria-modal="true"
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-popover p-6 text-sm text-popover-foreground shadow-lg outline-none sm:max-w-lg"
        tabindex="-1"
        @click=${(e) => e.stopPropagation()}
      >
        <div class="flex flex-col gap-2">
          <h2 class="text-base font-medium leading-none"><slot name="title"></slot></h2>
          <p class="text-sm text-muted-foreground"><slot name="description"></slot></p>
        </div>
        <div class="-mx-6 min-h-0 flex-1 overflow-y-auto px-6"><slot></slot></div>
        <div class=${footerClass}><slot name="footer"></slot></div>
        <div class="absolute right-3 top-3">
          <slot name="close">${when(this.closeButton, () => html`<button
            type="button"
            aria-label="Close"
            class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click=${() => this.close()}
          >${X_ICON}<span class="sr-only">Close</span></button>`)}</slot>
        </div>
      </div>
    `;
  }
};
_init79 = __decoratorStart(_a79);
__decorateElement(_init79, 5, "open", _open_dec3, ShadDialog);
__decorateElement(_init79, 5, "closeButton", _closeButton_dec, ShadDialog);
__decorateElement(_init79, 5, "stickyFooter", _stickyFooter_dec, ShadDialog);
ShadDialog = __decorateElement(_init79, 0, "ShadDialog", _ShadDialog_decorators, ShadDialog);
__publicField(ShadDialog, "styles", [tw, css`:host { display: contents; }`]);
__runInitializers(_init79, 1, ShadDialog);

// packages/dom-ui-shad/src/ui/drawer.ts
var _responsive_dec, _direction_dec, _open_dec4, _a80, _ShadDrawer_decorators, _init80, _wide, _ShadDrawer_instances, centered_fn, contentClass_fn;
_ShadDrawer_decorators = [Component.define()];
var ShadDrawer = class extends (_a80 = Component("shad-drawer"), _open_dec4 = [Component.prop({ attribute: true })], _direction_dec = [Component.prop({ attribute: true })], _responsive_dec = [Component.prop({ attribute: true })], _a80) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadDrawer_instances);
    __publicField(this, "open", __runInitializers(_init80, 8, this, false)), __runInitializers(_init80, 11, this);
    __publicField(this, "direction", __runInitializers(_init80, 12, this, "bottom")), __runInitializers(_init80, 15, this);
    __publicField(this, "responsive", __runInitializers(_init80, 16, this, false)), __runInitializers(_init80, 19, this);
    __privateAdd(this, _wide, this.signal(false));
  }
  // responsive: ≥ md viewport
  show() {
    this.open = true;
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit("close");
  }
  onMount() {
    document.addEventListener("keydown", (e) => {
      if (this.open && e.key === "Escape") this.close();
    }, { signal: this.abortSignal });
    if (typeof matchMedia !== "undefined") {
      const mq = matchMedia("(min-width: 768px)");
      __privateGet(this, _wide).set(mq.matches);
      mq.addEventListener("change", (e) => __privateGet(this, _wide).set(e.matches), { signal: this.abortSignal });
    }
  }
  onUpdate() {
    if (typeof document !== "undefined") document.body.style.overflow = this.open ? "hidden" : "";
  }
  onUnmount() {
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }
  render() {
    if (!this.open) return html``;
    const centered = __privateMethod(this, _ShadDrawer_instances, centered_fn).call(this);
    const stack = this.direction === "bottom" || this.direction === "top";
    const innerClass = !centered && stack ? "mx-auto flex w-full max-w-sm flex-1 flex-col min-h-0" : "flex flex-1 flex-col min-h-0";
    const headerAlign = !centered && stack ? "text-center md:text-left" : "text-left";
    return html`
      <div class="overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" @click=${() => this.close()}></div>
      <div role="dialog" aria-modal="true" tabindex="-1" class=${__privateMethod(this, _ShadDrawer_instances, contentClass_fn).call(this)} @click=${(e) => e.stopPropagation()}>
        ${when(
      !centered && this.direction === "bottom",
      () => html`<div class="mx-auto mt-4 h-1 w-[100px] shrink-0 rounded-full bg-muted"></div>`
    )}
        <div class=${innerClass}>
          <div class=${"flex flex-col gap-1 p-4 " + headerAlign}>
            <h2 class="text-base font-medium text-foreground"><slot name="title"></slot></h2>
            <p class="text-sm text-muted-foreground"><slot name="description"></slot></p>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4"><slot></slot></div>
          <div class="mt-auto flex flex-col gap-2 p-4"><slot name="footer"></slot></div>
        </div>
      </div>
    `;
  }
};
_init80 = __decoratorStart(_a80);
_wide = new WeakMap();
_ShadDrawer_instances = new WeakSet();
// Centered dialog when responsive on a wide screen; otherwise an edge drawer.
centered_fn = function() {
  return this.responsive && __privateGet(this, _wide).call(this);
};
contentClass_fn = function() {
  if (__privateMethod(this, _ShadDrawer_instances, centered_fn).call(this)) {
    return "zoom fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-popover text-sm text-popover-foreground shadow-lg outline-none";
  }
  const base2 = "fixed z-50 flex flex-col bg-popover text-sm text-popover-foreground outline-none";
  const byDir = {
    bottom: "slide-bottom inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-xl border-t border-border",
    top: "slide-top inset-x-0 top-0 mb-24 max-h-[80vh] rounded-b-xl border-b border-border",
    left: "slide-left inset-y-0 left-0 w-3/4 rounded-r-xl border-r border-border sm:max-w-sm",
    right: "slide-right inset-y-0 right-0 w-3/4 rounded-l-xl border-l border-border sm:max-w-sm"
  };
  return `${base2} ${byDir[this.direction]}`;
};
__decorateElement(_init80, 5, "open", _open_dec4, ShadDrawer);
__decorateElement(_init80, 5, "direction", _direction_dec, ShadDrawer);
__decorateElement(_init80, 5, "responsive", _responsive_dec, ShadDrawer);
ShadDrawer = __decorateElement(_init80, 0, "ShadDrawer", _ShadDrawer_decorators, ShadDrawer);
__publicField(ShadDrawer, "styles", [
  tw,
  css`
      :host { display: contents; }
      /* Slide-in per edge (and a fade/zoom when responsive-centered). */
      .slide-bottom { animation: slideBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .slide-top { animation: slideTop 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .slide-left { animation: slideLeft 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .slide-right { animation: slideRight 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .zoom { animation: zoomIn 0.15s ease-out; }
      @keyframes slideBottom { from { transform: translateY(100%); } }
      @keyframes slideTop { from { transform: translateY(-100%); } }
      @keyframes slideLeft { from { transform: translateX(-100%); } }
      @keyframes slideRight { from { transform: translateX(100%); } }
      @keyframes zoomIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } }
      @keyframes fadeIn { from { opacity: 0; } }
      .overlay { animation: fadeIn 0.2s ease-out; }
    `
]);
__runInitializers(_init80, 1, ShadDrawer);

// packages/dom-ui-shad/src/ui/empty.ts
var _variant_dec8, _a81, _ShadEmpty_decorators, _init81;
_ShadEmpty_decorators = [Component.define()];
var ShadEmpty = class extends (_a81 = Component("shad-empty"), _variant_dec8 = [Component.prop({ attribute: true })], _a81) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init81, 8, this, "default")), __runInitializers(_init81, 11, this);
  }
  render() {
    const variant = this.variant === "outline" ? " border border-dashed border-border bg-background" : this.variant === "background" ? " bg-gradient-to-b from-muted/50 to-background" : " bg-background";
    return html`<div
      data-slot="empty"
      class=${"flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl p-6 text-center" + variant}
    >
      <slot></slot>
    </div>`;
  }
};
_init81 = __decoratorStart(_a81);
__decorateElement(_init81, 5, "variant", _variant_dec8, ShadEmpty);
ShadEmpty = __decorateElement(_init81, 0, "ShadEmpty", _ShadEmpty_decorators, ShadEmpty);
__publicField(ShadEmpty, "styles", [tw, css`:host { display: flex; flex: 1 1 auto; } slot { display: contents; }`]);
__runInitializers(_init81, 1, ShadEmpty);
var _ShadEmptyHeader_decorators, _init82, _a82;
_ShadEmptyHeader_decorators = [Component.define()];
var ShadEmptyHeader = class extends (_a82 = Component("shad-empty-header")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div class="flex max-w-sm flex-col items-center gap-2"><slot></slot></div>`;
  }
};
_init82 = __decoratorStart(_a82);
ShadEmptyHeader = __decorateElement(_init82, 0, "ShadEmptyHeader", _ShadEmptyHeader_decorators, ShadEmptyHeader);
__runInitializers(_init82, 1, ShadEmptyHeader);
var _variant_dec9, _a83, _ShadEmptyMedia_decorators, _init83;
_ShadEmptyMedia_decorators = [Component.define()];
var ShadEmptyMedia = class extends (_a83 = Component("shad-empty-media"), _variant_dec9 = [Component.prop({ attribute: true })], _a83) {
  constructor() {
    super(...arguments);
    __publicField(this, "variant", __runInitializers(_init83, 8, this, "icon")), __runInitializers(_init83, 11, this);
  }
  render() {
    const cls = this.variant === "icon" ? "mb-2 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground" : "mb-2 flex shrink-0 items-center justify-center";
    return html`<div data-variant=${this.variant} class=${cls}><slot></slot></div>`;
  }
};
_init83 = __decoratorStart(_a83);
__decorateElement(_init83, 5, "variant", _variant_dec9, ShadEmptyMedia);
ShadEmptyMedia = __decorateElement(_init83, 0, "ShadEmptyMedia", _ShadEmptyMedia_decorators, ShadEmptyMedia);
__publicField(ShadEmptyMedia, "styles", [
  tw,
  css`
      :host { display: block; }
      slot { display: contents; }
      /* Size a slotted icon without forcing the consumer to add classes. */
      ::slotted(svg) { width: 1.25rem; height: 1.25rem; }
    `
]);
__runInitializers(_init83, 1, ShadEmptyMedia);
var _ShadEmptyTitle_decorators, _init84, _a84;
_ShadEmptyTitle_decorators = [Component.define()];
var ShadEmptyTitle = class extends (_a84 = Component("shad-empty-title")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div class="text-base font-medium tracking-tight"><slot></slot></div>`;
  }
};
_init84 = __decoratorStart(_a84);
ShadEmptyTitle = __decorateElement(_init84, 0, "ShadEmptyTitle", _ShadEmptyTitle_decorators, ShadEmptyTitle);
__runInitializers(_init84, 1, ShadEmptyTitle);
var _ShadEmptyDescription_decorators, _init85, _a85;
_ShadEmptyDescription_decorators = [Component.define()];
var ShadEmptyDescription = class extends (_a85 = Component("shad-empty-description")) {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  render() {
    return html`<div
      class="text-sm leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary"
    >
      <slot></slot>
    </div>`;
  }
};
_init85 = __decoratorStart(_a85);
ShadEmptyDescription = __decorateElement(_init85, 0, "ShadEmptyDescription", _ShadEmptyDescription_decorators, ShadEmptyDescription);
__runInitializers(_init85, 1, ShadEmptyDescription);
var _ShadEmptyContent_decorators, _init86, _a86;
_ShadEmptyContent_decorators = [Component.define()];
var ShadEmptyContent = class extends (_a86 = Component("shad-empty-content")) {
  static styles = [tw, css`:host { display: block; width: 100%; } slot { display: contents; }`];
  render() {
    return html`<div class="mx-auto flex w-full max-w-sm min-w-0 flex-row flex-wrap items-center justify-center gap-2 text-sm">
      <slot></slot>
    </div>`;
  }
};
_init86 = __decoratorStart(_a86);
ShadEmptyContent = __decorateElement(_init86, 0, "ShadEmptyContent", _ShadEmptyContent_decorators, ShadEmptyContent);
__runInitializers(_init86, 1, ShadEmptyContent);

// packages/dom-ui-shad/src/ui/alert-dialog.ts
var _size_dec7, _open_dec5, _a87, _ShadAlertDialog_decorators, _init87;
_ShadAlertDialog_decorators = [Component.define()];
var ShadAlertDialog = class extends (_a87 = Component("shad-alert-dialog"), _open_dec5 = [Component.prop({ attribute: true })], _size_dec7 = [Component.prop({ attribute: true })], _a87) {
  constructor() {
    super(...arguments);
    __publicField(this, "open", __runInitializers(_init87, 8, this, false)), __runInitializers(_init87, 11, this);
    __publicField(this, "size", __runInitializers(_init87, 12, this, "default")), __runInitializers(_init87, 15, this);
  }
  show() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.emit("close");
  }
  onMount() {
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.open && e.key === "Escape") this.close();
      },
      { signal: this.abortSignal }
    );
  }
  render() {
    if (!this.open) return html``;
    const hasMedia = !!this.querySelector('[slot="media"]');
    const maxW = this.size === "sm" ? "max-w-sm" : "max-w-lg";
    const center = hasMedia ? " text-center" : "";
    return html`
      <div class="overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="title"
          aria-describedby="desc"
          class=${cn("content relative grid w-full gap-4 rounded-lg border border-border bg-background p-6 shadow-lg", maxW)}
        >
          <div class=${hasMedia ? "overflow-hidden rounded-md" : "hidden"}><slot name="media"></slot></div>
          <div class=${"flex flex-col gap-2" + center}>
            <h2 id="title" class="text-lg font-semibold"><slot name="title"></slot></h2>
            <p id="desc" class="text-sm text-muted-foreground"><slot name="description"></slot></p>
          </div>
          <div class=${"flex flex-col-reverse gap-2 sm:flex-row " + (hasMedia ? "sm:justify-center" : "sm:justify-end")}>
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    `;
  }
};
_init87 = __decoratorStart(_a87);
__decorateElement(_init87, 5, "open", _open_dec5, ShadAlertDialog);
__decorateElement(_init87, 5, "size", _size_dec7, ShadAlertDialog);
ShadAlertDialog = __decorateElement(_init87, 0, "ShadAlertDialog", _ShadAlertDialog_decorators, ShadAlertDialog);
__publicField(ShadAlertDialog, "styles", [
  tw,
  css`
      :host { display: contents; }
      @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes content-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      .overlay { animation: overlay-in 150ms ease; }
      .content { animation: content-in 150ms ease; }
    `
]);
__runInitializers(_init87, 1, ShadAlertDialog);

// packages/dom-ui-shad/src/ui/tooltip.ts
var _text_dec, _a88, _ShadTooltip_decorators, _init88;
_ShadTooltip_decorators = [Component.define()];
var ShadTooltip = class extends (_a88 = Component("shad-tooltip"), _text_dec = [Component.prop({ attribute: true })], _a88) {
  constructor() {
    super(...arguments);
    __publicField(this, "text", __runInitializers(_init88, 8, this, "")), __runInitializers(_init88, 11, this);
  }
  render() {
    return html`
      <slot></slot>
      <span
        role="tooltip"
        class=${cn(
      "tip z-50 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md"
    )}
        data-slot="tooltip-content"
        >${this.text || html`<slot name="content"></slot>`}</span
      >
    `;
  }
};
_init88 = __decoratorStart(_a88);
__decorateElement(_init88, 5, "text", _text_dec, ShadTooltip);
ShadTooltip = __decorateElement(_init88, 0, "ShadTooltip", _ShadTooltip_decorators, ShadTooltip);
// Positioning + show/hide are local CSS (real `transform`, not Tailwind's
// var-based `translate-x`, so it works in a minimal Tailwind build).
__publicField(ShadTooltip, "styles", [
  tw,
  css`
      :host { display: inline-block; position: relative }
      .tip {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 6px;
        opacity: 0;
        transition: opacity 0.15s;
        pointer-events: none;
      }
      :host(:hover) .tip,
      :host(:focus-within) .tip { opacity: 1 }
    `
]);
__runInitializers(_init88, 1, ShadTooltip);

// packages/dom-ui-shad/src/ui/hover-card.ts
var _align_dec3, _side_dec2, _closeDelay_dec, _openDelay_dec, _a89, _ShadHoverCard_decorators, _init89, _open6, _x4, _y4, _openT2, _closeT2, _ShadHoverCard_instances, trigger_fn2, scheduleOpen_fn2, scheduleClose_fn2, hardClose_fn2, position_fn;
_ShadHoverCard_decorators = [Component.define()];
var ShadHoverCard = class extends (_a89 = Component("shad-hover-card"), _openDelay_dec = [Component.prop({ attribute: "open-delay" })], _closeDelay_dec = [Component.prop({ attribute: "close-delay" })], _side_dec2 = [Component.prop({ attribute: true })], _align_dec3 = [Component.prop({ attribute: true })], _a89) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadHoverCard_instances);
    __publicField(this, "openDelay", __runInitializers(_init89, 8, this, 700)), __runInitializers(_init89, 11, this);
    __publicField(this, "closeDelay", __runInitializers(_init89, 12, this, 300)), __runInitializers(_init89, 15, this);
    __publicField(this, "side", __runInitializers(_init89, 16, this, "bottom")), __runInitializers(_init89, 19, this);
    __publicField(this, "align", __runInitializers(_init89, 20, this, "center")), __runInitializers(_init89, 23, this);
    __privateAdd(this, _open6, this.signal(false));
    __privateAdd(this, _x4, this.signal(0));
    __privateAdd(this, _y4, this.signal(0));
    __privateAdd(this, _openT2, 0);
    __privateAdd(this, _closeT2, 0);
  }
  onMount() {
    addEventListener("scroll", () => __privateGet(this, _open6).call(this) && __privateMethod(this, _ShadHoverCard_instances, hardClose_fn2).call(this), { capture: true, passive: true, signal: this.abortSignal });
  }
  render() {
    return html`
      <slot
        @pointerenter=${() => __privateMethod(this, _ShadHoverCard_instances, scheduleOpen_fn2).call(this)}
        @pointerleave=${() => __privateMethod(this, _ShadHoverCard_instances, scheduleClose_fn2).call(this)}
        @focusin=${() => __privateMethod(this, _ShadHoverCard_instances, scheduleOpen_fn2).call(this)}
        @focusout=${() => __privateMethod(this, _ShadHoverCard_instances, scheduleClose_fn2).call(this)}
      ></slot>
      ${when(
      __privateGet(this, _open6).call(this),
      () => html`<div
          data-card
          role="dialog"
          class="fixed z-50 rounded-md border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none"
          style=${`left:${__privateGet(this, _x4).call(this)}px;top:${__privateGet(this, _y4).call(this)}px`}
          @pointerenter=${() => clearTimeout(__privateGet(this, _closeT2))}
          @pointerleave=${() => __privateMethod(this, _ShadHoverCard_instances, scheduleClose_fn2).call(this)}
        >
          <slot name="content"></slot>
        </div>`
    )}
    `;
  }
};
_init89 = __decoratorStart(_a89);
_open6 = new WeakMap();
_x4 = new WeakMap();
_y4 = new WeakMap();
_openT2 = new WeakMap();
_closeT2 = new WeakMap();
_ShadHoverCard_instances = new WeakSet();
trigger_fn2 = function() {
  return this.shadowRoot.querySelector("slot:not([name])").assignedElements()[0] ?? null;
};
scheduleOpen_fn2 = function() {
  clearTimeout(__privateGet(this, _closeT2));
  if (__privateGet(this, _open6).call(this)) return;
  __privateSet(this, _openT2, window.setTimeout(() => {
    __privateGet(this, _open6).set(true);
    requestAnimationFrame(() => __privateMethod(this, _ShadHoverCard_instances, position_fn).call(this));
  }, this.openDelay));
};
scheduleClose_fn2 = function() {
  clearTimeout(__privateGet(this, _openT2));
  __privateSet(this, _closeT2, window.setTimeout(() => __privateGet(this, _open6).set(false), this.closeDelay));
};
hardClose_fn2 = function() {
  clearTimeout(__privateGet(this, _openT2));
  clearTimeout(__privateGet(this, _closeT2));
  __privateGet(this, _open6).set(false);
};
position_fn = function() {
  const t = __privateMethod(this, _ShadHoverCard_instances, trigger_fn2).call(this);
  const card = this.shadowRoot.querySelector("[data-card]");
  if (!t || !card) return;
  const r = t.getBoundingClientRect();
  const c = card.getBoundingClientRect();
  const gap = 8;
  let x = 0, y = 0;
  if (this.side === "bottom" || this.side === "top") {
    y = this.side === "bottom" ? r.bottom + gap : r.top - c.height - gap;
    x = this.align === "start" ? r.left : this.align === "end" ? r.right - c.width : r.left + r.width / 2 - c.width / 2;
  } else {
    x = this.side === "right" ? r.right + gap : r.left - c.width - gap;
    y = this.align === "start" ? r.top : this.align === "end" ? r.bottom - c.height : r.top + r.height / 2 - c.height / 2;
  }
  x = Math.max(8, Math.min(x, innerWidth - c.width - 8));
  y = Math.max(8, Math.min(y, innerHeight - c.height - 8));
  __privateGet(this, _x4).set(x);
  __privateGet(this, _y4).set(y);
};
__decorateElement(_init89, 5, "openDelay", _openDelay_dec, ShadHoverCard);
__decorateElement(_init89, 5, "closeDelay", _closeDelay_dec, ShadHoverCard);
__decorateElement(_init89, 5, "side", _side_dec2, ShadHoverCard);
__decorateElement(_init89, 5, "align", _align_dec3, ShadHoverCard);
ShadHoverCard = __decorateElement(_init89, 0, "ShadHoverCard", _ShadHoverCard_decorators, ShadHoverCard);
__publicField(ShadHoverCard, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      [data-card] { animation: hcIn 0.15s ease-out; }
      @keyframes hcIn { from { opacity: 0; transform: scale(0.96); } }
    `
]);
__runInitializers(_init89, 1, ShadHoverCard);

// packages/dom-ui-shad/src/ui/popover.ts
var _width_dec, _align_dec4, _side_dec3, _a90, _ShadPopover_decorators, _init90, _open7, _x5, _y5, _ShadPopover_instances, trigger_fn3, toggle_fn3, position_fn2;
_ShadPopover_decorators = [Component.define()];
var ShadPopover = class extends (_a90 = Component("shad-popover"), _side_dec3 = [Component.prop({ attribute: true })], _align_dec4 = [Component.prop({ attribute: true })], _width_dec = [Component.prop({ attribute: true })], _a90) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadPopover_instances);
    __publicField(this, "side", __runInitializers(_init90, 8, this, "bottom")), __runInitializers(_init90, 11, this);
    __publicField(this, "align", __runInitializers(_init90, 12, this, "center")), __runInitializers(_init90, 15, this);
    __publicField(this, "width", __runInitializers(_init90, 16, this, "w-72")), __runInitializers(_init90, 19, this);
    __privateAdd(this, _open7, this.signal(false));
    __privateAdd(this, _x5, this.signal(0));
    __privateAdd(this, _y5, this.signal(0));
  }
  onMount() {
    document.addEventListener(
      "click",
      (e) => {
        if (!__privateGet(this, _open7).call(this)) return;
        const path = e.composedPath();
        if (path.includes(__privateMethod(this, _ShadPopover_instances, trigger_fn3).call(this)) || path.some((n) => n instanceof HTMLElement && n.hasAttribute("data-pop"))) return;
        this.close();
      },
      { signal: this.abortSignal }
    );
    document.addEventListener("keydown", (e) => {
      if (__privateGet(this, _open7).call(this) && e.key === "Escape") this.close();
    }, { signal: this.abortSignal });
    addEventListener("scroll", () => __privateGet(this, _open7).call(this) && this.close(), { capture: true, passive: true, signal: this.abortSignal });
  }
  show() {
    if (__privateGet(this, _open7).call(this)) return;
    __privateGet(this, _open7).set(true);
    requestAnimationFrame(() => __privateMethod(this, _ShadPopover_instances, position_fn2).call(this));
  }
  close() {
    __privateGet(this, _open7).set(false);
  }
  render() {
    return html`
      <slot @click=${() => __privateMethod(this, _ShadPopover_instances, toggle_fn3).call(this)}></slot>
      ${when(
      __privateGet(this, _open7).call(this),
      () => html`<div
          data-pop
          role="dialog"
          class=${"fixed z-50 rounded-md border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none " + this.width}
          style=${`left:${__privateGet(this, _x5).call(this)}px;top:${__privateGet(this, _y5).call(this)}px`}
        >
          <slot name="content"></slot>
        </div>`
    )}
    `;
  }
};
_init90 = __decoratorStart(_a90);
_open7 = new WeakMap();
_x5 = new WeakMap();
_y5 = new WeakMap();
_ShadPopover_instances = new WeakSet();
trigger_fn3 = function() {
  return this.shadowRoot.querySelector("slot:not([name])").assignedElements()[0] ?? null;
};
toggle_fn3 = function() {
  __privateGet(this, _open7).call(this) ? this.close() : this.show();
};
position_fn2 = function() {
  const t = __privateMethod(this, _ShadPopover_instances, trigger_fn3).call(this);
  const pop = this.shadowRoot.querySelector("[data-pop]");
  if (!t || !pop) return;
  const r = t.getBoundingClientRect();
  const c = pop.getBoundingClientRect();
  const gap = 8;
  let x = 0, y = 0;
  if (this.side === "bottom" || this.side === "top") {
    y = this.side === "bottom" ? r.bottom + gap : r.top - c.height - gap;
    x = this.align === "start" ? r.left : this.align === "end" ? r.right - c.width : r.left + r.width / 2 - c.width / 2;
  } else {
    x = this.side === "right" ? r.right + gap : r.left - c.width - gap;
    y = this.align === "start" ? r.top : this.align === "end" ? r.bottom - c.height : r.top + r.height / 2 - c.height / 2;
  }
  x = Math.max(8, Math.min(x, innerWidth - c.width - 8));
  y = Math.max(8, Math.min(y, innerHeight - c.height - 8));
  __privateGet(this, _x5).set(x);
  __privateGet(this, _y5).set(y);
};
__decorateElement(_init90, 5, "side", _side_dec3, ShadPopover);
__decorateElement(_init90, 5, "align", _align_dec4, ShadPopover);
__decorateElement(_init90, 5, "width", _width_dec, ShadPopover);
ShadPopover = __decorateElement(_init90, 0, "ShadPopover", _ShadPopover_decorators, ShadPopover);
__publicField(ShadPopover, "styles", [
  tw,
  css`
      :host { display: inline-block; }
      [data-pop] { animation: popIn 0.12s ease-out; }
      @keyframes popIn { from { opacity: 0; transform: scale(0.96); } }
    `
]);
__runInitializers(_init90, 1, ShadPopover);

// packages/dom-ui-shad/src/ui/select.ts
var CHECK4 = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
var CHEVRON = html`<svg class="chevron h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;
var _group_dec, _disabled_dec14, _value_dec13, _a91, _ShadOption_decorators, _init91;
_ShadOption_decorators = [Component.define()];
var ShadOption = class extends (_a91 = Component("shad-option"), _value_dec13 = [Component.prop({ attribute: true })], _disabled_dec14 = [Component.prop({ attribute: true })], _group_dec = [Component.prop({ attribute: true })], _a91) {
  constructor() {
    super(...arguments);
    __publicField(this, "value", __runInitializers(_init91, 8, this, "")), __runInitializers(_init91, 11, this);
    __publicField(this, "disabled", __runInitializers(_init91, 12, this, false)), __runInitializers(_init91, 15, this);
    __publicField(this, "group", __runInitializers(_init91, 16, this, "")), __runInitializers(_init91, 19, this);
  }
  render() {
    return html``;
  }
};
_init91 = __decoratorStart(_a91);
__decorateElement(_init91, 5, "value", _value_dec13, ShadOption);
__decorateElement(_init91, 5, "disabled", _disabled_dec14, ShadOption);
__decorateElement(_init91, 5, "group", _group_dec, ShadOption);
ShadOption = __decorateElement(_init91, 0, "ShadOption", _ShadOption_decorators, ShadOption);
// Data-only: never rendered directly — shad-select reads its attributes + text.
__publicField(ShadOption, "styles", [css`:host { display: none }`]);
__runInitializers(_init91, 1, ShadOption);
var _open_dec6, _position_dec2, _invalid_dec8, _disabled_dec15, _placeholder_dec7, _value_dec14, _a92, _ShadSelect_decorators, _init92, _x6, _y6, _w2, _active3, _ShadSelect_instances, options_fn, toggle_fn4, openMenu_fn2, position_fn3, close_fn5, pick_fn, onKey_fn4, row_fn6;
_ShadSelect_decorators = [Component.define()];
var ShadSelect = class extends (_a92 = Component("shad-select"), _value_dec14 = [Component.prop({ attribute: true })], _placeholder_dec7 = [Component.prop({ attribute: true })], _disabled_dec15 = [Component.prop({ attribute: true })], _invalid_dec8 = [Component.prop({ attribute: true })], _position_dec2 = [Component.prop({ attribute: true })], _open_dec6 = [Component.prop()], _a92) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadSelect_instances);
    __publicField(this, "value", __runInitializers(_init92, 8, this, "")), __runInitializers(_init92, 11, this);
    __publicField(this, "placeholder", __runInitializers(_init92, 12, this, "Select…")), __runInitializers(_init92, 15, this);
    __publicField(this, "disabled", __runInitializers(_init92, 16, this, false)), __runInitializers(_init92, 19, this);
    __publicField(this, "invalid", __runInitializers(_init92, 20, this, false)), __runInitializers(_init92, 23, this);
    __publicField(this, "position", __runInitializers(_init92, 24, this, "item")), __runInitializers(_init92, 27, this);
    __publicField(this, "open", __runInitializers(_init92, 28, this, false)), __runInitializers(_init92, 31, this);
    __privateAdd(this, _x6, this.signal(0));
    __privateAdd(this, _y6, this.signal(0));
    __privateAdd(this, _w2, this.signal(0));
    __privateAdd(this, _active3, this.signal(-1));
  }
  onMount() {
    document.addEventListener("click", (e) => {
      if (this.open && !e.composedPath().includes(this)) __privateMethod(this, _ShadSelect_instances, close_fn5).call(this);
    }, { signal: this.abortSignal });
    document.addEventListener("keydown", (e) => __privateMethod(this, _ShadSelect_instances, onKey_fn4).call(this, e), { signal: this.abortSignal });
    addEventListener("scroll", () => this.open && __privateMethod(this, _ShadSelect_instances, close_fn5).call(this), { capture: true, passive: true, signal: this.abortSignal });
  }
  render() {
    const opts = __privateMethod(this, _ShadSelect_instances, options_fn).call(this);
    const selected = opts.find((o) => o.value === this.value);
    const enabled = opts.filter((o) => !o.disabled);
    return html`
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded=${String(this.open)}
        aria-invalid=${this.invalid ? "true" : "false"}
        data-placeholder=${selected ? null : ""}
        class=${cn(
      "flex h-9 w-full cursor-pointer items-center justify-between gap-1.5 rounded-md border bg-background px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
      this.invalid ? "border-destructive focus-visible:ring-destructive/30" : "border-input focus-visible:border-ring"
    )}
        .disabled=${this.disabled}
        @click=${() => __privateMethod(this, _ShadSelect_instances, toggle_fn4).call(this)}
      >
        <span class=${"line-clamp-1 " + (selected ? "" : "text-muted-foreground")}>${selected?.label || this.placeholder}</span>
        ${CHEVRON}
      </button>
      ${when(
      this.open,
      () => html`<div
          data-listbox
          role="listbox"
          class="fixed z-50 max-h-80 overflow-y-auto overflow-x-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style=${`left:${__privateGet(this, _x6).call(this)}px;top:${__privateGet(this, _y6).call(this)}px;min-width:${__privateGet(this, _w2).call(this)}px`}
        >
          ${map(opts, (o, i) => __privateMethod(this, _ShadSelect_instances, row_fn6).call(this, o, opts[i - 1], enabled))}
        </div>`
    )}
    `;
  }
};
_init92 = __decoratorStart(_a92);
_x6 = new WeakMap();
_y6 = new WeakMap();
_w2 = new WeakMap();
_active3 = new WeakMap();
_ShadSelect_instances = new WeakSet();
// keyboard-highlighted index (into the enabled items)
options_fn = function() {
  return [...this.querySelectorAll("shad-option")].map((o) => ({
    value: o.getAttribute("value") ?? "",
    label: o.textContent?.trim() ?? "",
    disabled: o.hasAttribute("disabled") && o.getAttribute("disabled") !== "false",
    group: o.getAttribute("group") ?? ""
  }));
};
toggle_fn4 = function() {
  if (this.disabled) return;
  this.open ? __privateMethod(this, _ShadSelect_instances, close_fn5).call(this) : __privateMethod(this, _ShadSelect_instances, openMenu_fn2).call(this);
};
openMenu_fn2 = function() {
  const trigger = this.shadowRoot.querySelector("button");
  const r = trigger.getBoundingClientRect();
  __privateGet(this, _x6).set(r.left);
  __privateGet(this, _w2).set(r.width);
  __privateGet(this, _y6).set(r.bottom + 4);
  const enabled = __privateMethod(this, _ShadSelect_instances, options_fn).call(this).filter((o) => !o.disabled);
  __privateGet(this, _active3).set(Math.max(0, enabled.findIndex((o) => o.value === this.value)));
  this.open = true;
  requestAnimationFrame(() => __privateMethod(this, _ShadSelect_instances, position_fn3).call(this, r));
};
position_fn3 = function(triggerRect) {
  const panel = this.shadowRoot.querySelector("[data-listbox]");
  if (!panel) return;
  const pr = panel.getBoundingClientRect();
  const sel = this.position === "item" ? panel.querySelector('[aria-selected="true"]') : null;
  if (sel) {
    const off = sel.offsetTop, itemH = sel.offsetHeight, ph = pr.height;
    const minTop = Math.max(8, triggerRect.top - ph + itemH);
    const maxTop = Math.min(innerHeight - ph - 8, triggerRect.top);
    const top = Math.max(minTop, Math.min(triggerRect.top - off, maxTop));
    __privateGet(this, _y6).set(top);
    panel.scrollTop = Math.max(0, top + off - triggerRect.top);
    return;
  }
  let y = triggerRect.bottom + 4;
  if (y + pr.height > innerHeight - 8) y = Math.max(8, innerHeight - pr.height - 8);
  if (y < 8) y = 8;
  __privateGet(this, _y6).set(y);
};
close_fn5 = function() {
  this.open = false;
};
pick_fn = function(o) {
  if (o.disabled) return;
  this.value = o.value;
  this.open = false;
  this.emit("change", o.value);
};
onKey_fn4 = function(e) {
  if (!this.open) return;
  const enabled = __privateMethod(this, _ShadSelect_instances, options_fn).call(this).filter((o) => !o.disabled);
  if (e.key === "Escape") return __privateMethod(this, _ShadSelect_instances, close_fn5).call(this);
  if (e.key === "ArrowDown") e.preventDefault(), __privateGet(this, _active3).set(Math.min(__privateGet(this, _active3).call(this) + 1, enabled.length - 1));
  else if (e.key === "ArrowUp") e.preventDefault(), __privateGet(this, _active3).set(Math.max(__privateGet(this, _active3).call(this) - 1, 0));
  else if (e.key === "Enter") e.preventDefault(), enabled[__privateGet(this, _active3).call(this)] && __privateMethod(this, _ShadSelect_instances, pick_fn).call(this, enabled[__privateGet(this, _active3).call(this)]);
};
row_fn6 = function(o, prev, enabled) {
  const showLabel = o.group && o.group !== prev?.group;
  const sel = o.value === this.value;
  const active = enabled.indexOf(o) === __privateGet(this, _active3).call(this) && !o.disabled;
  return html`
      ${when(showLabel, () => html`<div class="px-1.5 py-1 text-xs text-muted-foreground">${o.group}</div>`)}
      <div
        role="option"
        aria-selected=${String(sel)}
        aria-disabled=${o.disabled ? "true" : null}
        class=${cn(
    "relative flex w-full cursor-default items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none select-none",
    o.disabled ? "pointer-events-none opacity-50" : "hover:bg-accent hover:text-accent-foreground",
    active ? "bg-accent text-accent-foreground" : ""
  )}
        @pointerenter=${() => !o.disabled && __privateGet(this, _active3).set(enabled.indexOf(o))}
        @click=${() => __privateMethod(this, _ShadSelect_instances, pick_fn).call(this, o)}
      >
        <span class="line-clamp-1">${o.label}</span>
        <span class="absolute right-2 flex h-4 w-4 items-center justify-center">${when(sel, () => CHECK4)}</span>
      </div>
    `;
};
__decorateElement(_init92, 5, "value", _value_dec14, ShadSelect);
__decorateElement(_init92, 5, "placeholder", _placeholder_dec7, ShadSelect);
__decorateElement(_init92, 5, "disabled", _disabled_dec15, ShadSelect);
__decorateElement(_init92, 5, "invalid", _invalid_dec8, ShadSelect);
__decorateElement(_init92, 5, "position", _position_dec2, ShadSelect);
__decorateElement(_init92, 5, "open", _open_dec6, ShadSelect);
ShadSelect = __decorateElement(_init92, 0, "ShadSelect", _ShadSelect_decorators, ShadSelect);
__publicField(ShadSelect, "styles", [
  tw,
  css`
      :host { display: inline-block; min-width: 9rem; }
      /* Chevron points up while the listbox is open (visible in popper mode). */
      button[aria-expanded="true"] .chevron { transform: rotate(180deg); }
    `
]);
__runInitializers(_init92, 1, ShadSelect);

// packages/dom-ui-shad/src/ui/accordion.ts
var _toggle_dec5, _open_dec7, _title_dec2, _a93, _ShadAccordionItem_decorators, _init93;
_ShadAccordionItem_decorators = [Component.define()];
var ShadAccordionItem = class extends (_a93 = Component("shad-accordion-item"), _title_dec2 = [Component.prop({ attribute: true })], _open_dec7 = [Component.prop({ attribute: true })], _toggle_dec5 = [Component.event()], _a93) {
  constructor() {
    super(...arguments);
    __runInitializers(_init93, 5, this);
    __publicField(this, "title", __runInitializers(_init93, 8, this, "")), __runInitializers(_init93, 11, this);
    __publicField(this, "open", __runInitializers(_init93, 12, this, false)), __runInitializers(_init93, 15, this);
  }
  toggle() {
    this.open = !this.open;
    this.emit("toggle", this.open);
  }
  render() {
    return html`
      <h3 class="flex">
        <button
          type="button"
          id="trigger"
          aria-controls="content"
          aria-expanded=${String(this.open)}
          class=${cn(
      "group flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all",
      "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50"
    )}
          @click=${this.toggle}
        >
          ${this.title}
          <svg
            class="chevron h-4 w-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      <div
        id="content"
        role="region"
        aria-labelledby="trigger"
        class="content text-sm"
        data-open=${this.open}
      >
        <div><div class="pb-4 pt-0 text-muted-foreground"><slot></slot></div></div>
      </div>
    `;
  }
};
_init93 = __decoratorStart(_a93);
__decorateElement(_init93, 1, "toggle", _toggle_dec5, ShadAccordionItem);
__decorateElement(_init93, 5, "title", _title_dec2, ShadAccordionItem);
__decorateElement(_init93, 5, "open", _open_dec7, ShadAccordionItem);
ShadAccordionItem = __decorateElement(_init93, 0, "ShadAccordionItem", _ShadAccordionItem_decorators, ShadAccordionItem);
__publicField(ShadAccordionItem, "styles", [
  tw,
  css`
      :host { display: block; border-bottom: 1px solid hsl(var(--border)); }
      .chevron { transition: transform 200ms ease; }
      button[aria-expanded="true"] .chevron { transform: rotate(180deg); }
      /* Smooth open/close: animate the grid track from 0fr to 1fr — pure CSS,
         no height measuring, and it interpolates to the content's natural size. */
      .content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 200ms ease;
      }
      .content[data-open] { grid-template-rows: 1fr; }
      .content > div { overflow: hidden; }
    `
]);
__runInitializers(_init93, 1, ShadAccordionItem);
var _type_dec4, _a94, _ShadAccordion_decorators, _init94;
_ShadAccordion_decorators = [Component.define()];
var ShadAccordion = class extends (_a94 = Component("shad-accordion"), _type_dec4 = [Component.prop({ attribute: true })], _a94) {
  constructor() {
    super(...arguments);
    __publicField(this, "type", __runInitializers(_init94, 8, this, "single")), __runInitializers(_init94, 11, this);
  }
  onMount() {
    this.addEventListener(
      "toggle",
      (e) => {
        if (this.type !== "single") return;
        const opened = e.target;
        if (!opened.open) return;
        for (const item of this.querySelectorAll("shad-accordion-item")) {
          if (item !== opened) item.open = false;
        }
      },
      { signal: this.abortSignal }
    );
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init94 = __decoratorStart(_a94);
__decorateElement(_init94, 5, "type", _type_dec4, ShadAccordion);
ShadAccordion = __decorateElement(_init94, 0, "ShadAccordion", _ShadAccordion_decorators, ShadAccordion);
__publicField(ShadAccordion, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init94, 1, ShadAccordion);

// packages/dom-ui-shad/src/ui/calendar.ts
var MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
var pad = (n) => String(n).padStart(2, "0");
var iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
function isoWeek(y, m, d) {
  const date = new Date(Date.UTC(y, m, d));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 6048e5);
}
var _month_dec, _year_dec, _cellsize_dec, _dropdown_dec, _weeknumbers_dec, _booked_dec, _end_dec, _start_dec, _value_dec15, _mode_dec, _a95, _ShadCalendar_decorators, _today, _init95, _ShadCalendar_instances, prev_fn, next_fn, select_fn5;
_ShadCalendar_decorators = [Component.define()];
var ShadCalendar = class extends (_a95 = Component("shad-calendar"), _mode_dec = [Component.prop({ attribute: true })], _value_dec15 = [Component.prop({ attribute: true })], _start_dec = [Component.prop({ attribute: true })], _end_dec = [Component.prop({ attribute: true })], _booked_dec = [Component.prop()], _weeknumbers_dec = [Component.prop({ attribute: true })], _dropdown_dec = [Component.prop({ attribute: true })], _cellsize_dec = [Component.prop({ attribute: true })], _year_dec = [Component.prop()], _month_dec = [Component.prop()], _a95) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadCalendar_instances);
    __privateAdd(this, _today, /* @__PURE__ */ new Date());
    __publicField(this, "mode", __runInitializers(_init95, 8, this, "single")), __runInitializers(_init95, 11, this);
    __publicField(this, "value", __runInitializers(_init95, 12, this, "")), __runInitializers(_init95, 15, this);
    __publicField(this, "start", __runInitializers(_init95, 16, this, "")), __runInitializers(_init95, 19, this);
    __publicField(this, "end", __runInitializers(_init95, 20, this, "")), __runInitializers(_init95, 23, this);
    __publicField(this, "booked", __runInitializers(_init95, 24, this, [])), __runInitializers(_init95, 27, this);
    __publicField(this, "weeknumbers", __runInitializers(_init95, 28, this, false)), __runInitializers(_init95, 31, this);
    __publicField(this, "dropdown", __runInitializers(_init95, 32, this, false)), __runInitializers(_init95, 35, this);
    __publicField(this, "cellsize", __runInitializers(_init95, 36, this, 0)), __runInitializers(_init95, 39, this);
    __publicField(this, "year", __runInitializers(_init95, 40, this, __privateGet(this, _today).getFullYear())), __runInitializers(_init95, 43, this);
    __publicField(this, "month", __runInitializers(_init95, 44, this, __privateGet(this, _today).getMonth())), __runInitializers(_init95, 47, this);
  }
  render() {
    const startDow = new Date(this.year, this.month, 1).getDay();
    const days = new Date(this.year, this.month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    while (cells.length % 7) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const todayIso = iso(__privateGet(this, _today).getFullYear(), __privateGet(this, _today).getMonth(), __privateGet(this, _today).getDate());
    const cols = `${this.weeknumbers ? "var(--cell) " : ""}repeat(7, var(--cell))`;
    const hostStyle = this.cellsize ? `--cell:${this.cellsize}px` : "";
    const cell = (c) => {
      if (c === null) return html`<div></div>`;
      const d = iso(this.year, this.month, c);
      const isStart = d === this.start;
      const isEnd = d === this.end;
      const inRange = this.start && this.end && d > this.start && d < this.end;
      const selected = this.mode === "range" ? isStart || isEnd : d === this.value;
      const isBooked = this.booked.includes(d);
      return html`<button
        class=${classMap({
        "inline-flex items-center justify-center rounded-md text-sm transition-colors": true,
        "hover:bg-accent": !isBooked && !selected,
        "bg-primary text-primary-foreground hover:bg-primary": selected,
        "rounded-none bg-accent text-accent-foreground": !!inRange,
        "text-muted-foreground line-through": isBooked,
        "ring-1 ring-ring": d === todayIso && !selected
      })}
        style="width:var(--cell);height:var(--cell)"
        aria-current=${d === todayIso ? "date" : null}
        disabled=${isBooked}
        @click=${() => __privateMethod(this, _ShadCalendar_instances, select_fn5).call(this, c)}
      >
        ${c}
      </button>`;
    };
    return html`
      <div class=${cn("w-fit rounded-md border border-border bg-background p-3 text-sm")} style=${hostStyle}>
        <div class="flex items-center justify-between pb-2">
          <button class="chev rounded-md p-1 hover:bg-accent" aria-label="Previous month" @click=${() => __privateMethod(this, _ShadCalendar_instances, prev_fn).call(this)}>‹</button>
          ${when(
      this.dropdown,
      () => html`<div class="flex items-center gap-1 font-medium">
              <select class="rounded-md px-1 py-0.5 hover:bg-accent" @change=${(e) => this.month = +e.target.value}>
                ${map(MONTHS, (mname, i) => html`<option value=${i} selected=${i === this.month}>${mname}</option>`)}
              </select>
              <select class="rounded-md px-1 py-0.5 hover:bg-accent" @change=${(e) => this.year = +e.target.value}>
                ${map(
        Array.from({ length: 21 }, (_, i) => __privateGet(this, _today).getFullYear() - 10 + i),
        (y) => html`<option value=${y} selected=${y === this.year}>${y}</option>`
      )}
              </select>
            </div>`,
      () => html`<div class="font-medium">${MONTHS[this.month]} ${this.year}</div>`
    )}
          <button class="chev rounded-md p-1 hover:bg-accent" aria-label="Next month" @click=${() => __privateMethod(this, _ShadCalendar_instances, next_fn).call(this)}>›</button>
        </div>
        <div class="grid gap-1 text-center" style=${"grid-template-columns:" + cols}>
          ${when(this.weeknumbers, () => html`<div></div>`)}
          ${map(DOW, (d) => html`<div class="py-1 text-xs text-muted-foreground">${d}</div>`)}
          ${map(
      weeks,
      (week, r) => html`
              ${when(this.weeknumbers, () => {
        const thu = new Date(this.year, this.month, 1 - startDow + r * 7 + 4);
        return html`<div class="flex items-center justify-center text-xs text-muted-foreground">${isoWeek(thu.getFullYear(), thu.getMonth(), thu.getDate())}</div>`;
      })}
              ${map(week, cell)}
            `
    )}
        </div>
      </div>
    `;
  }
};
_init95 = __decoratorStart(_a95);
_today = new WeakMap();
_ShadCalendar_instances = new WeakSet();
// 0–11
prev_fn = function() {
  if (this.month === 0) this.month = 11, this.year--;
  else this.month--;
};
next_fn = function() {
  if (this.month === 11) this.month = 0, this.year++;
  else this.month++;
};
select_fn5 = function(day) {
  const d = iso(this.year, this.month, day);
  if (this.booked.includes(d)) return;
  if (this.mode === "range") {
    if (!this.start || this.end) {
      this.start = d;
      this.end = "";
    } else if (d < this.start) {
      this.end = this.start;
      this.start = d;
    } else {
      this.end = d;
    }
    this.emit("change", { start: this.start, end: this.end });
  } else {
    this.value = d;
    this.emit("change", this.value);
  }
};
__decorateElement(_init95, 5, "mode", _mode_dec, ShadCalendar);
__decorateElement(_init95, 5, "value", _value_dec15, ShadCalendar);
__decorateElement(_init95, 5, "start", _start_dec, ShadCalendar);
__decorateElement(_init95, 5, "end", _end_dec, ShadCalendar);
__decorateElement(_init95, 5, "booked", _booked_dec, ShadCalendar);
__decorateElement(_init95, 5, "weeknumbers", _weeknumbers_dec, ShadCalendar);
__decorateElement(_init95, 5, "dropdown", _dropdown_dec, ShadCalendar);
__decorateElement(_init95, 5, "cellsize", _cellsize_dec, ShadCalendar);
__decorateElement(_init95, 5, "year", _year_dec, ShadCalendar);
__decorateElement(_init95, 5, "month", _month_dec, ShadCalendar);
ShadCalendar = __decorateElement(_init95, 0, "ShadCalendar", _ShadCalendar_decorators, ShadCalendar);
__publicField(ShadCalendar, "styles", [
  tw,
  css`
      :host { display: inline-block; --cell: 2rem; }
      /* RTL: flip the prev/next chevrons (the grid mirrors on its own). */
      :host-context([dir="rtl"]) .chev { transform: scaleX(-1); }
      select { appearance: none; }
    `
]);
__runInitializers(_init95, 1, ShadCalendar);

// packages/dom-ui-shad/src/ui/date-picker.ts
var pad2 = (n) => String(n).padStart(2, "0");
var toIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
var WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
var CAL_ICON = html`<svg class="h-4 w-4 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>`;
var CHEVRON2 = html`<svg class="h-4 w-4 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;
var _natural_dec, _variant_dec10, _dropdown_dec2, _placeholder_dec8, _end_dec2, _start_dec2, _value_dec16, _mode_dec2, _a96, _ShadDatePicker_decorators, _init96, _open8, _x7, _y7, _text, _hint, _ShadDatePicker_instances, fmt_fn, label_fn, toggle_fn5, close_fn6, onCalChange_fn, parseNatural_fn, onInput_fn2, buttonTrigger_fn, inputTrigger_fn, popover_fn;
_ShadDatePicker_decorators = [Component.define()];
var ShadDatePicker = class extends (_a96 = Component("shad-date-picker"), _mode_dec2 = [Component.prop({ attribute: true })], _value_dec16 = [Component.prop({ attribute: true })], _start_dec2 = [Component.prop({ attribute: true })], _end_dec2 = [Component.prop({ attribute: true })], _placeholder_dec8 = [Component.prop({ attribute: true })], _dropdown_dec2 = [Component.prop({ attribute: true })], _variant_dec10 = [Component.prop({ attribute: true })], _natural_dec = [Component.prop({ attribute: true })], _a96) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadDatePicker_instances);
    __publicField(this, "mode", __runInitializers(_init96, 8, this, "single")), __runInitializers(_init96, 11, this);
    __publicField(this, "value", __runInitializers(_init96, 12, this, "")), __runInitializers(_init96, 15, this);
    __publicField(this, "start", __runInitializers(_init96, 16, this, "")), __runInitializers(_init96, 19, this);
    __publicField(this, "end", __runInitializers(_init96, 20, this, "")), __runInitializers(_init96, 23, this);
    __publicField(this, "placeholder", __runInitializers(_init96, 24, this, "Pick a date")), __runInitializers(_init96, 27, this);
    __publicField(this, "dropdown", __runInitializers(_init96, 28, this, false)), __runInitializers(_init96, 31, this);
    __publicField(this, "variant", __runInitializers(_init96, 32, this, "button")), __runInitializers(_init96, 35, this);
    __publicField(this, "natural", __runInitializers(_init96, 36, this, false)), __runInitializers(_init96, 39, this);
    // input variant: parse free text
    __privateAdd(this, _open8, this.signal(false));
    __privateAdd(this, _x7, this.signal(0));
    __privateAdd(this, _y7, this.signal(0));
    __privateAdd(this, _text, this.signal(""));
    // input-variant raw text
    __privateAdd(this, _hint, this.signal(""));
  }
  // natural-language resolved label
  onMount() {
    document.addEventListener("click", (e) => {
      if (__privateGet(this, _open8).call(this) && !e.composedPath().includes(this)) __privateMethod(this, _ShadDatePicker_instances, close_fn6).call(this);
    }, { signal: this.abortSignal });
    document.addEventListener("keydown", (e) => {
      if (__privateGet(this, _open8).call(this) && e.key === "Escape") __privateMethod(this, _ShadDatePicker_instances, close_fn6).call(this);
    }, { signal: this.abortSignal });
    addEventListener("scroll", () => __privateGet(this, _open8).call(this) && __privateMethod(this, _ShadDatePicker_instances, close_fn6).call(this), { capture: true, passive: true, signal: this.abortSignal });
  }
  // ---- render -----------------------------------------------------------
  render() {
    const label = __privateMethod(this, _ShadDatePicker_instances, label_fn).call(this);
    const empty = !label;
    return html`
      <div class="relative inline-block">
        ${this.variant === "input" ? __privateMethod(this, _ShadDatePicker_instances, inputTrigger_fn).call(this) : __privateMethod(this, _ShadDatePicker_instances, buttonTrigger_fn).call(this, label, empty)}
        ${when(__privateGet(this, _open8).call(this), () => __privateMethod(this, _ShadDatePicker_instances, popover_fn).call(this))}
      </div>
    `;
  }
};
_init96 = __decoratorStart(_a96);
_open8 = new WeakMap();
_x7 = new WeakMap();
_y7 = new WeakMap();
_text = new WeakMap();
_hint = new WeakMap();
_ShadDatePicker_instances = new WeakSet();
// ---- date formatting --------------------------------------------------
fmt_fn = function(isoStr) {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(void 0, { year: "numeric", month: "long", day: "numeric" });
};
label_fn = function() {
  if (this.mode === "range") {
    if (this.start && this.end) return `${__privateMethod(this, _ShadDatePicker_instances, fmt_fn).call(this, this.start)} - ${__privateMethod(this, _ShadDatePicker_instances, fmt_fn).call(this, this.end)}`;
    if (this.start) return __privateMethod(this, _ShadDatePicker_instances, fmt_fn).call(this, this.start);
    return "";
  }
  return __privateMethod(this, _ShadDatePicker_instances, fmt_fn).call(this, this.value);
};
// ---- open / close / select -------------------------------------------
toggle_fn5 = function(e) {
  e.stopPropagation();
  if (__privateGet(this, _open8).call(this)) return __privateMethod(this, _ShadDatePicker_instances, close_fn6).call(this);
  const trigger = this.shadowRoot.querySelector("[data-anchor]");
  const r = trigger.getBoundingClientRect();
  __privateGet(this, _x7).set(r.left);
  __privateGet(this, _y7).set(r.bottom + 4);
  __privateGet(this, _open8).set(true);
  requestAnimationFrame(() => {
    const pop = this.shadowRoot.querySelector("[data-pop]");
    if (!pop) return;
    const pr = pop.getBoundingClientRect();
    if (pr.right > innerWidth - 8) __privateGet(this, _x7).set(Math.max(8, innerWidth - pr.width - 8));
    if (pr.bottom > innerHeight - 8) __privateGet(this, _y7).set(Math.max(8, r.top - pr.height - 4));
  });
};
close_fn6 = function() {
  __privateGet(this, _open8).set(false);
};
onCalChange_fn = function(e) {
  const detail = e.detail;
  if (this.mode === "range") {
    this.start = detail.start ?? "";
    this.end = detail.end ?? "";
    this.emit("change", { start: this.start, end: this.end });
    if (this.start && this.end) __privateMethod(this, _ShadDatePicker_instances, close_fn6).call(this);
  } else {
    this.value = detail;
    __privateGet(this, _text).set(__privateMethod(this, _ShadDatePicker_instances, fmt_fn).call(this, this.value));
    this.emit("change", this.value);
    __privateMethod(this, _ShadDatePicker_instances, close_fn6).call(this);
  }
};
// ---- natural language -------------------------------------------------
parseNatural_fn = function(text) {
  const t = text.trim().toLowerCase();
  if (!t) return "";
  const base2 = /* @__PURE__ */ new Date();
  base2.setHours(0, 0, 0, 0);
  const shift = (n) => {
    const d = new Date(base2);
    d.setDate(d.getDate() + n);
    return toIso(d);
  };
  if (t === "today") return toIso(base2);
  if (t === "tomorrow") return shift(1);
  if (t === "yesterday") return shift(-1);
  let m;
  if (m = t.match(/^in (\d+) days?$/)) return shift(+m[1]);
  if (m = t.match(/^(\d+) days? ago$/)) return shift(-+m[1]);
  if (m = t.match(/^(next|last|this)?\s*(sun|mon|tue|wed|thu|fri|sat)/)) {
    const target = WD.findIndex((w) => w.startsWith(m[2]));
    const cur = base2.getDay();
    let diff = (target - cur + 7) % 7;
    if (m[1] === "next") diff = diff === 0 ? 7 : diff;
    else if (m[1] === "last") diff = diff === 0 ? -7 : diff - 7;
    else if (diff === 0) diff = 0;
    return shift(diff);
  }
  const p = Date.parse(text);
  if (!isNaN(p)) return toIso(new Date(p));
  return "";
};
onInput_fn2 = function(e) {
  const raw = e.target.value;
  __privateGet(this, _text).set(raw);
  if (!this.natural) return;
  const isoStr = __privateMethod(this, _ShadDatePicker_instances, parseNatural_fn).call(this, raw);
  if (isoStr) {
    this.value = isoStr;
    __privateGet(this, _hint).set(__privateMethod(this, _ShadDatePicker_instances, fmt_fn).call(this, isoStr));
    this.emit("change", isoStr);
  } else {
    __privateGet(this, _hint).set("");
  }
};
buttonTrigger_fn = function(label, empty) {
  return html`<button
      type="button"
      data-anchor
      aria-haspopup="dialog"
      aria-expanded=${String(__privateGet(this, _open8).call(this))}
      class=${"inline-flex h-10 w-[260px] cursor-pointer select-none items-center justify-start gap-2 rounded-md border border-border bg-background px-3 text-left text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-accent " + (empty ? "text-muted-foreground" : "")}
      @click=${(e) => __privateMethod(this, _ShadDatePicker_instances, toggle_fn5).call(this, e)}
    >
      ${CAL_ICON}
      <span class="flex-1 truncate">${empty ? this.placeholder : label}</span>
    </button>`;
};
inputTrigger_fn = function() {
  return html`<div class="w-[260px]">
      <div class="relative">
        <input
          data-anchor
          class="h-10 w-full rounded-md border border-border bg-background px-3 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder=${this.natural ? "Tomorrow, next monday, in 3 days…" : this.placeholder}
          .value=${__privateGet(this, _text).call(this)}
          @input=${(e) => __privateMethod(this, _ShadDatePicker_instances, onInput_fn2).call(this, e)}
          @keydown=${(e) => {
    if (e.key === "ArrowDown") e.preventDefault(), __privateGet(this, _open8).call(this) || __privateMethod(this, _ShadDatePicker_instances, toggle_fn5).call(this, e);
  }}
        />
        <button
          type="button"
          aria-label="Open calendar"
          class="absolute inset-y-0 right-0 flex w-9 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
          @click=${(e) => __privateMethod(this, _ShadDatePicker_instances, toggle_fn5).call(this, e)}
        >
          ${this.natural ? CHEVRON2 : CAL_ICON}
        </button>
      </div>
      ${when(this.natural && __privateGet(this, _hint).call(this), () => html`<div class="mt-1 px-1 text-xs text-muted-foreground">${__privateGet(this, _hint).call(this)}</div>`)}
    </div>`;
};
popover_fn = function() {
  return html`<div
      data-pop
      role="dialog"
      class="z-50 rounded-md shadow-md"
      style=${`position:fixed;left:${__privateGet(this, _x7).call(this)}px;top:${__privateGet(this, _y7).call(this)}px`}
    >
      <shad-calendar
        mode=${this.mode}
        value=${this.value}
        start=${this.start}
        end=${this.end}
        dropdown=${this.dropdown}
        @change=${(e) => __privateMethod(this, _ShadDatePicker_instances, onCalChange_fn).call(this, e)}
      ></shad-calendar>
    </div>`;
};
__decorateElement(_init96, 5, "mode", _mode_dec2, ShadDatePicker);
__decorateElement(_init96, 5, "value", _value_dec16, ShadDatePicker);
__decorateElement(_init96, 5, "start", _start_dec2, ShadDatePicker);
__decorateElement(_init96, 5, "end", _end_dec2, ShadDatePicker);
__decorateElement(_init96, 5, "placeholder", _placeholder_dec8, ShadDatePicker);
__decorateElement(_init96, 5, "dropdown", _dropdown_dec2, ShadDatePicker);
__decorateElement(_init96, 5, "variant", _variant_dec10, ShadDatePicker);
__decorateElement(_init96, 5, "natural", _natural_dec, ShadDatePicker);
ShadDatePicker = __decorateElement(_init96, 0, "ShadDatePicker", _ShadDatePicker_decorators, ShadDatePicker);
__publicField(ShadDatePicker, "styles", [tw, css`:host { display: inline-block; }`]);
__runInitializers(_init96, 1, ShadDatePicker);

// packages/dom-ui-shad/src/ui/table.ts
var _ShadTable_decorators, _init97, _a97;
_ShadTable_decorators = [Component.define()];
var ShadTable = class extends (_a97 = Component("shad-table")) {
  static styles = [
    tw,
    css`
      :host { display: block; }
      /* overflow:visible (not auto): an overflow-x:auto container forces
         overflow-y to auto too (CSS spec), which spawns phantom scrollbars and
         would clip absolutely-positioned row-action menus. Wrap in your own
         overflow-x-auto element if a wide table needs to scroll. */
      .container { position: relative; width: 100%; }
      /* A real <table> would foster-parent the <slot> out; a display:table div
         keeps the slot in place while still building a table box. */
      .table {
        display: table;
        width: 100%;
        caption-side: bottom;
        border-collapse: collapse;
        font-size: 0.875rem;
        line-height: 1.25rem;
      }
      slot { display: contents; }
    `
  ];
  render() {
    return html`<div class="container"><div class="table" role="table"><slot></slot></div></div>`;
  }
};
_init97 = __decoratorStart(_a97);
ShadTable = __decorateElement(_init97, 0, "ShadTable", _ShadTable_decorators, ShadTable);
__runInitializers(_init97, 1, ShadTable);
var _ShadTableHeader_decorators, _init98, _a98;
_ShadTableHeader_decorators = [Component.define()];
var ShadTableHeader = class extends (_a98 = Component("shad-table-header")) {
  static styles = [tw, css`:host { display: table-header-group; } slot { display: contents; }`];
  render() {
    return html`<slot></slot>`;
  }
};
_init98 = __decoratorStart(_a98);
ShadTableHeader = __decorateElement(_init98, 0, "ShadTableHeader", _ShadTableHeader_decorators, ShadTableHeader);
__runInitializers(_init98, 1, ShadTableHeader);
var _ShadTableBody_decorators, _init99, _a99;
_ShadTableBody_decorators = [Component.define()];
var ShadTableBody = class extends (_a99 = Component("shad-table-body")) {
  // The last body row drops its own border (see shad-table-row) — handled there
  // because outer-scope Tailwind preflight would otherwise win over a ::slotted
  // override here.
  static styles = [tw, css`:host { display: table-row-group; } slot { display: contents; }`];
  render() {
    return html`<slot></slot>`;
  }
};
_init99 = __decoratorStart(_a99);
ShadTableBody = __decorateElement(_init99, 0, "ShadTableBody", _ShadTableBody_decorators, ShadTableBody);
__runInitializers(_init99, 1, ShadTableBody);
var _ShadTableFooter_decorators, _init100, _a100;
_ShadTableFooter_decorators = [Component.define()];
var ShadTableFooter = class extends (_a100 = Component("shad-table-footer")) {
  static styles = [
    tw,
    css`
      :host { display: table-footer-group; background: hsl(var(--muted) / 0.5); font-weight: 500; }
      slot { display: contents; }
    `
  ];
  render() {
    return html`<slot></slot>`;
  }
};
_init100 = __decoratorStart(_a100);
ShadTableFooter = __decorateElement(_init100, 0, "ShadTableFooter", _ShadTableFooter_decorators, ShadTableFooter);
__runInitializers(_init100, 1, ShadTableFooter);
var _selected_dec, _a101, _ShadTableRow_decorators, _init101;
_ShadTableRow_decorators = [Component.define()];
var ShadTableRow = class extends (_a101 = Component("shad-table-row"), _selected_dec = [Component.prop({ attribute: true, reflect: true })], _a101) {
  constructor() {
    super(...arguments);
    __publicField(this, "selected", __runInitializers(_init101, 8, this, false)), __runInitializers(_init101, 11, this);
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init101 = __decoratorStart(_a101);
__decorateElement(_init101, 5, "selected", _selected_dec, ShadTableRow);
ShadTableRow = __decorateElement(_init101, 0, "ShadTableRow", _ShadTableRow_decorators, ShadTableRow);
__publicField(ShadTableRow, "styles", [
  tw,
  css`
      /* !important: outer-scope Tailwind preflight (* { border: 0 solid }) wins
         over an inner :host normal declaration, so structural box props must be
         important to survive. */
      :host {
        display: table-row;
        border-bottom: 1px solid hsl(var(--border)) !important;
        transition: background-color 0.15s ease;
      }
      /* Last BODY row drops its border (the card's edge separates it). Scoped to
         the body so header/footer rows keep theirs — self-contained so we don't
         fight the cross-shadow cascade from <shad-table-body>. */
      :host-context(shad-table-body):host(:last-child) { border-bottom: 0 !important; }
      :host(:hover) { background: hsl(var(--muted) / 0.5); }
      :host([selected]) { background: hsl(var(--muted)); }
      slot { display: contents; }
    `
]);
__runInitializers(_init101, 1, ShadTableRow);
var _align_dec5, _a102, _ShadTableHead_decorators, _init102;
_ShadTableHead_decorators = [Component.define()];
var ShadTableHead = class extends (_a102 = Component("shad-table-head"), _align_dec5 = [Component.prop({ attribute: true, reflect: true })], _a102) {
  constructor() {
    super(...arguments);
    __publicField(this, "align", __runInitializers(_init102, 8, this, "start")), __runInitializers(_init102, 11, this);
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init102 = __decoratorStart(_a102);
__decorateElement(_init102, 5, "align", _align_dec5, ShadTableHead);
ShadTableHead = __decorateElement(_init102, 0, "ShadTableHead", _ShadTableHead_decorators, ShadTableHead);
__publicField(ShadTableHead, "styles", [
  tw,
  css`
      /* !important on padding: outer-scope Tailwind preflight zeroes it otherwise. */
      :host {
        display: table-cell;
        height: 2.5rem;
        padding: 0 0.5rem !important;
        text-align: start;
        vertical-align: middle;
        font-weight: 500;
        white-space: nowrap;
        color: hsl(var(--foreground));
      }
      :host([align="end"]) { text-align: end; }
      :host([align="center"]) { text-align: center; }
      slot { display: contents; }
    `
]);
__runInitializers(_init102, 1, ShadTableHead);
var _align_dec6, _a103, _ShadTableCell_decorators, _init103;
_ShadTableCell_decorators = [Component.define()];
var ShadTableCell = class extends (_a103 = Component("shad-table-cell"), _align_dec6 = [Component.prop({ attribute: true, reflect: true })], _a103) {
  constructor() {
    super(...arguments);
    __publicField(this, "align", __runInitializers(_init103, 8, this, "start")), __runInitializers(_init103, 11, this);
  }
  render() {
    return html`<slot></slot>`;
  }
};
_init103 = __decoratorStart(_a103);
__decorateElement(_init103, 5, "align", _align_dec6, ShadTableCell);
ShadTableCell = __decorateElement(_init103, 0, "ShadTableCell", _ShadTableCell_decorators, ShadTableCell);
__publicField(ShadTableCell, "styles", [
  tw,
  css`
      /* !important on padding: outer-scope Tailwind preflight zeroes it otherwise. */
      :host {
        display: table-cell;
        padding: 0.5rem !important;
        vertical-align: middle;
        white-space: nowrap;
      }
      :host([align="end"]) { text-align: end; }
      :host([align="center"]) { text-align: center; }
      slot { display: contents; }
    `
]);
__runInitializers(_init103, 1, ShadTableCell);
var _ShadTableCaption_decorators, _init104, _a104;
_ShadTableCaption_decorators = [Component.define()];
var ShadTableCaption = class extends (_a104 = Component("shad-table-caption")) {
  static styles = [
    tw,
    css`:host { display: table-caption; margin-top: 1rem !important; color: hsl(var(--muted-foreground)); font-size: 0.875rem; } slot { display: contents; }`
  ];
  render() {
    return html`<slot></slot>`;
  }
};
_init104 = __decoratorStart(_a104);
ShadTableCaption = __decorateElement(_init104, 0, "ShadTableCaption", _ShadTableCaption_decorators, ShadTableCaption);
__runInitializers(_init104, 1, ShadTableCaption);

// packages/dom-ui-shad/src/ui/data-table.ts
var ARROW_UP_DOWN = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" /></svg>`;
var ARROW_UP = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>`;
var ARROW_DOWN = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>`;
var CHEVRON_DOWN = html`<svg class="ml-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;
var ELLIPSIS2 = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>`;
var CHECK5 = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`;
var _filterPlaceholder_dec, _pageSize_dec, _showColumns_dec, _selectable_dec, _rowKey_dec, _rowActions_dec, _data_dec2, _columns_dec, _a105, _ShadDataTable_decorators, _init105, _sortKey, _sortDir, _filter, _page, _selected, _hidden2, _columnsOpen, _actionRow, _actionX, _actionY, _ShadDataTable_instances, idOf_fn, filterCol_fn, view_fn, pageRows_fn, visibleColumns_fn, toggleSort_fn, toggleRow_fn, toggleAll_fn, emitSelection_fn, toggleColumn_fn, runAction_fn, toolbar_fn, columnsMenu_fn, headCell_fn, bodyRow_fn, openActions_fn, actionsCell_fn, footer_fn;
_ShadDataTable_decorators = [Component.define()];
var ShadDataTable = class extends (_a105 = Component("shad-data-table"), _columns_dec = [Component.prop()], _data_dec2 = [Component.prop()], _rowActions_dec = [Component.prop()], _rowKey_dec = [Component.prop({ attribute: true })], _selectable_dec = [Component.prop({ attribute: true })], _showColumns_dec = [Component.prop({ attribute: "show-columns" })], _pageSize_dec = [Component.prop({ attribute: "page-size" })], _filterPlaceholder_dec = [Component.prop({ attribute: true })], _a105) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _ShadDataTable_instances);
    __publicField(this, "columns", __runInitializers(_init105, 8, this, [])), __runInitializers(_init105, 11, this);
    __publicField(this, "data", __runInitializers(_init105, 12, this, [])), __runInitializers(_init105, 15, this);
    __publicField(this, "rowActions", __runInitializers(_init105, 16, this, [])), __runInitializers(_init105, 19, this);
    __publicField(this, "rowKey", __runInitializers(_init105, 20, this, "")), __runInitializers(_init105, 23, this);
    __publicField(this, "selectable", __runInitializers(_init105, 24, this, false)), __runInitializers(_init105, 27, this);
    __publicField(this, "showColumns", __runInitializers(_init105, 28, this, false)), __runInitializers(_init105, 31, this);
    __publicField(this, "pageSize", __runInitializers(_init105, 32, this, 0)), __runInitializers(_init105, 35, this);
    __publicField(this, "filterPlaceholder", __runInitializers(_init105, 36, this, "")), __runInitializers(_init105, 39, this);
    __privateAdd(this, _sortKey, this.signal(""));
    __privateAdd(this, _sortDir, this.signal("asc"));
    __privateAdd(this, _filter, this.signal(""));
    __privateAdd(this, _page, this.signal(0));
    __privateAdd(this, _selected, this.signal(/* @__PURE__ */ new Set()));
    __privateAdd(this, _hidden2, this.signal(/* @__PURE__ */ new Set()));
    __privateAdd(this, _columnsOpen, this.signal(false));
    __privateAdd(this, _actionRow, this.signal(-1));
    // index (within current view) of the open row-action menu
    __privateAdd(this, _actionX, this.signal(0));
    // viewport coords of the open row-action menu (position:fixed)
    __privateAdd(this, _actionY, this.signal(0));
  }
  onMount() {
    document.addEventListener(
      "click",
      (e) => {
        if (!e.composedPath().includes(this)) {
          __privateGet(this, _columnsOpen).set(false);
          __privateGet(this, _actionRow).set(-1);
        }
      },
      { signal: this.abortSignal }
    );
    addEventListener("scroll", () => __privateGet(this, _actionRow).set(-1), { capture: true, passive: true, signal: this.abortSignal });
  }
  // ---- render -----------------------------------------------------------
  render() {
    const view = __privateMethod(this, _ShadDataTable_instances, view_fn).call(this);
    const rows = __privateMethod(this, _ShadDataTable_instances, pageRows_fn).call(this, view);
    const cols = __privateMethod(this, _ShadDataTable_instances, visibleColumns_fn).call(this);
    const fc = __privateMethod(this, _ShadDataTable_instances, filterCol_fn).call(this);
    const hasActions = this.rowActions.length > 0;
    const pageCount = this.pageSize ? Math.max(1, Math.ceil(view.length / this.pageSize)) : 1;
    const page = __privateGet(this, _page).call(this);
    const selCount = __privateGet(this, _selected).call(this).size;
    const allOn = view.length > 0 && view.every((r) => __privateGet(this, _selected).call(this).has(__privateMethod(this, _ShadDataTable_instances, idOf_fn).call(this, r)));
    return html`
      ${when(fc || this.showColumns, () => __privateMethod(this, _ShadDataTable_instances, toolbar_fn).call(this, fc))}
      <div class="overflow-hidden rounded-md border border-border bg-background">
        <shad-table>
          <shad-table-header>
            <shad-table-row>
              ${when(
      this.selectable,
      () => html`<shad-table-head>
                  <shad-checkbox
                    aria-label="Select all"
                    .checked=${allOn}
                    @change=${() => __privateMethod(this, _ShadDataTable_instances, toggleAll_fn).call(this, view)}
                  ></shad-checkbox>
                </shad-table-head>`
    )}
              ${map(cols, (c) => __privateMethod(this, _ShadDataTable_instances, headCell_fn).call(this, c))}
              ${when(hasActions, () => html`<shad-table-head></shad-table-head>`)}
            </shad-table-row>
          </shad-table-header>
          ${when(
      rows.length > 0,
      () => html`<shad-table-body>${map(rows, (row, i) => __privateMethod(this, _ShadDataTable_instances, bodyRow_fn).call(this, row, i, cols, hasActions))}</shad-table-body>`
    )}
        </shad-table>
        ${when(
      rows.length === 0,
      () => html`<div class="flex h-24 items-center justify-center text-sm text-muted-foreground">No results.</div>`
    )}
      </div>
      ${when(this.selectable || this.pageSize, () => __privateMethod(this, _ShadDataTable_instances, footer_fn).call(this, view.length, selCount, page, pageCount))}
    `;
  }
};
_init105 = __decoratorStart(_a105);
_sortKey = new WeakMap();
_sortDir = new WeakMap();
_filter = new WeakMap();
_page = new WeakMap();
_selected = new WeakMap();
_hidden2 = new WeakMap();
_columnsOpen = new WeakMap();
_actionRow = new WeakMap();
_actionX = new WeakMap();
_actionY = new WeakMap();
_ShadDataTable_instances = new WeakSet();
// ---- row identity / data pipeline -------------------------------------
idOf_fn = function(row) {
  if (this.rowKey && row[this.rowKey] != null) return String(row[this.rowKey]);
  return JSON.stringify(row);
};
filterCol_fn = function() {
  return this.columns.find((c) => c.filterable);
};
/** Filtered + sorted rows (the full result set, before pagination). */
view_fn = function() {
  let rows = this.data;
  const fc = __privateMethod(this, _ShadDataTable_instances, filterCol_fn).call(this);
  const q = __privateGet(this, _filter).call(this).toLowerCase();
  if (fc && q) rows = rows.filter((r) => String(r[fc.key] ?? "").toLowerCase().includes(q));
  const sk = __privateGet(this, _sortKey).call(this);
  if (sk) {
    const dir = __privateGet(this, _sortDir).call(this) === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sk], bv = b[sk];
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }
  return rows;
};
/** The rows for the current page. */
pageRows_fn = function(view) {
  if (!this.pageSize) return view;
  const start = __privateGet(this, _page).call(this) * this.pageSize;
  return view.slice(start, start + this.pageSize);
};
visibleColumns_fn = function() {
  const hidden = __privateGet(this, _hidden2).call(this);
  return this.columns.filter((c) => !hidden.has(c.key));
};
// ---- actions ----------------------------------------------------------
toggleSort_fn = function(c) {
  if (!c.sortable) return;
  if (__privateGet(this, _sortKey).call(this) === c.key) __privateGet(this, _sortDir).set(__privateGet(this, _sortDir).call(this) === "asc" ? "desc" : "asc");
  else __privateGet(this, _sortKey).set(c.key), __privateGet(this, _sortDir).set("asc");
  this.emit("sortchange", { key: __privateGet(this, _sortKey).call(this), dir: __privateGet(this, _sortDir).call(this) });
};
toggleRow_fn = function(row) {
  const id = __privateMethod(this, _ShadDataTable_instances, idOf_fn).call(this, row);
  const next = new Set(__privateGet(this, _selected).call(this));
  next.has(id) ? next.delete(id) : next.add(id);
  __privateGet(this, _selected).set(next);
  __privateMethod(this, _ShadDataTable_instances, emitSelection_fn).call(this);
};
toggleAll_fn = function(view) {
  const ids = view.map((r) => __privateMethod(this, _ShadDataTable_instances, idOf_fn).call(this, r));
  const allOn = ids.length > 0 && ids.every((id) => __privateGet(this, _selected).call(this).has(id));
  const next = new Set(__privateGet(this, _selected).call(this));
  if (allOn) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  __privateGet(this, _selected).set(next);
  __privateMethod(this, _ShadDataTable_instances, emitSelection_fn).call(this);
};
emitSelection_fn = function() {
  const sel = __privateGet(this, _selected).call(this);
  this.emit("selectionchange", this.data.filter((r) => sel.has(__privateMethod(this, _ShadDataTable_instances, idOf_fn).call(this, r))));
};
toggleColumn_fn = function(key) {
  const next = new Set(__privateGet(this, _hidden2).call(this));
  next.has(key) ? next.delete(key) : next.add(key);
  __privateGet(this, _hidden2).set(next);
};
runAction_fn = function(a, row) {
  __privateGet(this, _actionRow).set(-1);
  this.emit("rowaction", { action: a.value ?? a.label, row });
};
toolbar_fn = function(fc) {
  return html`<div class="flex items-center gap-2 py-4">
      ${when(
    fc,
    () => html`<shad-input
          class="max-w-sm"
          placeholder=${this.filterPlaceholder || `Filter ${fc.header.toLowerCase()}…`}
          .value=${__privateGet(this, _filter).call(this)}
          @input=${(e) => (__privateGet(this, _filter).set(e.target.value), __privateGet(this, _page).set(0))}
        ></shad-input>`
  )}
      ${when(this.showColumns, () => __privateMethod(this, _ShadDataTable_instances, columnsMenu_fn).call(this))}
    </div>`;
};
columnsMenu_fn = function() {
  const hideable = this.columns.filter((c) => c.hideable !== false);
  return html`<div class="relative ml-auto">
      <shad-button
        variant="outline"
        size="sm"
        aria-expanded=${String(__privateGet(this, _columnsOpen).call(this))}
        @click=${(e) => (e.stopPropagation(), __privateGet(this, _columnsOpen).set(!__privateGet(this, _columnsOpen).call(this)), __privateGet(this, _actionRow).set(-1))}
        >Columns ${CHEVRON_DOWN}</shad-button
      >
      ${when(
    __privateGet(this, _columnsOpen).call(this),
    () => html`<div class="menu right-0 mt-1" style="right:0">
          ${map(
      hideable,
      (c) => html`<div
              role="menuitemcheckbox"
              aria-checked=${String(!__privateGet(this, _hidden2).call(this).has(c.key))}
              class="relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm capitalize outline-none hover:bg-accent hover:text-accent-foreground"
              @click=${(e) => (e.stopPropagation(), __privateMethod(this, _ShadDataTable_instances, toggleColumn_fn).call(this, c.key))}
            >
              <span class="absolute left-2 flex h-4 w-4 items-center justify-center"
                >${when(!__privateGet(this, _hidden2).call(this).has(c.key), () => CHECK5)}</span
              >
              ${c.header}
            </div>`
    )}
        </div>`
  )}
    </div>`;
};
headCell_fn = function(c) {
  if (!c.sortable) {
    return html`<shad-table-head align=${c.align ?? "start"}>${c.header}</shad-table-head>`;
  }
  const active = __privateGet(this, _sortKey).call(this) === c.key;
  const icon = !active ? ARROW_UP_DOWN : __privateGet(this, _sortDir).call(this) === "asc" ? ARROW_UP : ARROW_DOWN;
  return html`<shad-table-head align=${c.align ?? "start"}>
      <shad-button variant="ghost" size="sm" class="-ml-3" @click=${() => __privateMethod(this, _ShadDataTable_instances, toggleSort_fn).call(this, c)}>
        ${c.header}${icon}
      </shad-button>
    </shad-table-head>`;
};
bodyRow_fn = function(row, i, cols, hasActions) {
  const id = __privateMethod(this, _ShadDataTable_instances, idOf_fn).call(this, row);
  const selected = __privateGet(this, _selected).call(this).has(id);
  return html`<shad-table-row .selected=${selected}>
      ${when(
    this.selectable,
    () => html`<shad-table-cell>
          <shad-checkbox aria-label="Select row" .checked=${selected} @change=${() => __privateMethod(this, _ShadDataTable_instances, toggleRow_fn).call(this, row)}></shad-checkbox>
        </shad-table-cell>`
  )}
      ${map(
    cols,
    (c) => html`<shad-table-cell align=${c.align ?? "start"}>
          <div class=${c.class ?? ""}>${c.cell ? c.cell(row) : row[c.key]}</div>
        </shad-table-cell>`
  )}
      ${when(hasActions, () => __privateMethod(this, _ShadDataTable_instances, actionsCell_fn).call(this, row, i))}
    </shad-table-row>`;
};
openActions_fn = function(e, i) {
  e.stopPropagation();
  if (__privateGet(this, _actionRow).call(this) === i) {
    __privateGet(this, _actionRow).set(-1);
    return;
  }
  const r = e.currentTarget.getBoundingClientRect();
  const W = 160;
  __privateGet(this, _actionX).set(Math.max(8, r.right - W));
  __privateGet(this, _actionY).set(r.bottom + 4);
  __privateGet(this, _columnsOpen).set(false);
  __privateGet(this, _actionRow).set(i);
  requestAnimationFrame(() => {
    const m = this.shadowRoot.querySelector("[data-row-menu]");
    if (!m) return;
    const mr = m.getBoundingClientRect();
    if (mr.bottom > innerHeight - 8) __privateGet(this, _actionY).set(r.top - mr.height - 4);
  });
};
actionsCell_fn = function(row, i) {
  return html`<shad-table-cell align="end">
      <div class="inline-block text-right">
        <shad-button
          variant="ghost"
          size="icon"
          class="h-8 w-8 p-0"
          aria-haspopup="menu"
          aria-expanded=${String(__privateGet(this, _actionRow).call(this) === i)}
          @click=${(e) => __privateMethod(this, _ShadDataTable_instances, openActions_fn).call(this, e, i)}
        >
          <span class="sr-only">Open menu</span>${ELLIPSIS2}
        </shad-button>
        ${when(
    __privateGet(this, _actionRow).call(this) === i,
    () => html`<div class="menu" data-row-menu style=${`position:fixed;left:${__privateGet(this, _actionX).call(this)}px;top:${__privateGet(this, _actionY).call(this)}px`}>
            ${map(
      this.rowActions,
      (a) => a.separator ? html`<div role="separator" class="-mx-1 my-1 h-px bg-border"></div>` : html`<div
                    role="menuitem"
                    class=${"flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none " + (a.destructive ? "text-destructive hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent hover:text-accent-foreground")}
                    @click=${(e) => (e.stopPropagation(), __privateMethod(this, _ShadDataTable_instances, runAction_fn).call(this, a, row))}
                  >
                    ${a.label}
                  </div>`
    )}
          </div>`
  )}
      </div>
    </shad-table-cell>`;
};
footer_fn = function(total, selCount, page, pageCount) {
  return html`<div class="flex items-center justify-end gap-2 py-4">
      ${when(
    this.selectable,
    () => html`<div class="flex-1 text-sm text-muted-foreground">${selCount} of ${total} row(s) selected.</div>`
  )}
      ${when(
    this.pageSize,
    () => html`<div class="flex items-center gap-2">
          <shad-button variant="outline" size="sm" .disabled=${page === 0} @click=${() => __privateGet(this, _page).set(Math.max(0, page - 1))}
            >Previous</shad-button
          >
          <shad-button
            variant="outline"
            size="sm"
            .disabled=${page >= pageCount - 1}
            @click=${() => __privateGet(this, _page).set(Math.min(pageCount - 1, page + 1))}
            >Next</shad-button
          >
        </div>`
  )}
    </div>`;
};
__decorateElement(_init105, 5, "columns", _columns_dec, ShadDataTable);
__decorateElement(_init105, 5, "data", _data_dec2, ShadDataTable);
__decorateElement(_init105, 5, "rowActions", _rowActions_dec, ShadDataTable);
__decorateElement(_init105, 5, "rowKey", _rowKey_dec, ShadDataTable);
__decorateElement(_init105, 5, "selectable", _selectable_dec, ShadDataTable);
__decorateElement(_init105, 5, "showColumns", _showColumns_dec, ShadDataTable);
__decorateElement(_init105, 5, "pageSize", _pageSize_dec, ShadDataTable);
__decorateElement(_init105, 5, "filterPlaceholder", _filterPlaceholder_dec, ShadDataTable);
ShadDataTable = __decorateElement(_init105, 0, "ShadDataTable", _ShadDataTable_decorators, ShadDataTable);
__publicField(ShadDataTable, "styles", [
  tw,
  css`
      :host { display: block; width: 100%; }
      /* The little dropdown panels (Columns toggle, row actions). */
      .menu {
        position: absolute;
        z-index: 50;
        min-width: 8rem;
        border-radius: 0.375rem;
        border: 1px solid hsl(var(--border));
        background: hsl(var(--popover));
        color: hsl(var(--popover-foreground));
        padding: 0.25rem;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      }
    `
]);
__runInitializers(_init105, 1, ShadDataTable);

// examples/shad/tailwind.gen.css
var tailwind_gen_default = `/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */
@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b)))){*,:before,:after,::backdrop{--tw-translate-x:0;--tw-translate-y:0;--tw-translate-z:0;--tw-rotate-x:initial;--tw-rotate-y:initial;--tw-rotate-z:initial;--tw-skew-x:initial;--tw-skew-y:initial;--tw-space-y-reverse:0;--tw-border-style:solid;--tw-gradient-position:initial;--tw-gradient-from:#0000;--tw-gradient-via:#0000;--tw-gradient-to:#0000;--tw-gradient-stops:initial;--tw-gradient-via-stops:initial;--tw-gradient-from-position:0%;--tw-gradient-via-position:50%;--tw-gradient-to-position:100%;--tw-leading:initial;--tw-font-weight:initial;--tw-tracking:initial;--tw-ordinal:initial;--tw-slashed-zero:initial;--tw-numeric-figure:initial;--tw-numeric-spacing:initial;--tw-numeric-fraction:initial;--tw-shadow:0 0 #0000;--tw-shadow-color:initial;--tw-shadow-alpha:100%;--tw-inset-shadow:0 0 #0000;--tw-inset-shadow-color:initial;--tw-inset-shadow-alpha:100%;--tw-ring-color:initial;--tw-ring-shadow:0 0 #0000;--tw-inset-ring-color:initial;--tw-inset-ring-shadow:0 0 #0000;--tw-ring-inset:initial;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-offset-shadow:0 0 #0000;--tw-outline-style:solid;--tw-blur:initial;--tw-brightness:initial;--tw-contrast:initial;--tw-grayscale:initial;--tw-hue-rotate:initial;--tw-invert:initial;--tw-opacity:initial;--tw-saturate:initial;--tw-sepia:initial;--tw-drop-shadow:initial;--tw-drop-shadow-color:initial;--tw-drop-shadow-alpha:100%;--tw-drop-shadow-size:initial;--tw-backdrop-blur:initial;--tw-backdrop-brightness:initial;--tw-backdrop-contrast:initial;--tw-backdrop-grayscale:initial;--tw-backdrop-hue-rotate:initial;--tw-backdrop-invert:initial;--tw-backdrop-opacity:initial;--tw-backdrop-saturate:initial;--tw-backdrop-sepia:initial;--tw-duration:initial}}}@layer theme{:root,:host{--font-sans:ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";--font-mono:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;--color-amber-500:oklch(76.9% .188 70.08);--color-green-500:oklch(72.3% .219 149.579);--color-green-600:oklch(62.7% .194 149.214);--color-emerald-500:oklch(69.6% .17 162.48);--color-sky-400:oklch(74.6% .16 232.661);--color-sky-500:oklch(68.5% .169 237.323);--color-sky-600:oklch(58.8% .158 241.966);--color-blue-500:oklch(62.3% .214 259.815);--color-indigo-500:oklch(58.5% .233 277.117);--color-black:#000;--color-white:#fff;--spacing:.25rem;--container-xs:20rem;--container-sm:24rem;--container-md:28rem;--container-lg:32rem;--container-3xl:48rem;--text-xs:.75rem;--text-xs--line-height:calc(1 / .75);--text-sm:.875rem;--text-sm--line-height:calc(1.25 / .875);--text-base:1rem;--text-base--line-height:calc(1.5 / 1);--text-lg:1.125rem;--text-lg--line-height:calc(1.75 / 1.125);--text-xl:1.25rem;--text-xl--line-height:calc(1.75 / 1.25);--text-3xl:1.875rem;--text-3xl--line-height:calc(2.25 / 1.875);--text-6xl:3.75rem;--text-6xl--line-height:1;--font-weight-normal:400;--font-weight-medium:500;--font-weight-semibold:600;--font-weight-bold:700;--tracking-tighter:-.05em;--tracking-tight:-.025em;--tracking-wide:.025em;--tracking-widest:.1em;--leading-tight:1.25;--leading-snug:1.375;--leading-normal:1.5;--leading-relaxed:1.625;--radius-sm:.25rem;--radius-md:.375rem;--radius-lg:.5rem;--radius-xl:.75rem;--animate-spin:spin 1s linear infinite;--animate-pulse:pulse 2s cubic-bezier(.4, 0, .6, 1) infinite;--blur-sm:8px;--aspect-video:16 / 9;--default-transition-duration:.15s;--default-transition-timing-function:cubic-bezier(.4, 0, .2, 1);--default-font-family:var(--font-sans);--default-mono-font-family:var(--font-mono)}}@layer base{*,:after,:before,::backdrop{box-sizing:border-box;border:0 solid;margin:0;padding:0}::file-selector-button{box-sizing:border-box;border:0 solid;margin:0;padding:0}html,:host{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-family:var(--default-font-family,ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}hr{height:0;color:inherit;border-top-width:1px}abbr:where([title]){-webkit-text-decoration:underline dotted;text-decoration:underline dotted}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}a{color:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;-webkit-text-decoration:inherit;text-decoration:inherit}b,strong{font-weight:bolder}code,kbd,samp,pre{font-family:var(--default-mono-font-family,ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);font-feature-settings:var(--default-mono-font-feature-settings,normal);font-variation-settings:var(--default-mono-font-variation-settings,normal);font-size:1em}small{font-size:80%}sub,sup{vertical-align:baseline;font-size:75%;line-height:0;position:relative}sub{bottom:-.25em}sup{top:-.5em}table{text-indent:0;border-color:inherit;border-collapse:collapse}:-moz-focusring{outline:auto}progress{vertical-align:baseline}summary{display:list-item}ol,ul,menu{list-style:none}img,svg,video,canvas,audio,iframe,embed,object{vertical-align:middle;display:block}img,video{max-width:100%;height:auto}button,input,select,optgroup,textarea{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}::file-selector-button{font:inherit;font-feature-settings:inherit;font-variation-settings:inherit;letter-spacing:inherit;color:inherit;opacity:1;background-color:#0000;border-radius:0}:where(select:is([multiple],[size])) optgroup{font-weight:bolder}:where(select:is([multiple],[size])) optgroup option{padding-inline-start:20px}::file-selector-button{margin-inline-end:4px}::placeholder{opacity:1}@supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px){::placeholder{color:currentColor}@supports (color:color-mix(in lab, red, red)){::placeholder{color:color-mix(in oklab, currentcolor 50%, transparent)}}}textarea{resize:vertical}::-webkit-search-decoration{-webkit-appearance:none}::-webkit-date-and-time-value{min-height:1lh;text-align:inherit}::-webkit-datetime-edit{display:inline-flex}::-webkit-datetime-edit-fields-wrapper{padding:0}::-webkit-datetime-edit{padding-block:0}::-webkit-datetime-edit-year-field{padding-block:0}::-webkit-datetime-edit-month-field{padding-block:0}::-webkit-datetime-edit-day-field{padding-block:0}::-webkit-datetime-edit-hour-field{padding-block:0}::-webkit-datetime-edit-minute-field{padding-block:0}::-webkit-datetime-edit-second-field{padding-block:0}::-webkit-datetime-edit-millisecond-field{padding-block:0}::-webkit-datetime-edit-meridiem-field{padding-block:0}::-webkit-calendar-picker-indicator{line-height:1}:-moz-ui-invalid{box-shadow:none}button,input:where([type=button],[type=reset],[type=submit]){appearance:button}::file-selector-button{appearance:button}::-webkit-inner-spin-button{height:auto}::-webkit-outer-spin-button{height:auto}[hidden]:where(:not([hidden=until-found])){display:none!important}}@layer components;@layer utilities{.pointer-events-auto{pointer-events:auto}.pointer-events-none{pointer-events:none}.collapse{visibility:collapse}.invisible{visibility:hidden}.visible{visibility:visible}.sr-only{clip-path:inset(50%);white-space:nowrap;border-width:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}.absolute{position:absolute}.fixed{position:fixed}.relative{position:relative}.static{position:static}.sticky{position:sticky}.inset-0{inset:0}.inset-x-0{inset-inline:0}.inset-y-0{inset-block:0}.start-full{inset-inline-start:100%}.end-full{inset-inline-end:100%}.top-0{top:0}.top-1\\/2{top:50%}.top-2{top:calc(var(--spacing) * 2)}.top-3{top:calc(var(--spacing) * 3)}.top-full{top:100%}.top-px{top:1px}.right-0{right:0}.right-2{right:calc(var(--spacing) * 2)}.right-3{right:calc(var(--spacing) * 3)}.bottom-0{bottom:0}.bottom-full{bottom:100%}.left-0{left:0}.left-1\\.5{left:calc(var(--spacing) * 1.5)}.left-1\\/2{left:50%}.left-2{left:calc(var(--spacing) * 2)}.z-10{z-index:10}.z-50{z-index:50}.col-span-2{grid-column:span 2/span 2}.col-start-2{grid-column-start:2}.row-span-2{grid-row:span 2/span 2}.row-start-1{grid-row-start:1}.container{width:100%}@media (min-width:40rem){.container{max-width:40rem}}@media (min-width:48rem){.container{max-width:48rem}}@media (min-width:64rem){.container{max-width:64rem}}@media (min-width:80rem){.container{max-width:80rem}}@media (min-width:96rem){.container{max-width:96rem}}.-mx-1{margin-inline:calc(var(--spacing) * -1)}.-mx-6{margin-inline:calc(var(--spacing) * -6)}.mx-3\\.5{margin-inline:calc(var(--spacing) * 3.5)}.mx-auto{margin-inline:auto}.my-0{margin-block:0}.my-1{margin-block:var(--spacing)}.my-2{margin-block:calc(var(--spacing) * 2)}.ms-2{margin-inline-start:calc(var(--spacing) * 2)}.me-2{margin-inline-end:calc(var(--spacing) * 2)}.mt-0\\.5{margin-top:calc(var(--spacing) * .5)}.mt-1{margin-top:var(--spacing)}.mt-1\\.5{margin-top:calc(var(--spacing) * 1.5)}.mt-2{margin-top:calc(var(--spacing) * 2)}.mt-3{margin-top:calc(var(--spacing) * 3)}.mt-4{margin-top:calc(var(--spacing) * 4)}.mt-6{margin-top:calc(var(--spacing) * 6)}.mt-12{margin-top:calc(var(--spacing) * 12)}.mt-24{margin-top:calc(var(--spacing) * 24)}.mt-auto{margin-top:auto}.-mb-6{margin-bottom:calc(var(--spacing) * -6)}.mb-1{margin-bottom:var(--spacing)}.mb-2{margin-bottom:calc(var(--spacing) * 2)}.mb-4{margin-bottom:calc(var(--spacing) * 4)}.mb-5{margin-bottom:calc(var(--spacing) * 5)}.mb-24{margin-bottom:calc(var(--spacing) * 24)}.-ml-3{margin-left:calc(var(--spacing) * -3)}.ml-0\\.5{margin-left:calc(var(--spacing) * .5)}.ml-2{margin-left:calc(var(--spacing) * 2)}.ml-4{margin-left:calc(var(--spacing) * 4)}.ml-auto{margin-left:auto}.line-clamp-1{-webkit-line-clamp:1;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.line-clamp-2{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.block{display:block}.contents{display:contents}.flex{display:flex}.grid{display:grid}.hidden{display:none}.inline{display:inline}.inline-block{display:inline-block}.inline-flex{display:inline-flex}.table{display:table}.table-cell{display:table-cell}.table-row{display:table-row}.aspect-square{aspect-ratio:1}.aspect-video{aspect-ratio:var(--aspect-video)}.size-2{width:calc(var(--spacing) * 2);height:calc(var(--spacing) * 2)}.size-3{width:calc(var(--spacing) * 3);height:calc(var(--spacing) * 3)}.size-4{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}.size-6{width:calc(var(--spacing) * 6);height:calc(var(--spacing) * 6)}.size-8{width:calc(var(--spacing) * 8);height:calc(var(--spacing) * 8)}.size-9{width:calc(var(--spacing) * 9);height:calc(var(--spacing) * 9)}.size-10{width:calc(var(--spacing) * 10);height:calc(var(--spacing) * 10)}.size-full{width:100%;height:100%}.\\!h-4{height:calc(var(--spacing) * 4)!important}.\\!h-5{height:calc(var(--spacing) * 5)!important}.h-1{height:var(--spacing)}.h-1\\.5{height:calc(var(--spacing) * 1.5)}.h-2{height:calc(var(--spacing) * 2)}.h-2\\.5{height:calc(var(--spacing) * 2.5)}.h-3{height:calc(var(--spacing) * 3)}.h-3\\.5{height:calc(var(--spacing) * 3.5)}.h-4{height:calc(var(--spacing) * 4)}.h-5{height:calc(var(--spacing) * 5)}.h-6{height:calc(var(--spacing) * 6)}.h-7{height:calc(var(--spacing) * 7)}.h-8{height:calc(var(--spacing) * 8)}.h-9{height:calc(var(--spacing) * 9)}.h-10{height:calc(var(--spacing) * 10)}.h-11{height:calc(var(--spacing) * 11)}.h-12{height:calc(var(--spacing) * 12)}.h-14{height:calc(var(--spacing) * 14)}.h-24{height:calc(var(--spacing) * 24)}.h-28{height:calc(var(--spacing) * 28)}.h-32{height:calc(var(--spacing) * 32)}.h-40{height:calc(var(--spacing) * 40)}.h-44{height:calc(var(--spacing) * 44)}.h-56{height:calc(var(--spacing) * 56)}.h-72{height:calc(var(--spacing) * 72)}.h-80{height:calc(var(--spacing) * 80)}.h-\\[1\\.15rem\\]{height:1.15rem}.h-\\[120px\\]{height:120px}.h-\\[125px\\]{height:125px}.h-\\[160px\\]{height:160px}.h-\\[220px\\]{height:220px}.h-\\[460px\\]{height:460px}.h-auto{height:auto}.h-full{height:100%}.h-px{height:1px}.max-h-80{max-height:calc(var(--spacing) * 80)}.max-h-\\[80vh\\]{max-height:80vh}.max-h-\\[104px\\]{max-height:104px}.max-h-\\[calc\\(100vh-2rem\\)\\]{max-height:calc(100vh - 2rem)}.min-h-0{min-height:0}.min-h-40{min-height:calc(var(--spacing) * 40)}.min-h-\\[80px\\]{min-height:80px}.min-h-\\[260px\\]{min-height:260px}.min-h-\\[280px\\]{min-height:280px}.w-1\\.5{width:calc(var(--spacing) * 1.5)}.w-2{width:calc(var(--spacing) * 2)}.w-2\\.5{width:calc(var(--spacing) * 2.5)}.w-3{width:calc(var(--spacing) * 3)}.w-3\\.5{width:calc(var(--spacing) * 3.5)}.w-3\\/4{width:75%}.w-4{width:calc(var(--spacing) * 4)}.w-5{width:calc(var(--spacing) * 5)}.w-6{width:calc(var(--spacing) * 6)}.w-7{width:calc(var(--spacing) * 7)}.w-8{width:calc(var(--spacing) * 8)}.w-9{width:calc(var(--spacing) * 9)}.w-10{width:calc(var(--spacing) * 10)}.w-12{width:calc(var(--spacing) * 12)}.w-14{width:calc(var(--spacing) * 14)}.w-16{width:calc(var(--spacing) * 16)}.w-20{width:calc(var(--spacing) * 20)}.w-24{width:calc(var(--spacing) * 24)}.w-32{width:calc(var(--spacing) * 32)}.w-48{width:calc(var(--spacing) * 48)}.w-56{width:calc(var(--spacing) * 56)}.w-64{width:calc(var(--spacing) * 64)}.w-72{width:calc(var(--spacing) * 72)}.w-80{width:calc(var(--spacing) * 80)}.w-96{width:calc(var(--spacing) * 96)}.w-\\[100px\\]{width:100px}.w-\\[200px\\]{width:200px}.w-\\[250px\\]{width:250px}.w-\\[260px\\]{width:260px}.w-\\[356px\\]{width:356px}.w-\\[420px\\]{width:420px}.w-\\[500px\\]{width:500px}.w-\\[520px\\]{width:520px}.w-fit{width:fit-content}.w-full{width:100%}.w-max{width:max-content}.w-px{width:1px}.max-w-3xl{max-width:var(--container-3xl)}.max-w-48{max-width:calc(var(--spacing) * 48)}.max-w-\\[14rem\\]{max-width:14rem}.max-w-\\[16rem\\]{max-width:16rem}.max-w-\\[260px\\]{max-width:260px}.max-w-\\[280px\\]{max-width:280px}.max-w-\\[420px\\]{max-width:420px}.max-w-\\[calc\\(100\\%-2rem\\)\\]{max-width:calc(100% - 2rem)}.max-w-\\[calc\\(100vw-2rem\\)\\]{max-width:calc(100vw - 2rem)}.max-w-full{max-width:100%}.max-w-lg{max-width:var(--container-lg)}.max-w-md{max-width:var(--container-md)}.max-w-sm{max-width:var(--container-sm)}.max-w-xs{max-width:var(--container-xs)}.min-w-0{min-width:0}.min-w-5{min-width:calc(var(--spacing) * 5)}.min-w-\\[8rem\\]{min-width:8rem}.min-w-\\[12rem\\]{min-width:12rem}.flex-1{flex:1}.flex-shrink{flex-shrink:1}.shrink-0{flex-shrink:0}.flex-grow,.grow{flex-grow:1}.border-collapse{border-collapse:collapse}.-translate-x-1\\/2{--tw-translate-x:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.-translate-y-1\\/2{--tw-translate-y:calc(calc(1 / 2 * 100%) * -1);translate:var(--tw-translate-x) var(--tw-translate-y)}.translate-y-0\\.5{--tw-translate-y:calc(var(--spacing) * .5);translate:var(--tw-translate-x) var(--tw-translate-y)}.transform{transform:var(--tw-rotate-x,) var(--tw-rotate-y,) var(--tw-rotate-z,) var(--tw-skew-x,) var(--tw-skew-y,)}.animate-pulse{animation:var(--animate-pulse)}.animate-spin{animation:var(--animate-spin)}.cursor-default{cursor:default}.cursor-grab{cursor:grab}.cursor-pointer{cursor:pointer}.cursor-text{cursor:text}.touch-none{touch-action:none}.resize{resize:both}.resize-none{resize:none}.list-none{list-style-type:none}.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.grid-cols-\\[1fr_auto\\]{grid-template-columns:1fr auto}.grid-cols-\\[auto_1fr\\]{grid-template-columns:auto 1fr}.flex-col{flex-direction:column}.flex-col-reverse{flex-direction:column-reverse}.flex-row{flex-direction:row}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.items-end{align-items:flex-end}.items-start{align-items:flex-start}.items-stretch{align-items:stretch}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.justify-end{justify-content:flex-end}.justify-start{justify-content:flex-start}.gap-0\\.5{gap:calc(var(--spacing) * .5)}.gap-1{gap:var(--spacing)}.gap-1\\.5{gap:calc(var(--spacing) * 1.5)}.gap-2{gap:calc(var(--spacing) * 2)}.gap-2\\.5{gap:calc(var(--spacing) * 2.5)}.gap-3{gap:calc(var(--spacing) * 3)}.gap-4{gap:calc(var(--spacing) * 4)}.gap-5{gap:calc(var(--spacing) * 5)}.gap-6{gap:calc(var(--spacing) * 6)}.gap-8{gap:calc(var(--spacing) * 8)}:where(.space-y-1>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(var(--spacing) * var(--tw-space-y-reverse));margin-block-end:calc(var(--spacing) * calc(1 - var(--tw-space-y-reverse)))}:where(.space-y-1\\.5>:not(:last-child)){--tw-space-y-reverse:0;margin-block-start:calc(calc(var(--spacing) * 1.5) * var(--tw-space-y-reverse));margin-block-end:calc(calc(var(--spacing) * 1.5) * calc(1 - var(--tw-space-y-reverse)))}.gap-x-3{column-gap:calc(var(--spacing) * 3)}.gap-y-0\\.5{row-gap:calc(var(--spacing) * .5)}.gap-y-1\\.5{row-gap:calc(var(--spacing) * 1.5)}.self-end{align-self:flex-end}.self-start{align-self:flex-start}.justify-self-end{justify-self:flex-end}.truncate{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}.overflow-x-auto{overflow-x:auto}.overflow-x-hidden{overflow-x:hidden}.overflow-y-auto{overflow-y:auto}.rounded{border-radius:.25rem}.rounded-\\[2px\\]{border-radius:2px}.rounded-\\[inherit\\]{border-radius:inherit}.rounded-full{border-radius:3.40282e38px}.rounded-lg{border-radius:var(--radius-lg)}.rounded-md{border-radius:var(--radius-md)}.rounded-none{border-radius:0}.rounded-sm{border-radius:var(--radius-sm)}.rounded-xl{border-radius:var(--radius-xl)}.rounded-t-xl{border-top-left-radius:var(--radius-xl);border-top-right-radius:var(--radius-xl)}.rounded-l-xl{border-top-left-radius:var(--radius-xl);border-bottom-left-radius:var(--radius-xl)}.rounded-r-md{border-top-right-radius:var(--radius-md);border-bottom-right-radius:var(--radius-md)}.rounded-r-xl{border-top-right-radius:var(--radius-xl);border-bottom-right-radius:var(--radius-xl)}.rounded-b-xl{border-bottom-right-radius:var(--radius-xl);border-bottom-left-radius:var(--radius-xl)}.border{border-style:var(--tw-border-style);border-width:1px}.border-0{border-style:var(--tw-border-style);border-width:0}.border-y{border-block-style:var(--tw-border-style);border-block-width:1px}.border-t{border-top-style:var(--tw-border-style);border-top-width:1px}.border-r{border-right-style:var(--tw-border-style);border-right-width:1px}.border-b{border-bottom-style:var(--tw-border-style);border-bottom-width:1px}.border-l{border-left-style:var(--tw-border-style);border-left-width:1px}.border-dashed{--tw-border-style:dashed;border-style:dashed}.border-border{border-color:hsl(var(--border))}.border-destructive,.border-destructive\\/50{border-color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.border-destructive\\/50{border-color:color-mix(in oklab, hsl(var(--destructive)) 50%, transparent)}}.border-input{border-color:hsl(var(--input))}.border-primary{border-color:hsl(var(--primary))}.border-ring{border-color:hsl(var(--ring))}.border-sky-500{border-color:var(--color-sky-500)}.border-transparent{border-color:#0000}.bg-accent{background-color:hsl(var(--accent))}.bg-amber-500{background-color:var(--color-amber-500)}.bg-background{background-color:hsl(var(--background))}.bg-black\\/50{background-color:#00000080}@supports (color:color-mix(in lab, red, red)){.bg-black\\/50{background-color:color-mix(in oklab, var(--color-black) 50%, transparent)}}.bg-border{background-color:hsl(var(--border))}.bg-card{background-color:hsl(var(--card))}.bg-destructive,.bg-destructive\\/20{background-color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.bg-destructive\\/20{background-color:color-mix(in oklab, hsl(var(--destructive)) 20%, transparent)}}.bg-emerald-500{background-color:var(--color-emerald-500)}.bg-foreground{background-color:hsl(var(--foreground))}.bg-green-500{background-color:var(--color-green-500)}.bg-input{background-color:hsl(var(--input))}.bg-muted,.bg-muted\\/40{background-color:hsl(var(--muted))}@supports (color:color-mix(in lab, red, red)){.bg-muted\\/40{background-color:color-mix(in oklab, hsl(var(--muted)) 40%, transparent)}}.bg-muted\\/50{background-color:hsl(var(--muted))}@supports (color:color-mix(in lab, red, red)){.bg-muted\\/50{background-color:color-mix(in oklab, hsl(var(--muted)) 50%, transparent)}}.bg-popover{background-color:hsl(var(--popover))}.bg-primary{background-color:hsl(var(--primary))}.bg-primary-foreground{background-color:hsl(var(--primary-foreground))}.bg-primary\\/80{background-color:hsl(var(--primary))}@supports (color:color-mix(in lab, red, red)){.bg-primary\\/80{background-color:color-mix(in oklab, hsl(var(--primary)) 80%, transparent)}}.bg-secondary{background-color:hsl(var(--secondary))}.bg-sky-500{background-color:var(--color-sky-500)}.bg-transparent{background-color:#0000}.bg-gradient-to-b{--tw-gradient-position:to bottom in oklab;background-image:linear-gradient(var(--tw-gradient-stops))}.bg-gradient-to-br{--tw-gradient-position:to bottom right in oklab;background-image:linear-gradient(var(--tw-gradient-stops))}.from-muted\\/50{--tw-gradient-from:hsl(var(--muted))}@supports (color:color-mix(in lab, red, red)){.from-muted\\/50{--tw-gradient-from:color-mix(in oklab, hsl(var(--muted)) 50%, transparent)}}.from-muted\\/50{--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.from-sky-400{--tw-gradient-from:var(--color-sky-400);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.to-background{--tw-gradient-to:hsl(var(--background));--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.to-indigo-500{--tw-gradient-to:var(--color-indigo-500);--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))}.object-cover{object-fit:cover}.p-0{padding:0}.p-0\\.5{padding:calc(var(--spacing) * .5)}.p-1{padding:var(--spacing)}.p-1\\.5{padding:calc(var(--spacing) * 1.5)}.p-2{padding:calc(var(--spacing) * 2)}.p-3{padding:calc(var(--spacing) * 3)}.p-3\\.5{padding:calc(var(--spacing) * 3.5)}.p-4{padding:calc(var(--spacing) * 4)}.p-6{padding:calc(var(--spacing) * 6)}.p-10{padding:calc(var(--spacing) * 10)}.p-\\[3px\\]{padding:3px}.px-1{padding-inline:var(--spacing)}.px-1\\.5{padding-inline:calc(var(--spacing) * 1.5)}.px-2{padding-inline:calc(var(--spacing) * 2)}.px-2\\.5{padding-inline:calc(var(--spacing) * 2.5)}.px-3{padding-inline:calc(var(--spacing) * 3)}.px-4{padding-inline:calc(var(--spacing) * 4)}.px-5{padding-inline:calc(var(--spacing) * 5)}.px-6{padding-inline:calc(var(--spacing) * 6)}.px-8{padding-inline:calc(var(--spacing) * 8)}.py-0\\.5{padding-block:calc(var(--spacing) * .5)}.py-1{padding-block:var(--spacing)}.py-1\\.5{padding-block:calc(var(--spacing) * 1.5)}.py-2{padding-block:calc(var(--spacing) * 2)}.py-2\\.5{padding-block:calc(var(--spacing) * 2.5)}.py-3{padding-block:calc(var(--spacing) * 3)}.py-4{padding-block:calc(var(--spacing) * 4)}.py-6{padding-block:calc(var(--spacing) * 6)}.pt-0{padding-top:0}.pt-2{padding-top:calc(var(--spacing) * 2)}.pt-3{padding-top:calc(var(--spacing) * 3)}.pt-4{padding-top:calc(var(--spacing) * 4)}.pt-10{padding-top:calc(var(--spacing) * 10)}.pr-2{padding-right:calc(var(--spacing) * 2)}.pr-3{padding-right:calc(var(--spacing) * 3)}.pr-8{padding-right:calc(var(--spacing) * 8)}.pr-10{padding-right:calc(var(--spacing) * 10)}.pb-2{padding-bottom:calc(var(--spacing) * 2)}.pb-3{padding-bottom:calc(var(--spacing) * 3)}.pb-4{padding-bottom:calc(var(--spacing) * 4)}.pl-2{padding-left:calc(var(--spacing) * 2)}.pl-3{padding-left:calc(var(--spacing) * 3)}.pl-7{padding-left:calc(var(--spacing) * 7)}.pl-8{padding-left:calc(var(--spacing) * 8)}.text-center{text-align:center}.text-left{text-align:left}.text-right{text-align:right}.align-top{vertical-align:top}.font-mono{font-family:var(--font-mono)}.font-sans{font-family:var(--font-sans)}.text-3xl{font-size:var(--text-3xl);line-height:var(--tw-leading,var(--text-3xl--line-height))}.text-6xl{font-size:var(--text-6xl);line-height:var(--tw-leading,var(--text-6xl--line-height))}.text-base{font-size:var(--text-base);line-height:var(--tw-leading,var(--text-base--line-height))}.text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}.text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}.text-xl{font-size:var(--text-xl);line-height:var(--tw-leading,var(--text-xl--line-height))}.text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}.text-\\[0\\.7rem\\],.text-\\[0\\.70rem\\]{font-size:.7rem}.leading-none{--tw-leading:1;line-height:1}.leading-normal{--tw-leading:var(--leading-normal);line-height:var(--leading-normal)}.leading-relaxed{--tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}.leading-snug{--tw-leading:var(--leading-snug);line-height:var(--leading-snug)}.leading-tight{--tw-leading:var(--leading-tight);line-height:var(--leading-tight)}.font-bold{--tw-font-weight:var(--font-weight-bold);font-weight:var(--font-weight-bold)}.font-medium{--tw-font-weight:var(--font-weight-medium);font-weight:var(--font-weight-medium)}.font-normal{--tw-font-weight:var(--font-weight-normal);font-weight:var(--font-weight-normal)}.font-semibold{--tw-font-weight:var(--font-weight-semibold);font-weight:var(--font-weight-semibold)}.tracking-tight{--tw-tracking:var(--tracking-tight);letter-spacing:var(--tracking-tight)}.tracking-tighter{--tw-tracking:var(--tracking-tighter);letter-spacing:var(--tracking-tighter)}.tracking-wide{--tw-tracking:var(--tracking-wide);letter-spacing:var(--tracking-wide)}.tracking-widest{--tw-tracking:var(--tracking-widest);letter-spacing:var(--tracking-widest)}.break-words{overflow-wrap:break-word}.whitespace-nowrap{white-space:nowrap}.text-accent-foreground{color:hsl(var(--accent-foreground))}.text-amber-500{color:var(--color-amber-500)}.text-blue-500{color:var(--color-blue-500)}.text-card-foreground{color:hsl(var(--card-foreground))}.text-destructive{color:hsl(var(--destructive))}.text-destructive-foreground{color:hsl(var(--destructive-foreground))}.text-destructive\\/90{color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.text-destructive\\/90{color:color-mix(in oklab, hsl(var(--destructive)) 90%, transparent)}}.text-foreground{color:hsl(var(--foreground))}.text-green-600{color:var(--color-green-600)}.text-muted-foreground{color:hsl(var(--muted-foreground))}.text-popover-foreground{color:hsl(var(--popover-foreground))}.text-primary{color:hsl(var(--primary))}.text-primary-foreground{color:hsl(var(--primary-foreground))}.text-sky-600{color:var(--color-sky-600)}.text-white{color:var(--color-white)}.capitalize{text-transform:capitalize}.lowercase{text-transform:lowercase}.uppercase{text-transform:uppercase}.italic{font-style:italic}.tabular-nums{--tw-numeric-spacing:tabular-nums;font-variant-numeric:var(--tw-ordinal,) var(--tw-slashed-zero,) var(--tw-numeric-figure,) var(--tw-numeric-spacing,) var(--tw-numeric-fraction,)}.line-through{text-decoration-line:line-through}.no-underline{text-decoration-line:none}.underline-offset-4{text-underline-offset:4px}.opacity-0{opacity:0}.opacity-40{opacity:.4}.opacity-50{opacity:.5}.opacity-70{opacity:.7}.opacity-100{opacity:1}.shadow{--tw-shadow:0 1px 3px 0 var(--tw-shadow-color,#0000001a), 0 1px 2px -1px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-lg{--tw-shadow:0 10px 15px -3px var(--tw-shadow-color,#0000001a), 0 4px 6px -4px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-md{--tw-shadow:0 4px 6px -1px var(--tw-shadow-color,#0000001a), 0 2px 4px -2px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.shadow-sm,.shadow\\/constructable{--tw-shadow:0 1px 3px 0 var(--tw-shadow-color,#0000001a), 0 1px 2px -1px var(--tw-shadow-color,#0000001a);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ring,.ring-1{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(1px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ring-2{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.ring-background{--tw-ring-color:hsl(var(--background))}.ring-destructive\\/30{--tw-ring-color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.ring-destructive\\/30{--tw-ring-color:color-mix(in oklab, hsl(var(--destructive)) 30%, transparent)}}.ring-ring,.ring-ring\\/50{--tw-ring-color:hsl(var(--ring))}@supports (color:color-mix(in lab, red, red)){.ring-ring\\/50{--tw-ring-color:color-mix(in oklab, hsl(var(--ring)) 50%, transparent)}}.ring-offset-background{--tw-ring-offset-color:hsl(var(--background))}.outline{outline-style:var(--tw-outline-style);outline-width:1px}.invert{--tw-invert:invert(100%);filter:var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)}.filter{filter:var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)}.backdrop-blur-sm{--tw-backdrop-blur:blur(var(--blur-sm));-webkit-backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)}.transition{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to,opacity,box-shadow,transform,translate,scale,rotate,filter,-webkit-backdrop-filter,backdrop-filter,display,content-visibility,overlay,pointer-events;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-all{transition-property:all;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-colors{transition-property:color,background-color,border-color,outline-color,text-decoration-color,fill,stroke,--tw-gradient-from,--tw-gradient-via,--tw-gradient-to;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-opacity{transition-property:opacity;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.transition-transform{transition-property:transform,translate,scale,rotate;transition-timing-function:var(--tw-ease,var(--default-transition-timing-function));transition-duration:var(--tw-duration,var(--default-transition-duration))}.duration-200{--tw-duration:.2s;transition-duration:.2s}.outline-none{--tw-outline-style:none;outline-style:none}.select-none{-webkit-user-select:none;user-select:none}@media (hover:hover){.group-hover\\:opacity-100:is(:where(.group):hover *){opacity:1}}.group-data-\\[state\\=collapsed\\]\\/sidebar\\:hidden:is(:where(.group\\/sidebar)[data-state=collapsed] *){display:none}.group-data-\\[state\\=open\\]\\/collapsible\\:rotate-90:is(:where(.group\\/collapsible)[data-state=open] *){rotate:90deg}.placeholder\\:text-muted-foreground::placeholder{color:hsl(var(--muted-foreground))}.first\\:rounded-l-md:first-child{border-top-left-radius:var(--radius-md);border-bottom-left-radius:var(--radius-md)}.first\\:border-l:first-child{border-left-style:var(--tw-border-style);border-left-width:1px}.last\\:rounded-r-md:last-child{border-top-right-radius:var(--radius-md);border-bottom-right-radius:var(--radius-md)}.last\\:border-0:last-child{border-style:var(--tw-border-style);border-width:0}.focus-within\\:border-ring:focus-within{border-color:hsl(var(--ring))}.focus-within\\:ring-2:focus-within{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.focus-within\\:ring-ring\\/50:focus-within{--tw-ring-color:hsl(var(--ring))}@supports (color:color-mix(in lab, red, red)){.focus-within\\:ring-ring\\/50:focus-within{--tw-ring-color:color-mix(in oklab, hsl(var(--ring)) 50%, transparent)}}@media (hover:hover){.hover\\:bg-accent:hover,.hover\\:bg-accent\\/80:hover{background-color:hsl(var(--accent))}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-accent\\/80:hover{background-color:color-mix(in oklab, hsl(var(--accent)) 80%, transparent)}}.hover\\:bg-destructive\\/10:hover{background-color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-destructive\\/10:hover{background-color:color-mix(in oklab, hsl(var(--destructive)) 10%, transparent)}}.hover\\:bg-destructive\\/90:hover{background-color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-destructive\\/90:hover{background-color:color-mix(in oklab, hsl(var(--destructive)) 90%, transparent)}}.hover\\:bg-muted:hover,.hover\\:bg-muted\\/50:hover{background-color:hsl(var(--muted))}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-muted\\/50:hover{background-color:color-mix(in oklab, hsl(var(--muted)) 50%, transparent)}}.hover\\:bg-primary:hover,.hover\\:bg-primary\\/90:hover{background-color:hsl(var(--primary))}@supports (color:color-mix(in lab, red, red)){.hover\\:bg-primary\\/90:hover{background-color:color-mix(in oklab, hsl(var(--primary)) 90%, transparent)}}.hover\\:text-accent-foreground:hover{color:hsl(var(--accent-foreground))}.hover\\:text-destructive:hover{color:hsl(var(--destructive))}.hover\\:text-foreground:hover{color:hsl(var(--foreground))}.hover\\:text-muted-foreground:hover{color:hsl(var(--muted-foreground))}.hover\\:underline:hover{text-decoration-line:underline}.hover\\:ring-4:hover{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(4px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.hover\\:ring-ring\\/30:hover{--tw-ring-color:hsl(var(--ring))}@supports (color:color-mix(in lab, red, red)){.hover\\:ring-ring\\/30:hover{--tw-ring-color:color-mix(in oklab, hsl(var(--ring)) 30%, transparent)}}}.focus\\:bg-muted:focus{background-color:hsl(var(--muted))}.focus\\:outline-none:focus{--tw-outline-style:none;outline-style:none}.focus-visible\\:border-ring:focus-visible{border-color:hsl(var(--ring))}.focus-visible\\:bg-muted:focus-visible{background-color:hsl(var(--muted))}.focus-visible\\:opacity-100:focus-visible{opacity:1}.focus-visible\\:ring-2:focus-visible{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.focus-visible\\:ring-4:focus-visible{--tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(4px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)}.focus-visible\\:ring-destructive:focus-visible,.focus-visible\\:ring-destructive\\/30:focus-visible{--tw-ring-color:hsl(var(--destructive))}@supports (color:color-mix(in lab, red, red)){.focus-visible\\:ring-destructive\\/30:focus-visible{--tw-ring-color:color-mix(in oklab, hsl(var(--destructive)) 30%, transparent)}}.focus-visible\\:ring-ring:focus-visible,.focus-visible\\:ring-ring\\/40:focus-visible{--tw-ring-color:hsl(var(--ring))}@supports (color:color-mix(in lab, red, red)){.focus-visible\\:ring-ring\\/40:focus-visible{--tw-ring-color:color-mix(in oklab, hsl(var(--ring)) 40%, transparent)}}.focus-visible\\:ring-ring\\/50:focus-visible{--tw-ring-color:hsl(var(--ring))}@supports (color:color-mix(in lab, red, red)){.focus-visible\\:ring-ring\\/50:focus-visible{--tw-ring-color:color-mix(in oklab, hsl(var(--ring)) 50%, transparent)}}.focus-visible\\:outline-none:focus-visible{--tw-outline-style:none;outline-style:none}.active\\:translate-y-px:active{--tw-translate-y:1px;translate:var(--tw-translate-x) var(--tw-translate-y)}.active\\:cursor-grabbing:active{cursor:grabbing}.disabled\\:pointer-events-none:disabled{pointer-events:none}.disabled\\:cursor-not-allowed:disabled{cursor:not-allowed}.disabled\\:opacity-40:disabled{opacity:.4}.disabled\\:opacity-50:disabled{opacity:.5}.has-\\[shad-radio-group-item\\[checked\\]\\]\\:border-primary:has(:is(shad-radio-group-item[checked])){border-color:hsl(var(--primary))}.has-\\[shad-radio-group-item\\[checked\\]\\]\\:bg-muted\\/40:has(:is(shad-radio-group-item[checked])){background-color:hsl(var(--muted))}@supports (color:color-mix(in lab, red, red)){.has-\\[shad-radio-group-item\\[checked\\]\\]\\:bg-muted\\/40:has(:is(shad-radio-group-item[checked])){background-color:color-mix(in oklab, hsl(var(--muted)) 40%, transparent)}}.has-\\[shad-switch\\[checked\\]\\]\\:border-primary:has(:is(shad-switch[checked])){border-color:hsl(var(--primary))}.has-\\[shad-switch\\[checked\\]\\]\\:bg-muted\\/40:has(:is(shad-switch[checked])){background-color:hsl(var(--muted))}@supports (color:color-mix(in lab, red, red)){.has-\\[shad-switch\\[checked\\]\\]\\:bg-muted\\/40:has(:is(shad-switch[checked])){background-color:color-mix(in oklab, hsl(var(--muted)) 40%, transparent)}}.aria-expanded\\:bg-accent[aria-expanded=true]{background-color:hsl(var(--accent))}.data-disabled\\:pointer-events-none[data-disabled]{pointer-events:none}@media (min-width:40rem){.sm\\:block{display:block}.sm\\:max-w-lg{max-width:var(--container-lg)}.sm\\:max-w-sm{max-width:var(--container-sm)}.sm\\:flex-row{flex-direction:row}.sm\\:justify-center{justify-content:center}.sm\\:justify-end{justify-content:flex-end}.sm\\:gap-2\\.5{gap:calc(var(--spacing) * 2.5)}}@media (min-width:48rem){.md\\:text-left{text-align:left}}.\\[\\&_a\\]\\:underline a{text-decoration-line:underline}.\\[\\&_a\\]\\:underline-offset-4 a{text-underline-offset:4px}.\\[\\&_a\\:hover\\]\\:text-primary a:hover{color:hsl(var(--primary))}.\\[\\&_p\\]\\:leading-relaxed p{--tw-leading:var(--leading-relaxed);line-height:var(--leading-relaxed)}.\\[\\&_svg\\:not\\(\\[class\\*\\=\\'size-\\'\\]\\)\\]\\:size-3\\.5 svg:not([class*=size-]){width:calc(var(--spacing) * 3.5);height:calc(var(--spacing) * 3.5)}.\\[\\&\\>svg\\]\\:size-4>svg{width:calc(var(--spacing) * 4);height:calc(var(--spacing) * 4)}.\\[\\&\\>svg\\]\\:h-4>svg{height:calc(var(--spacing) * 4)}.\\[\\&\\>svg\\]\\:w-4>svg{width:calc(var(--spacing) * 4)}}@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-y{syntax:"*";inherits:false;initial-value:0}@property --tw-translate-z{syntax:"*";inherits:false;initial-value:0}@property --tw-rotate-x{syntax:"*";inherits:false}@property --tw-rotate-y{syntax:"*";inherits:false}@property --tw-rotate-z{syntax:"*";inherits:false}@property --tw-skew-x{syntax:"*";inherits:false}@property --tw-skew-y{syntax:"*";inherits:false}@property --tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-gradient-position{syntax:"*";inherits:false}@property --tw-gradient-from{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-via{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-to{syntax:"<color>";inherits:false;initial-value:#0000}@property --tw-gradient-stops{syntax:"*";inherits:false}@property --tw-gradient-via-stops{syntax:"*";inherits:false}@property --tw-gradient-from-position{syntax:"<length-percentage>";inherits:false;initial-value:0%}@property --tw-gradient-via-position{syntax:"<length-percentage>";inherits:false;initial-value:50%}@property --tw-gradient-to-position{syntax:"<length-percentage>";inherits:false;initial-value:100%}@property --tw-leading{syntax:"*";inherits:false}@property --tw-font-weight{syntax:"*";inherits:false}@property --tw-tracking{syntax:"*";inherits:false}@property --tw-ordinal{syntax:"*";inherits:false}@property --tw-slashed-zero{syntax:"*";inherits:false}@property --tw-numeric-figure{syntax:"*";inherits:false}@property --tw-numeric-spacing{syntax:"*";inherits:false}@property --tw-numeric-fraction{syntax:"*";inherits:false}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-shadow-color{syntax:"*";inherits:false}@property --tw-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-inset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-shadow-color{syntax:"*";inherits:false}@property --tw-inset-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-ring-color{syntax:"*";inherits:false}@property --tw-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-inset-ring-color{syntax:"*";inherits:false}@property --tw-inset-ring-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-ring-inset{syntax:"*";inherits:false}@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --tw-ring-offset-color{syntax:"*";inherits:false;initial-value:#fff}@property --tw-ring-offset-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-outline-style{syntax:"*";inherits:false;initial-value:solid}@property --tw-blur{syntax:"*";inherits:false}@property --tw-brightness{syntax:"*";inherits:false}@property --tw-contrast{syntax:"*";inherits:false}@property --tw-grayscale{syntax:"*";inherits:false}@property --tw-hue-rotate{syntax:"*";inherits:false}@property --tw-invert{syntax:"*";inherits:false}@property --tw-opacity{syntax:"*";inherits:false}@property --tw-saturate{syntax:"*";inherits:false}@property --tw-sepia{syntax:"*";inherits:false}@property --tw-drop-shadow{syntax:"*";inherits:false}@property --tw-drop-shadow-color{syntax:"*";inherits:false}@property --tw-drop-shadow-alpha{syntax:"<percentage>";inherits:false;initial-value:100%}@property --tw-drop-shadow-size{syntax:"*";inherits:false}@property --tw-backdrop-blur{syntax:"*";inherits:false}@property --tw-backdrop-brightness{syntax:"*";inherits:false}@property --tw-backdrop-contrast{syntax:"*";inherits:false}@property --tw-backdrop-grayscale{syntax:"*";inherits:false}@property --tw-backdrop-hue-rotate{syntax:"*";inherits:false}@property --tw-backdrop-invert{syntax:"*";inherits:false}@property --tw-backdrop-opacity{syntax:"*";inherits:false}@property --tw-backdrop-saturate{syntax:"*";inherits:false}@property --tw-backdrop-sepia{syntax:"*";inherits:false}@property --tw-duration{syntax:"*";inherits:false}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{50%{opacity:.5}}`;

// examples/shad/demos.ts
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function alertDialogDemo(opts = {}) {
  const open = (e) => e.currentTarget.parentElement.querySelector("shad-alert-dialog").show();
  const close = (e) => e.currentTarget.closest("shad-alert-dialog").close();
  return html`
    <div dir=${opts.rtl ? "rtl" : "ltr"}>
      <shad-button variant="outline" @click=${open}>Show Dialog</shad-button>
      <shad-alert-dialog size=${opts.size ?? "default"}>
        ${opts.media ? html`<div slot="media" class="flex h-28 items-center justify-center bg-muted">
              <svg class="h-10 w-10 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </div>` : ""}
        <span slot="title">${opts.destructive ? "Delete account?" : "Are you absolutely sure?"}</span>
        <span slot="description"
          >${opts.destructive ? "This permanently deletes your account and all of its data. This cannot be undone." : "This action cannot be undone. This will permanently delete your account and remove your data from our servers."}</span
        >
        <shad-button slot="footer" variant="outline" @click=${close}>Cancel</shad-button>
        <shad-button slot="footer" variant=${opts.destructive ? "destructive" : "default"} @click=${close}
          >${opts.destructive ? "Delete" : "Continue"}</shad-button
        >
      </shad-alert-dialog>
    </div>
  `;
}
function dialogDemo(opts = {}) {
  const open = (e) => e.currentTarget.parentElement.querySelector("shad-dialog").show();
  const close = (e) => e.currentTarget.closest("shad-dialog").close();
  const body = opts.long ? html`<div class="flex flex-col gap-3 text-sm text-muted-foreground">
        ${map(
    Array.from({ length: 8 }, (_, i) => i),
    (i) => html`<p>
            §${i + 1}. By accessing this service you agree to the terms. Lorem ipsum dolor sit amet, consectetur
            adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim
            veniam, quis nostrud exercitation ullamco laboris.
          </p>`
  )}
      </div>` : html`<div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <shad-label for="name">Name</shad-label>
          <shad-input id="name" value="Pedro Duarte"></shad-input>
        </div>
        <div class="flex flex-col gap-2">
          <shad-label for="username">Username</shad-label>
          <shad-input id="username" value="@peduarte"></shad-input>
        </div>
      </div>`;
  return html`
    <div dir=${opts.rtl ? "rtl" : "ltr"}>
      <shad-button variant="outline" @click=${open}>Open Dialog</shad-button>
      <shad-dialog close-button=${opts.closeButton === false ? "false" : "true"} sticky-footer=${opts.sticky ? "true" : "false"}>
        <span slot="title">${opts.long ? "Terms of Service" : "Edit profile"}</span>
        <span slot="description"
          >${opts.long ? "Please read these terms carefully before continuing." : "Make changes to your profile here. Click save when you're done."}</span
        >
        ${body}
        ${opts.custom ? html`<shad-button slot="close" variant="outline" size="sm" @click=${close}>Close</shad-button>` : ""}
        <shad-button slot="footer" variant="outline" @click=${close}>Cancel</shad-button>
        <shad-button slot="footer" @click=${close}>Save changes</shad-button>
      </shad-dialog>
    </div>
  `;
}
var GOAL_BARS = [40, 30, 20, 30, 20, 28, 19, 24, 30, 20, 28, 19, 35];
function drawerDemo(opts = {}) {
  const open = (e) => e.currentTarget.parentElement.querySelector("shad-drawer").show();
  const close = (e) => e.currentTarget.closest("shad-drawer").close();
  const bump = (e, delta) => {
    const el2 = e.currentTarget.closest("shad-drawer").querySelector("[data-goal]");
    if (el2) el2.textContent = String(Math.max(0, +el2.textContent + delta));
  };
  const round = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-lg leading-none hover:bg-muted";
  const body = opts.long ? html`<div class="flex flex-col gap-3 text-sm text-muted-foreground">
        ${map(Array.from({ length: 10 }, (_, i) => i), (i) => html`<p>
          §${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
          labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.
        </p>`)}
      </div>` : html`<div class="flex items-center justify-center gap-4">
        <button class=${round} @click=${(e) => bump(e, -10)}>−<span class="sr-only">Decrease</span></button>
        <div class="flex-1 text-center">
          <div class="text-6xl font-bold tracking-tighter" data-goal>350</div>
          <div class="text-[0.70rem] uppercase text-muted-foreground">Calories/day</div>
        </div>
        <button class=${round} @click=${(e) => bump(e, 10)}>+<span class="sr-only">Increase</span></button>
      </div>
      <div class="mt-4 flex h-[120px] items-end justify-between gap-1">
        ${map(GOAL_BARS, (h) => html`<div class="w-full rounded-sm bg-primary/80" style=${`height:${h * 3}px`}></div>`)}
      </div>`;
  return html`
    <div dir=${opts.rtl ? "rtl" : "ltr"}>
      <shad-button variant="outline" @click=${open}>Open Drawer</shad-button>
      <shad-drawer direction=${opts.direction ?? "bottom"} responsive=${opts.responsive ? "true" : "false"}>
        <span slot="title">${opts.long ? "Terms of Service" : "Move Goal"}</span>
        <span slot="description"
          >${opts.long ? "Scroll to read all of it." : "Set your daily activity goal."}</span
        >
        ${body}
        <shad-button slot="footer" @click=${close}>Submit</shad-button>
        <shad-button slot="footer" variant="outline" @click=${close}>Cancel</shad-button>
      </shad-drawer>
    </div>
  `;
}
var icFolderCode = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19h-6a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v4" /><path d="M20 21l2 -2l-2 -2" /><path d="M17 17l-2 2l2 2" /></svg>`;
var icArrowUpRight = html`<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>`;
var igSearch = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>`;
var igChevron = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>`;
var igSpinner = html`<svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>`;
var itBadge = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>`;
var itChevron = html`<svg class="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
var itDots = html`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>`;
var sbTerminal = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2" /><path d="M11 13h4" /><rect width="18" height="18" x="3" y="3" rx="2" /></svg>`;
var sbBot = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></svg>`;
var sbBook = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>`;
var sbSettings = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></svg>`;
var sbChevron = html`<svg class="ml-auto text-muted-foreground transition-transform group-data-[state=open]/collapsible:rotate-90 group-data-[state=collapsed]/sidebar:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
var sbSparkles = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>`;
var sbBadgeCheck = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>`;
var sbBell = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>`;
var sbLogout = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>`;
var sbCard = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>`;
var SB_USER_MENU = [
  { heading: true, label: "shadcn · m@example.com" },
  { label: "Upgrade to Pro", icon: sbSparkles, value: "upgrade" },
  { separator: true },
  { label: "Account", icon: sbBadgeCheck, value: "account" },
  { label: "Billing", icon: sbCard, value: "billing" },
  { label: "Notifications", icon: sbBell, value: "notifications" },
  { separator: true },
  { label: "Log out", icon: sbLogout, value: "logout" }
];
var sbUpDown = html`<svg class="ml-auto text-muted-foreground group-data-[state=collapsed]/sidebar:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>`;
function emptyDemo(opts = {}) {
  const media = opts.media === "avatar" ? html`<shad-empty-media variant="default"><shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar></shad-empty-media>` : opts.media === "group" ? html`<shad-empty-media variant="default">
            <shad-avatar-group>
              <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
              <shad-avatar src="https://github.com/vercel.png" alt="vercel">VC</shad-avatar>
              <shad-avatar alt="plus">+3</shad-avatar>
            </shad-avatar-group>
          </shad-empty-media>` : html`<shad-empty-media variant="icon">${icFolderCode}</shad-empty-media>`;
  const content = opts.media === "input" ? html`<shad-empty-content>
          <shad-input placeholder="Search projects…" class="flex-1"></shad-input>
          <shad-button>Search</shad-button>
        </shad-empty-content>` : html`<shad-empty-content>
          <shad-button>Create Project</shad-button>
          <shad-button variant="outline">Import Project</shad-button>
        </shad-empty-content>`;
  return html`<div class="flex h-80 w-full" dir=${opts.rtl ? "rtl" : "ltr"}>
    <shad-empty variant=${opts.variant ?? "default"}>
      <shad-empty-header>
        ${media}
        <shad-empty-title>No Projects Yet</shad-empty-title>
        <shad-empty-description
          >You haven't created any projects yet. Get started by creating your first project.</shad-empty-description
        >
      </shad-empty-header>
      ${content}
      <shad-button variant="link" size="sm" class="text-muted-foreground">Learn More ${icArrowUpRight}</shad-button>
    </shad-empty>
  </div>`;
}
function hoverCardDemo(opts = {}) {
  return html`<shad-hover-card
    open-delay=${opts.openDelay ?? 200}
    close-delay=${opts.closeDelay ?? 200}
    side=${opts.side ?? "bottom"}
  >
    <shad-button variant="link">${opts.label ?? "@nextjs"}</shad-button>
    <div slot="content" class="flex w-64 flex-col gap-1">
      <div class="font-semibold">@nextjs</div>
      <div>The React Framework – created and maintained by @vercel.</div>
      <div class="mt-1 text-xs text-muted-foreground">Joined December 2021</div>
    </div>
  </shad-hover-card>`;
}
function carouselSlides(n, sizeCls = "aspect-square") {
  return Array.from(
    { length: n },
    (_, i) => html`<div class=${"flex items-center justify-center rounded-lg border border-border bg-muted text-3xl font-semibold " + sizeCls}>${i + 1}</div>`
  );
}
var CHART_DATA = [
  { month: "Jan", desktop: 186, mobile: 80 },
  { month: "Feb", desktop: 305, mobile: 200 },
  { month: "Mar", desktop: 237, mobile: 120 },
  { month: "Apr", desktop: 173, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "Jun", desktop: 264, mobile: 140 }
];
var CHART_CONFIG = {
  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },
  mobile: { label: "Mobile", color: "hsl(var(--chart-2))" }
};
var chartDemo = (type) => html`<div class="w-full max-w-md"><shad-chart type=${type} xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`;
var CHART_CODE = (type) => [
  `<shad-chart type="${type}" xkey="month"></shad-chart>`,
  ``,
  `// data & config are object props — set them in JS:`,
  `const chart = document.querySelector("shad-chart");`,
  `chart.data = [{ month: "Jan", desktop: 186, mobile: 80 }, …];`,
  `chart.config = {`,
  `  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },`,
  `  mobile:  { label: "Mobile",  color: "hsl(var(--chart-2))" },`,
  `};`
].join("\n");
var FW_OPTIONS = [
  { value: "next", label: "Next.js" },
  { value: "svelte", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" }
];
var GROUPED_OPTIONS = [
  { group: "Frontend", value: "next", label: "Next.js" },
  { group: "Frontend", value: "svelte", label: "SvelteKit" },
  { group: "Frontend", value: "astro", label: "Astro" },
  { group: "Frontend", value: "nuxt", label: "Nuxt.js" },
  { group: "Frontend", value: "remix", label: "Remix" },
  { group: "Frontend", value: "solid", label: "SolidStart" },
  { group: "Backend", value: "nest", label: "NestJS" },
  { group: "Backend", value: "express", label: "Express" },
  { group: "Backend", value: "fastify", label: "Fastify" },
  { group: "Backend", value: "hono", label: "Hono" },
  { group: "Backend", value: "adonis", label: "AdonisJS" }
];
var COMBO_CODE = (tag) => [tag, ``, `combobox.options = [{ value: "next", label: "Next.js" }, …];`].join("\n");
var icCalendar = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>`;
var icSmile = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>`;
var icCalc = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M8 14h.01" /><path d="M12 14h.01" /></svg>`;
var icUser = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>`;
var icCard = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>`;
var icGear = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>`;
var icDot = html`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3" /></svg>`;
var CMD_BASIC = [
  { value: "calendar", label: "Calendar", icon: icCalendar },
  { value: "emoji", label: "Search Emoji", icon: icSmile },
  { value: "calc", label: "Calculator", icon: icCalc }
];
var CMD_SHORTCUTS = [
  { value: "profile", label: "Profile", icon: icUser, shortcut: "⌘P" },
  { value: "billing", label: "Billing", icon: icCard, shortcut: "⌘B" },
  { value: "settings", label: "Settings", icon: icGear, shortcut: "⌘S" }
];
var CMD_GROUPS = [
  { group: "Suggestions", value: "calendar", label: "Calendar", icon: icCalendar },
  { group: "Suggestions", value: "emoji", label: "Search Emoji", icon: icSmile },
  { group: "Suggestions", value: "calc", label: "Calculator", icon: icCalc },
  { group: "Settings", value: "profile", label: "Profile", icon: icUser, shortcut: "⌘P" },
  { group: "Settings", value: "billing", label: "Billing", icon: icCard, shortcut: "⌘B" },
  { group: "Settings", value: "settings", label: "Settings", icon: icGear, shortcut: "⌘S" }
];
var CMD_MANY = Array.from({ length: 20 }, (_, i) => ({ value: "item-" + i, label: "Command item " + (i + 1), icon: icDot }));
var cmTrigger = (items) => html`<shad-context-menu .items=${items}>
  <div class="flex aspect-video w-full max-w-xs items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground select-none">
    Right click here
  </div>
</shad-context-menu>`;
var CM_BASIC = [
  { label: "Back", shortcut: "⌘[" },
  { label: "Forward", shortcut: "⌘]", disabled: true },
  { label: "Reload", shortcut: "⌘R" }
];
var CM_ICONS = [
  { label: "Profile", icon: icUser, shortcut: "⌘P" },
  { label: "Billing", icon: icCard },
  { label: "Settings", icon: icGear }
];
var CM_DESTRUCTIVE = [
  { label: "Edit" },
  { label: "Duplicate" },
  { separator: true },
  { label: "Delete", destructive: true, shortcut: "⌘⌫" }
];
var CM_FULL = [
  { label: "Back", shortcut: "⌘[" },
  { label: "Forward", shortcut: "⌘]", disabled: true },
  { label: "Reload", shortcut: "⌘R" },
  {
    label: "More Tools",
    items: [
      { label: "Save Page As…", shortcut: "⌘S" },
      { label: "Create Shortcut…" },
      { separator: true },
      { label: "Developer Tools" }
    ]
  },
  { separator: true },
  { checkbox: true, label: "Show Bookmarks", value: "bookmarks", checked: true },
  { checkbox: true, label: "Show Full URLs", value: "urls" },
  { separator: true },
  { heading: "People" },
  { radio: "people", value: "pedro", label: "Pedro Duarte", checked: true },
  { radio: "people", value: "colm", label: "Colm Tuite" }
];
var CM_CODE = [
  `<shad-context-menu>`,
  `  <div class="trigger">Right click here</div>`,
  `</shad-context-menu>`,
  ``,
  `menu.items = [`,
  `  { label: "Reload", shortcut: "⌘R" },`,
  `  { label: "Delete", destructive: true },`,
  `];`
].join("\n");
var CM_SUB_CODE = [
  `menu.items = [`,
  `  { label: "Reload", shortcut: "⌘R" },`,
  `  { label: "More Tools", items: [{ label: "Developer Tools" }] },`,
  `  { separator: true },`,
  `  { checkbox: true, label: "Show Bookmarks", value: "bm", checked: true },`,
  `  { heading: "People" },`,
  `  { radio: "people", value: "pedro", label: "Pedro Duarte", checked: true },`,
  `];`
].join("\n");
var CMD_CODE = [
  `<shad-command></shad-command>`,
  ``,
  `// icon is an html\`<svg>…</svg>\` template (or an emoji string).`,
  `command.items = [`,
  `  { value: "calendar", label: "Calendar", icon: html\`<svg>…</svg>\` },`,
  `  { value: "settings", label: "Settings", icon: gearIcon, shortcut: "⌘S" },`,
  `];`
].join("\n");
var ddTrigger = (items, trigger) => html`<shad-dropdown-menu .items=${items}>
  ${trigger ?? html`<shad-button variant="outline">Open</shad-button>`}
</shad-dropdown-menu>`;
var DD_BASIC = [
  { heading: true, label: "My Account" },
  { label: "Profile" },
  { label: "Billing" },
  { label: "Settings" },
  { separator: true },
  { label: "Log out" }
];
var DD_SHORTCUTS = [
  { label: "Profile", shortcut: "⇧⌘P" },
  { label: "Billing", shortcut: "⌘B" },
  { label: "Settings", shortcut: "⌘S" },
  { label: "Keyboard shortcuts", shortcut: "⌘K" }
];
var DD_ICONS = [
  { label: "Profile", icon: icUser },
  { label: "Billing", icon: icCard },
  { label: "Settings", icon: icGear }
];
var DD_CHECKBOXES = [
  { heading: true, label: "Appearance" },
  { checkbox: true, label: "Status Bar", value: "status", checked: true },
  { checkbox: true, label: "Activity Bar", value: "activity" },
  { checkbox: true, label: "Panel", value: "panel" }
];
var DD_CHECKBOXES_ICONS = [
  { heading: true, label: "Appearance" },
  { checkbox: true, label: "Status Bar", value: "status", checked: true, icon: icGear },
  { checkbox: true, label: "Activity Bar", value: "activity", icon: icCard },
  { checkbox: true, label: "Panel", value: "panel", icon: icUser }
];
var DD_RADIO = [
  { heading: true, label: "Panel Position" },
  { radio: "pos", value: "top", label: "Top", checked: true },
  { radio: "pos", value: "bottom", label: "Bottom" },
  { radio: "pos", value: "right", label: "Right" }
];
var DD_RADIO_ICONS = [
  { heading: true, label: "Panel Position" },
  { radio: "pos", value: "top", label: "Top", checked: true, icon: icCalendar },
  { radio: "pos", value: "bottom", label: "Bottom", icon: icCard },
  { radio: "pos", value: "right", label: "Right", icon: icGear }
];
var DD_DESTRUCTIVE = [
  { label: "Edit", icon: icGear },
  { label: "Duplicate", icon: icCard },
  { separator: true },
  { label: "Delete", destructive: true, icon: icDot, shortcut: "⌘⌫" }
];
var DD_COMPLEX = [
  { heading: true, label: "My Account" },
  { label: "Profile", shortcut: "⇧⌘P" },
  { label: "Billing", shortcut: "⌘B" },
  { label: "Settings", shortcut: "⌘S" },
  { separator: true },
  { label: "Team" },
  { label: "Invite users", items: [{ label: "Email" }, { label: "Message" }, { separator: true }, { label: "More…" }] },
  { label: "New Team", shortcut: "⌘+T" },
  { separator: true },
  { label: "GitHub" },
  { label: "Support" },
  { label: "API", disabled: true },
  { separator: true },
  { label: "Log out", shortcut: "⇧⌘Q" }
];
var DD_CODE = [
  `<shad-dropdown-menu>`,
  `  <shad-button variant="outline">Open</shad-button>`,
  `</shad-dropdown-menu>`,
  ``,
  `menu.items = [`,
  `  { heading: true, label: "My Account" },`,
  `  { label: "Profile", shortcut: "⇧⌘P" },`,
  `  { separator: true },`,
  `  { label: "Invite users", items: [{ label: "Email" }, { label: "Message" }] }, // submenu`,
  `  { label: "Log out", destructive: true },`,
  `];`,
  `menu.addEventListener("select", (e) => console.log(e.detail));`
].join("\n");
var MB_MENUS = [
  {
    label: "File",
    items: [
      { label: "New Tab", shortcut: "⌘T" },
      { label: "New Window", shortcut: "⌘N" },
      { label: "New Incognito Window", disabled: true },
      { separator: true },
      { label: "Share", items: [{ label: "Email link" }, { label: "Messages" }, { label: "Notes" }] },
      { separator: true },
      { label: "Print…", shortcut: "⌘P" }
    ]
  },
  {
    label: "Edit",
    items: [
      { label: "Undo", shortcut: "⌘Z" },
      { label: "Redo", shortcut: "⇧⌘Z" },
      { separator: true },
      {
        label: "Find",
        items: [{ label: "Search the web" }, { separator: true }, { label: "Find…" }, { label: "Find Next" }, { label: "Find Previous" }]
      },
      { separator: true },
      { label: "Cut" },
      { label: "Copy" },
      { label: "Paste" }
    ]
  },
  {
    label: "View",
    items: [
      { checkbox: true, label: "Bookmarks Bar", value: "bookmarks" },
      { checkbox: true, label: "Full URLs", value: "urls", checked: true },
      { separator: true },
      { label: "Reload", shortcut: "⌘R" },
      { label: "Force Reload", shortcut: "⇧⌘R", disabled: true },
      { separator: true },
      { label: "Toggle Fullscreen" },
      { separator: true },
      { label: "Hide Sidebar" }
    ]
  },
  {
    label: "Profiles",
    items: [
      { heading: true, label: "Profile" },
      { radio: "profile", value: "andy", label: "Andy" },
      { radio: "profile", value: "benoit", label: "Benoit", checked: true },
      { radio: "profile", value: "luis", label: "Luis" },
      { separator: true },
      { label: "Edit…" },
      { separator: true },
      { label: "Add Profile…" }
    ]
  }
];
var MB_ICONS = [
  {
    label: "Account",
    items: [
      { label: "Profile", icon: icUser, shortcut: "⇧⌘P" },
      { label: "Billing", icon: icCard, shortcut: "⌘B" },
      { label: "Settings", icon: icGear, shortcut: "⌘S" },
      { separator: true },
      { label: "Log out", icon: icDot, destructive: true }
    ]
  }
];
var NAV_COMPONENTS = [
  { title: "Alert Dialog", href: "#", description: "A modal dialog that interrupts the user with important content." },
  { title: "Hover Card", href: "#", description: "For sighted users to preview content available behind a link." },
  { title: "Progress", href: "#", description: "Displays an indicator showing the completion progress of a task." },
  { title: "Scroll-area", href: "#", description: "Visually or semantically separates content." },
  { title: "Tabs", href: "#", description: "Layered sections of content displayed one at a time." },
  { title: "Tooltip", href: "#", description: "A popup that displays information related to an element on hover." }
];
var NAV_ITEMS = [
  {
    label: "Getting started",
    width: "w-96",
    links: [
      { title: "Introduction", href: "#", description: "Re-usable components built with Tailwind CSS." },
      { title: "Installation", href: "#", description: "How to install dependencies and structure your app." },
      { title: "Typography", href: "#", description: "Styles for headings, paragraphs, lists…etc" }
    ]
  },
  { label: "Components", cols: 2, width: "w-[520px]", links: NAV_COMPONENTS },
  { label: "Docs", href: "#" }
];
var INVOICES = [
  { invoice: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
  { invoice: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
  { invoice: "INV003", status: "Unpaid", method: "Bank Transfer", amount: "$350.00" },
  { invoice: "INV004", status: "Paid", method: "Credit Card", amount: "$450.00" },
  { invoice: "INV005", status: "Paid", method: "PayPal", amount: "$550.00" }
];
function basicTable() {
  return html`<div class="w-full">
    <shad-table>
      <shad-table-header>
        <shad-table-row>
          <shad-table-head>Invoice</shad-table-head>
          <shad-table-head>Status</shad-table-head>
          <shad-table-head>Method</shad-table-head>
          <shad-table-head align="end">Amount</shad-table-head>
        </shad-table-row>
      </shad-table-header>
      <shad-table-body>
        ${map(
    INVOICES,
    (inv) => html`<shad-table-row>
            <shad-table-cell class="font-medium">${inv.invoice}</shad-table-cell>
            <shad-table-cell>${inv.status}</shad-table-cell>
            <shad-table-cell>${inv.method}</shad-table-cell>
            <shad-table-cell align="end">${inv.amount}</shad-table-cell>
          </shad-table-row>`
  )}
      </shad-table-body>
    </shad-table>
  </div>`;
}
var BASIC_TABLE_CODE = [
  `<shad-table>`,
  `  <shad-table-header>`,
  `    <shad-table-row>`,
  `      <shad-table-head>Invoice</shad-table-head>`,
  `      <shad-table-head>Status</shad-table-head>`,
  `      <shad-table-head align="end">Amount</shad-table-head>`,
  `    </shad-table-row>`,
  `  </shad-table-header>`,
  `  <shad-table-body>`,
  `    <shad-table-row>`,
  `      <shad-table-cell class="font-medium">INV001</shad-table-cell>`,
  `      <shad-table-cell>Paid</shad-table-cell>`,
  `      <shad-table-cell align="end">$250.00</shad-table-cell>`,
  `    </shad-table-row>`,
  `  </shad-table-body>`,
  `</shad-table>`
].join("\n");
var PAYMENTS = [
  { id: "m5gr84i9", status: "success", email: "ken99@example.com", amount: 316 },
  { id: "3u1reuv4", status: "success", email: "Abe45@example.com", amount: 242 },
  { id: "derv1ws0", status: "processing", email: "Monserrat44@example.com", amount: 837 },
  { id: "5kma53ae", status: "success", email: "Silas22@example.com", amount: 874 },
  { id: "bhqecj4p", status: "failed", email: "carmella@example.com", amount: 721 },
  { id: "p0r8nf2q", status: "processing", email: "jolie.green@example.com", amount: 459 },
  { id: "x7tz1k9w", status: "success", email: "marvin.h@example.com", amount: 128 },
  { id: "qa3lm8vd", status: "failed", email: "estell.brakus@example.com", amount: 642 },
  { id: "z9pn4c6y", status: "success", email: "lue.runte@example.com", amount: 503 },
  { id: "k2wd7s1b", status: "processing", email: "tanya.bauch@example.com", amount: 217 },
  { id: "v6hb3x8m", status: "success", email: "alfreda.k@example.com", amount: 956 },
  { id: "n4qj5t2r", status: "failed", email: "wilburn.d@example.com", amount: 388 }
];
var DT_COLUMNS = [
  { key: "status", header: "Status", class: "capitalize" },
  { key: "email", header: "Email", sortable: true, filterable: true, class: "lowercase" },
  {
    key: "amount",
    header: "Amount",
    align: "end",
    class: "text-right font-medium",
    cell: (r) => `$${r.amount.toFixed(2)}`
  }
];
var DT_ACTIONS = [
  { label: "Copy payment ID", value: "copy" },
  { separator: true },
  { label: "View customer", value: "customer" },
  { label: "View payment details", value: "details" }
];
function dataTable(opts = {}) {
  return html`<div class="w-full">
    <shad-data-table
      row-key="id"
      .columns=${DT_COLUMNS}
      .data=${PAYMENTS}
      .selectable=${opts.selectable ?? false}
      .showColumns=${opts.showColumns ?? false}
      .pageSize=${opts.pageSize ?? 0}
      .rowActions=${opts.actions ? DT_ACTIONS : []}
    ></shad-data-table>
  </div>`;
}
var DT_FULL_CODE = [
  `<shad-data-table row-key="id" selectable show-columns page-size="5"></shad-data-table>`,
  ``,
  `const t = document.querySelector("shad-data-table");`,
  `t.columns = [`,
  `  { key: "status", header: "Status", class: "capitalize" },`,
  `  { key: "email", header: "Email", sortable: true, filterable: true, class: "lowercase" },`,
  `  { key: "amount", header: "Amount", align: "end",`,
  `    cell: (r) => \`$\${r.amount.toFixed(2)}\`, class: "text-right font-medium" },`,
  `];`,
  `t.data = payments;`,
  `t.rowActions = [`,
  `  { label: "Copy payment ID", value: "copy" },`,
  `  { separator: true },`,
  `  { label: "View customer", value: "customer" },`,
  `];`,
  `t.addEventListener("selectionchange", (e) => console.log(e.detail)); // selected rows`,
  `t.addEventListener("rowaction", (e) => console.log(e.detail));       // { action, row }`
].join("\n");
var DEMOS = {
  "data-table": {
    title: "Data Table",
    description: "Powerful table and datagrids built with composable parts — sorting, filtering, pagination, row selection and actions.",
    examples: [
      { name: "Basic Table", render: basicTable, code: BASIC_TABLE_CODE },
      {
        name: "Data Table",
        render: () => dataTable({ selectable: true, showColumns: true, pageSize: 5, actions: true }),
        code: DT_FULL_CODE
      },
      {
        name: "Sorting",
        render: () => dataTable({}),
        code: `// Mark a column sortable → its header becomes a button that toggles asc/desc.
{ key: "email", header: "Email", sortable: true }`
      },
      {
        name: "Filtering",
        render: () => dataTable({}),
        code: `// A filterable column adds a toolbar input that filters on that field.
{ key: "email", header: "Email", filterable: true }`
      },
      {
        name: "Pagination",
        render: () => dataTable({ pageSize: 5 }),
        code: `<shad-data-table page-size="5"></shad-data-table>`
      },
      {
        name: "Row Selection",
        render: () => dataTable({ selectable: true }),
        code: `<shad-data-table selectable></shad-data-table>

t.addEventListener("selectionchange", (e) => console.log(e.detail));`
      },
      {
        name: "Column Visibility",
        render: () => dataTable({ showColumns: true }),
        code: `<shad-data-table show-columns></shad-data-table> <!-- adds the "Columns" menu -->`
      },
      {
        name: "Row Actions",
        render: () => dataTable({ actions: true }),
        code: `t.rowActions = [
  { label: "Copy payment ID", value: "copy" },
  { separator: true },
  { label: "View customer", value: "customer" },
];
t.addEventListener("rowaction", (e) => console.log(e.detail)); // { action, row }`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl">${dataTable({ selectable: true, showColumns: true, pageSize: 5, actions: true })}</div>`,
        code: `<div dir="rtl"><shad-data-table …></shad-data-table></div>`
      }
    ],
    api: {
      props: [
        { name: "columns", type: "DataTableColumn[]", default: "[]", description: "Column definitions (key, header, sortable, align, cell, class, filterable, hideable)." },
        { name: "data", type: "object[]", default: "[]", description: "The row objects to render." },
        { name: "rowKey", type: "string", default: '""', description: "Field used as a stable row id for selection (falls back to a JSON key)." },
        { name: "selectable", type: "boolean", default: "false", description: "Adds a checkbox column (select all + per row)." },
        { name: "showColumns", type: "boolean", default: "false", description: 'Adds the "Columns" visibility dropdown to the toolbar.' },
        { name: "pageSize", type: "number", default: "0", description: "Rows per page; 0 disables pagination." },
        { name: "rowActions", type: "RowAction[]", default: "[]", description: "Per-row ellipsis menu; empty hides the actions column." },
        { name: "filterPlaceholder", type: "string", default: '""', description: "Override the toolbar filter input placeholder." }
      ],
      events: [
        { name: "selectionchange", detail: "object[]", description: "Selection changed; detail is the array of selected rows." },
        { name: "rowaction", detail: "{ action, row }", description: "A row-action item was chosen." },
        { name: "sortchange", detail: "{ key, dir }", description: "The sort column or direction changed." }
      ],
      extend: [
        `import { ShadDataTable } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose the primitives yourself for full control, or drive the`,
        `// high-level grid declaratively:`,
        `class PaymentsTable extends ShadDataTable {`,
        `  columns = [`,
        `    { key: "status", header: "Status", class: "capitalize" },`,
        `    { key: "email", header: "Email", sortable: true, filterable: true },`,
        `    { key: "amount", header: "Amount", align: "end",`,
        `      cell: (r) => \`$\${r.amount.toFixed(2)}\` },`,
        `  ];`,
        `  selectable = true;`,
        `  pageSize = 10;`,
        `}`
      ].join("\n")
    }
  },
  button: {
    title: "Button",
    description: "Displays a button or a component that looks like a button.",
    examples: [
      { name: "Default", render: () => html`<shad-button>Button</shad-button>` },
      { name: "Secondary", render: () => html`<shad-button variant="secondary">Secondary</shad-button>` },
      { name: "Destructive", render: () => html`<shad-button variant="destructive">Destructive</shad-button>` },
      { name: "Outline", render: () => html`<shad-button variant="outline">Outline</shad-button>` },
      { name: "Ghost", render: () => html`<shad-button variant="ghost">Ghost</shad-button>` },
      { name: "Link", render: () => html`<shad-button variant="link">Link</shad-button>` },
      {
        name: "Sizes",
        render: () => html`
          <div class="flex flex-wrap items-center gap-3">
            <shad-button size="sm">Small</shad-button>
            <shad-button>Default</shad-button>
            <shad-button size="lg">Large</shad-button>
          </div>
        `
      },
      { name: "Disabled", render: () => html`<shad-button disabled>Disabled</shad-button>` }
    ],
    api: {
      props: [
        {
          name: "variant",
          type: `"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"`,
          default: `"default"`,
          description: "Visual style of the button."
        },
        {
          name: "size",
          type: `"default" | "sm" | "lg" | "icon"`,
          default: `"default"`,
          description: "Size preset (height + horizontal padding)."
        },
        {
          name: "disabled",
          type: "boolean",
          default: "false",
          description: "Disables interaction and dims the button."
        }
      ],
      slots: [{ name: "(default)", description: "The button's label / content." }],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadButton } from "@youneed/dom-ui-shad";`,
        ``,
        `// Reuse ShadButton's variants & sizes, prepend an icon.`,
        `@Component.define()`,
        `export class IconButton extends ShadButton {`,
        `  static tagName = "icon-button";`,
        ``,
        `  @Component.prop({ attribute: true }) icon = "★";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      <span class="inline-flex items-center gap-2">`,
        `        <span aria-hidden="true">\${this.icon}</span>`,
        `        \${super.render()}`,
        `      </span>\`;`,
        `  }`,
        `}`,
        ``,
        `// <icon-button variant="outline" size="sm">Star</icon-button>`
      ].join("\n")
    }
  },
  "button-group": {
    title: "Button Group",
    description: "Groups related buttons into a single segmented control.",
    examples: [
      {
        name: "Orientation",
        render: () => html`
          <div class="flex flex-col items-start gap-6">
            <shad-button-group>
              <shad-button variant="outline">Years</shad-button>
              <shad-button variant="outline">Months</shad-button>
              <shad-button variant="outline">Days</shad-button>
            </shad-button-group>
            <shad-button-group orientation="vertical">
              <shad-button variant="outline">Top</shad-button>
              <shad-button variant="outline">Middle</shad-button>
              <shad-button variant="outline">Bottom</shad-button>
            </shad-button-group>
          </div>
        `
      },
      {
        name: "Size",
        render: () => html`
          <div class="flex flex-col items-start gap-4">
            <shad-button-group>
              <shad-button variant="outline" size="sm">One</shad-button>
              <shad-button variant="outline" size="sm">Two</shad-button>
              <shad-button variant="outline" size="sm">Three</shad-button>
            </shad-button-group>
            <shad-button-group>
              <shad-button variant="outline" size="lg">One</shad-button>
              <shad-button variant="outline" size="lg">Two</shad-button>
              <shad-button variant="outline" size="lg">Three</shad-button>
            </shad-button-group>
          </div>
        `
      },
      {
        name: "Separator",
        render: () => html`
          <shad-button-group>
            <shad-button variant="outline">Copy</shad-button>
            <shad-button-group-separator></shad-button-group-separator>
            <shad-button variant="outline">Paste</shad-button>
            <shad-button-group-separator></shad-button-group-separator>
            <shad-button variant="outline">Cut</shad-button>
          </shad-button-group>
        `
      },
      {
        name: "Split",
        render: () => html`
          <shad-button-group>
            <shad-button>Save</shad-button>
            <shad-button size="icon" aria-label="More options">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </shad-button>
          </shad-button-group>
        `
      },
      {
        name: "Text",
        render: () => html`
          <shad-button-group>
            <shad-button-group-text>https://</shad-button-group-text>
            <shad-button variant="outline">example.com</shad-button>
          </shad-button-group>
        `
      },
      {
        name: "Nested",
        render: () => html`
          <div class="flex items-center gap-2">
            <shad-button-group>
              <shad-button variant="outline" size="icon" aria-label="Bold"><span class="font-bold">B</span></shad-button>
              <shad-button variant="outline" size="icon" aria-label="Italic"><span class="italic">I</span></shad-button>
            </shad-button-group>
            <shad-button-group>
              <shad-button variant="outline" size="icon" aria-label="Align left">⬅</shad-button>
              <shad-button variant="outline" size="icon" aria-label="Align center">⬌</shad-button>
            </shad-button-group>
          </div>
        `
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-button-group>
              <shad-button variant="outline">السابق</shad-button>
              <shad-button variant="outline">التالي</shad-button>
              <shad-button variant="outline">إنهاء</shad-button>
            </shad-button-group>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "On <shad-button-group>: lays children in a row or a column." }
      ],
      slots: [{ name: "(default)", description: "Buttons, <shad-button-group-separator>, and <shad-button-group-text> segments." }],
      extend: [
        `// Children connect automatically — each shad-button flattens its joined`,
        `// edges via :host-context(shad-button-group). Compose with:`,
        `<shad-button-group>`,
        `  <shad-button-group-text>https://</shad-button-group-text>`,
        `  <shad-button variant="outline">example.com</shad-button>`,
        `  <shad-button-group-separator></shad-button-group-separator>`,
        `  <shad-button variant="outline">Go</shad-button>`,
        `</shad-button-group>`
      ].join("\n")
    }
  },
  badge: {
    title: "Badge",
    description: "Displays a badge or a component that looks like a badge.",
    examples: [
      {
        name: "Variants",
        render: () => html`
          <div class="flex flex-wrap items-center gap-2">
            <shad-badge>Default</shad-badge>
            <shad-badge variant="secondary">Secondary</shad-badge>
            <shad-badge variant="destructive">Destructive</shad-badge>
            <shad-badge variant="outline">Outline</shad-badge>
          </div>
        `
      },
      {
        name: "With Icon",
        render: () => html`
          <div class="flex flex-wrap items-center gap-2">
            <shad-badge>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              Verified
            </shad-badge>
            <shad-badge variant="destructive">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
              Alert
            </shad-badge>
          </div>
        `
      },
      {
        name: "With Spinner",
        render: () => html`
          <shad-badge variant="secondary">
            <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
            Syncing
          </shad-badge>
        `
      },
      {
        name: "Link",
        render: () => html`<shad-badge href="#examples">Go to examples</shad-badge>`
      },
      {
        name: "Custom Colors",
        render: () => html`
          <div class="flex flex-wrap items-center gap-2">
            <shad-badge class="border-transparent bg-sky-500 text-white">Info</shad-badge>
            <shad-badge class="border-transparent bg-emerald-500 text-white">Success</shad-badge>
            <shad-badge class="border-transparent bg-amber-500 text-white">Warning</shad-badge>
            <shad-badge variant="outline" class="border-sky-500 text-sky-600">Outlined</shad-badge>
          </div>
        `
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-badge>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              موثق
            </shad-badge>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "variant", type: `"default" | "secondary" | "destructive" | "outline"`, default: `"default"`, description: "Visual style of the pill." },
        { name: "href", type: "string", default: `""`, description: "When set, the badge renders as an <a> link." }
      ],
      slots: [{ name: "(default)", description: "Badge content — text and/or an icon (icons are auto-sized)." }],
      extend: [
        `import { Component } from "@youneed/dom";`,
        `import { ShadBadge } from "@youneed/dom-ui-shad";`,
        ``,
        `// A pill locked to the destructive look.`,
        `@Component.define()`,
        `export class ErrorBadge extends ShadBadge {`,
        `  static tagName = "error-badge";`,
        ``,
        `  override variant = "destructive" as const;`,
        `}`,
        ``,
        `// Custom colors: pass utility classes on the host — they're forwarded:`,
        `// <shad-badge class="bg-sky-500 text-white border-transparent">Info</shad-badge>`
      ].join("\n")
    }
  },
  breadcrumb: {
    title: "Breadcrumb",
    description: "Displays the path to the current resource using a hierarchy of links.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-breadcrumb
          .items=${[
          { label: "Home", href: "#" },
          { label: "Components", href: "#" },
          { label: "Breadcrumb" }
        ]}
        ></shad-breadcrumb>`,
        code: [
          `breadcrumb.items = [`,
          `  { label: "Home", href: "/" },`,
          `  { label: "Components", href: "/components" },`,
          `  { label: "Breadcrumb" },          // current page`,
          `];`
        ].join("\n")
      },
      {
        name: "Custom Separator",
        render: () => html`<shad-breadcrumb
          separator="/"
          .items=${[
          { label: "Home", href: "#" },
          { label: "Components", href: "#" },
          { label: "Breadcrumb" }
        ]}
        ></shad-breadcrumb>`,
        code: [
          `<shad-breadcrumb separator="/"></shad-breadcrumb>`,
          ``,
          `breadcrumb.items = [`,
          `  { label: "Home", href: "/" },`,
          `  { label: "Components", href: "/components" },`,
          `  { label: "Breadcrumb" },`,
          `];`
        ].join("\n")
      },
      {
        name: "Collapsed",
        render: () => html`<shad-breadcrumb
          .items=${[
          { label: "Home", href: "#" },
          { ellipsis: true },
          { label: "Components", href: "#" },
          { label: "Breadcrumb" }
        ]}
        ></shad-breadcrumb>`,
        code: [
          `breadcrumb.items = [`,
          `  { label: "Home", href: "/" },`,
          `  { ellipsis: true },               // collapsed middle`,
          `  { label: "Components", href: "/components" },`,
          `  { label: "Breadcrumb" },`,
          `];`
        ].join("\n")
      },
      {
        name: "Link Component",
        render: () => html`<shad-breadcrumb
          .items=${[
          { label: "Docs", href: "#" },
          { label: "Building Your Application", href: "#" },
          { label: "Data Fetching", href: "#" },
          { label: "Caching" }
        ]}
        ></shad-breadcrumb>`,
        code: [
          `// Each item with an href renders as an <a>.`,
          `breadcrumb.items = [`,
          `  { label: "Docs", href: "/docs" },`,
          `  { label: "Building Your Application", href: "/docs/app" },`,
          `  { label: "Data Fetching", href: "/docs/app/data" },`,
          `  { label: "Caching" },`,
          `];`
        ].join("\n")
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-breadcrumb
          .items=${[
          { label: "الرئيسية", href: "#" },
          { label: "المكونات", href: "#" },
          { label: "مسار التنقل" }
        ]}
        ></shad-breadcrumb></div>`,
        code: [
          `<div dir="rtl">`,
          `  <shad-breadcrumb></shad-breadcrumb>   <!-- chevron flips automatically -->`,
          `</div>`
        ].join("\n")
      }
    ],
    api: {
      props: [
        { name: "items", type: "Crumb[]", default: "[]", description: "Trail items. Crumb = { label?, href?, ellipsis? }: href → link, no href → current page, ellipsis → collapsed “…”." },
        { name: "separator", type: "string", default: `""`, description: 'Custom separator text (e.g. "/"); a chevron is used when empty.' }
      ],
      extend: [
        `import { ShadBreadcrumb } from "@youneed/dom-ui-shad";`,
        ``,
        `// Data-driven: a single component, no per-item composition.`,
        `const crumbs = document.querySelector("shad-breadcrumb");`,
        `crumbs.items = [`,
        `  { label: "Home", href: "/" },`,
        `  { ellipsis: true },`,
        `  { label: "Components", href: "/components" },`,
        `  { label: "Breadcrumb" },        // current page (no href)`,
        `];`
      ].join("\n")
    }
  },
  card: {
    title: "Card",
    description: "Displays a card with header, content, and footer.",
    examples: [
      {
        name: "Default",
        render: () => html`
          <shad-card class="w-full max-w-sm">
            <span slot="title">Create project</span>
            <span slot="description">Deploy your new project in one click.</span>
            <shad-button slot="action" variant="ghost" size="sm">Settings</shad-button>
            <p class="text-sm text-muted-foreground">Fill in the details below, then hit deploy to ship it.</p>
            <shad-button slot="footer" variant="outline">Cancel</shad-button>
            <shad-button slot="footer" class="ml-2">Deploy</shad-button>
          </shad-card>
        `
      },
      {
        name: "Image",
        render: () => html`
          <shad-card class="w-full max-w-sm">
            <div slot="image" class="h-40 bg-gradient-to-br from-sky-400 to-indigo-500"></div>
            <span slot="title">Mountain Retreat</span>
            <span slot="description">A quiet cabin in the woods.</span>
            <p class="text-sm text-muted-foreground">Three nights, breakfast included. Free cancellation.</p>
          </shad-card>
        `
      },
      {
        name: "Spacing",
        render: () => html`
          <div class="flex flex-wrap items-start gap-4">
            <shad-card class="w-56" style="--card-gap: 0.75rem">
              <span slot="title">Compact</span>
              <span slot="description">--card-gap: 0.75rem</span>
              <p class="text-sm text-muted-foreground">Tighter padding and gaps.</p>
            </shad-card>
            <shad-card class="w-56" style="--card-gap: 2rem">
              <span slot="title">Roomy</span>
              <span slot="description">--card-gap: 2rem</span>
              <p class="text-sm text-muted-foreground">Looser padding and gaps.</p>
            </shad-card>
          </div>
        `
      },
      {
        name: "Size",
        render: () => html`
          <div class="flex flex-wrap items-start gap-4">
            <shad-card class="w-48">
              <span slot="title">Small</span>
              <p class="text-sm text-muted-foreground">w-48</p>
            </shad-card>
            <shad-card class="w-72">
              <span slot="title">Large</span>
              <p class="text-sm text-muted-foreground">w-72 — the card fills its container.</p>
            </shad-card>
          </div>
        `
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-card class="w-full max-w-sm">
              <span slot="title">إنشاء مشروع</span>
              <span slot="description">انشر مشروعك بنقرة واحدة.</span>
              <shad-button slot="action" variant="ghost" size="sm">الإعدادات</shad-button>
              <p class="text-sm text-muted-foreground">املأ التفاصيل ثم اضغط نشر.</p>
              <shad-button slot="footer">نشر</shad-button>
            </shad-card>
          </div>
        `
      }
    ],
    api: {
      slots: [
        { name: "image", description: "Full-bleed media at the top (an <img> or a banner)." },
        { name: "title", description: "Card heading." },
        { name: "description", description: "Supporting subtitle under the title." },
        { name: "action", description: "Header end action (e.g. a button); placed top-end." },
        { name: "(default)", description: "Card body content." },
        { name: "footer", description: "Footer actions." }
      ],
      extend: [
        `// Spacing is driven by a CSS variable — override it per card:`,
        `<shad-card style="--card-gap: 2rem">…</shad-card>`,
        ``,
        `// Slots compose the parts; empty ones add no spacing:`,
        `<shad-card>`,
        `  <img slot="image" src="…" />`,
        `  <span slot="title">Title</span>`,
        `  <span slot="description">Subtitle</span>`,
        `  <button slot="action">…</button>`,
        `  Body content`,
        `  <button slot="footer">Save</button>`,
        `</shad-card>`
      ].join("\n")
    }
  },
  carousel: {
    title: "Carousel",
    description: "A slideshow for cycling through a set of slides.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-xs"><shad-carousel>${carouselSlides(5)}</shad-carousel></div>`
      },
      {
        name: "Sizes",
        render: () => html`<div class="w-full max-w-md"><shad-carousel style="--slide-basis: 50%">${carouselSlides(6)}</shad-carousel></div>`
      },
      {
        name: "Spacing",
        render: () => html`<div class="w-full max-w-md"><shad-carousel style="--slide-basis: 50%; --slide-gap: 2rem">${carouselSlides(6)}</shad-carousel></div>`
      },
      {
        name: "Orientation",
        render: () => html`<div class="w-full max-w-xs"><shad-carousel orientation="vertical">${carouselSlides(5, "h-40")}</shad-carousel></div>`
      },
      {
        name: "Autoplay (Plugin)",
        render: () => html`<div class="w-full max-w-xs">
          <shad-carousel .plugins=${[autoplay({ delay: 2e3 })]}>${carouselSlides(5)}</shad-carousel>
        </div>`,
        code: [
          `import { autoplay } from "@youneed/dom-ui-shad";`,
          ``,
          `const carousel = document.querySelector("shad-carousel");`,
          `carousel.plugins = [autoplay({ delay: 2000 })];`,
          ``,
          `// Advances every 2s, loops at the end, pauses on hover/focus.`
        ].join("\n")
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-xs"><shad-carousel>${carouselSlides(5)}</shad-carousel></div>`
      }
    ],
    api: {
      props: [
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Scroll axis of the carousel." },
        { name: "plugins", type: "CarouselPlugin[]", default: "[]", description: "Plugins run on mount — e.g. autoplay({ delay }) — via the carousel's public API." }
      ],
      events: [
        { name: "scroll", detail: "-1 | 1", description: "Fires when prev/next is pressed; detail is the direction." }
      ],
      slots: [{ name: "(default)", description: "The slides — each direct child is one slide." }],
      extend: [
        `// Sizing & spacing are CSS variables on the host:`,
        `<shad-carousel style="--slide-basis: 50%">…</shad-carousel>   // ~2 slides visible`,
        `<shad-carousel style="--slide-gap: 1.5rem">…</shad-carousel>  // gap between slides`,
        `<shad-carousel orientation="vertical" style="--carousel-height: 18rem">…</shad-carousel>`,
        ``,
        `carousel.addEventListener("scroll", (e) => console.log("dir", e.detail));`
      ].join("\n")
    }
  },
  chart: {
    title: "Chart",
    description: "Dependency-free SVG charts (bar / line / area) configured like shadcn's ChartConfig.",
    examples: [
      { name: "Bar Chart", render: () => chartDemo("bar"), code: CHART_CODE("bar") },
      { name: "Line Chart", render: () => chartDemo("line"), code: CHART_CODE("line") },
      { name: "Area Chart", render: () => chartDemo("area"), code: CHART_CODE("area") },
      {
        name: "Interactive",
        render: () => html`<div class="w-full max-w-md"><shad-chart type="bar" interactive totals xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`,
        code: [
          `<shad-chart type="bar" interactive totals></shad-chart>`,
          ``,
          `// interactive → click a legend item to toggle that series.`,
          `// totals → show per-series sums in the legend.`
        ].join("\n")
      },
      {
        name: "No Legend",
        render: () => html`<div class="w-full max-w-md"><shad-chart type="line" legend="false" xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`,
        code: [
          `<shad-chart type="line" legend="false"></shad-chart>`,
          ``,
          `// legend="false" hides the legend entirely.`
        ].join("\n")
      },
      { name: "RTL", render: () => html`<div dir="rtl" class="w-full max-w-md"><shad-chart type="bar" xkey="month" .data=${CHART_DATA} .config=${CHART_CONFIG}></shad-chart></div>`, code: CHART_CODE("bar") }
    ],
    api: {
      props: [
        { name: "type", type: `"bar" | "line" | "area"`, default: `"bar"`, description: "Chart kind." },
        { name: "data", type: "Record<string, string|number>[]", default: "[]", description: "Rows of data points." },
        { name: "xkey", type: "string", default: `""`, description: "Data key used for the X axis category." },
        { name: "config", type: "ChartConfig", default: "{}", description: "Maps each series key → { label, color }. Colors can use --chart-1…5." },
        { name: "legend", type: "boolean", default: "true", description: 'Render the legend (set legend="false" to hide).' },
        { name: "interactive", type: "boolean", default: "false", description: "Make the legend clickable to toggle series on/off." },
        { name: "totals", type: "boolean", default: "false", description: "Show per-series sums in the legend." }
      ],
      extend: [
        `import { ShadChart } from "@youneed/dom-ui-shad";`,
        ``,
        `const chart = document.querySelector("shad-chart");`,
        `chart.type = "bar";`,
        `chart.xkey = "month";`,
        `chart.data = [{ month: "Jan", desktop: 186, mobile: 80 }, …];`,
        `chart.config = {`,
        `  desktop: { label: "Desktop", color: "hsl(var(--chart-1))" },`,
        `  mobile:  { label: "Mobile",  color: "hsl(var(--chart-2))" },`,
        `};`
      ].join("\n")
    }
  },
  input: {
    title: "Input",
    description: "Displays a form input field.",
    examples: [
      { name: "Basic", render: () => html`<div class="max-w-sm"><shad-input placeholder="Email"></shad-input></div>` },
      {
        name: "With Label",
        render: () => html`
          <div class="flex max-w-sm flex-col gap-2">
            <shad-label for="api-key">API Key</shad-label>
            <shad-input id="api-key" type="password" placeholder="sk-..."></shad-input>
          </div>
        `
      },
      { name: "Disabled", render: () => html`<div class="max-w-sm"><shad-input placeholder="Email" disabled></shad-input></div>` },
      {
        name: "Invalid",
        render: () => html`
          <div class="flex max-w-sm flex-col gap-2">
            <shad-input placeholder="Email" value="not-an-email" invalid></shad-input>
            <p class="text-sm text-destructive">Enter a valid email address.</p>
          </div>
        `
      },
      { name: "File", render: () => html`<div class="max-w-sm"><shad-input type="file"></shad-input></div>` },
      {
        name: "With Button",
        render: () => html`
          <div class="flex w-full max-w-sm items-center gap-2">
            <shad-input placeholder="Email"></shad-input>
            <shad-button variant="outline">Subscribe</shad-button>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "type", type: "string", default: `"text"`, description: `Native input type ("text", "password", "file", "search"…).` },
        { name: "placeholder", type: "string", default: `""`, description: "Placeholder text shown when empty." },
        { name: "value", type: "string", default: `""`, description: "Current value; mirrored to/from the attribute." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables the field and dims it." },
        { name: "invalid", type: "boolean", default: "false", description: "Marks the field invalid (destructive border + aria-invalid)." }
      ],
      events: [
        { name: "input", detail: "string", description: "Fires on every keystroke; detail is the current value." }
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadInput } from "@youneed/dom-ui-shad";`,
        ``,
        `// Reuse ShadInput, force type=search and prepend an icon.`,
        `@Component.define()`,
        `export class SearchInput extends ShadInput {`,
        `  static tagName = "search-input";`,
        ``,
        `  override type = "search";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      <div class="flex items-center gap-2">`,
        `        <span aria-hidden="true">🔍</span>`,
        `        \${super.render()}`,
        `      </div>\`;`,
        `  }`,
        `}`,
        ``,
        `// <search-input placeholder="Search…"></search-input>`
      ].join("\n")
    }
  },
  "input-group": {
    title: "Input Group",
    description: "Wrap an input or textarea with addons — icons, text, buttons, kbd, and more.",
    examples: [
      {
        name: "Icon",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Search…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end">12 results</shad-input-group-addon>
          </shad-input-group>
        </div>`,
        code: [
          `<shad-input-group>`,
          `  <shad-input-group-input placeholder="Search…"></shad-input-group-input>`,
          `  <shad-input-group-addon><svg>…</svg></shad-input-group-addon>          <!-- inline-start -->`,
          `  <shad-input-group-addon align="inline-end">12 results</shad-input-group-addon>`,
          `</shad-input-group>`
        ].join("\n")
      },
      {
        name: "Text",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-addon>https://</shad-input-group-addon>
            <shad-input-group-input placeholder="example.com"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">.com</shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "Button",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="API key…" type="password"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">
              <shad-input-group-button variant="default">Save</shad-input-group-button>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "Kbd",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Search…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end">
              <kbd class="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">⌘K</kbd>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "Dropdown",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="0.00"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">
              <shad-dropdown-menu
                align="end"
                .items=${[{ label: "USD", value: "usd" }, { label: "EUR", value: "eur" }, { label: "GBP", value: "gbp" }]}
              >
                <shad-input-group-button variant="ghost">USD ${igChevron}</shad-input-group-button>
              </shad-dropdown-menu>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "Spinner",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Checking…" value="my-username"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">${igSpinner}</shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "Textarea",
        render: () => html`<div class="max-w-md">
          <shad-input-group>
            <shad-input-group-textarea placeholder="Ask, search or chat…"></shad-input-group-textarea>
            <shad-input-group-addon align="block-end">
              <span class="text-xs">Press Enter to send</span>
              <shad-input-group-button variant="default" class="ml-auto">Send</shad-input-group-button>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`,
        code: [
          `<shad-input-group>`,
          `  <shad-input-group-textarea placeholder="Ask, search or chat…"></shad-input-group-textarea>`,
          `  <shad-input-group-addon align="block-end"> … </shad-input-group-addon>`,
          `</shad-input-group>`
        ].join("\n")
      },
      {
        name: "Custom Input",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-input placeholder="Type a command…"></shad-input-group-input>
            <shad-input-group-addon align="inline-end">
              <shad-input-group-button variant="outline">Clear</shad-input-group-button>
            </shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="بحث…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end">١٢ نتيجة</shad-input-group-addon>
          </shad-input-group>
        </div>`
      }
    ],
    api: {
      props: [
        { name: "InputGroupAddon · align", type: `"inline-start" | "inline-end" | "block-start" | "block-end"`, default: `"inline-start"`, description: "Where the addon sits; block-* flips the group to a column." },
        { name: "InputGroupInput · placeholder / value / type / disabled", type: "string / string / string / boolean", default: "—", description: "Forwarded to the underlying <input>." },
        { name: "InputGroupButton · variant", type: `Button variant`, default: `"ghost"`, description: "A <shad-button> at its compact xs size (any button variant)." }
      ],
      slots: [
        { name: "shad-input-group", description: "The bordered container (focus ring follows the control)." },
        { name: "shad-input-group-input / -textarea", description: "The form control (borderless, transparent)." },
        { name: "shad-input-group-addon", description: "An edge addon: icon, text, button, kbd, spinner…" },
        { name: "shad-input-group-button", description: "A small button intended for addons." }
      ],
      extend: [
        `import { ShadInputGroup } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose freely; align addons on any edge:`,
        `<shad-input-group>`,
        `  <shad-input-group-input placeholder="Search…" />`,
        `  <shad-input-group-addon><svg>…</svg></shad-input-group-addon>`,
        `  <shad-input-group-addon align="inline-end">`,
        `    <shad-input-group-button>Go</shad-input-group-button>`,
        `  </shad-input-group-addon>`,
        `</shad-input-group>`
      ].join("\n")
    }
  },
  "input-otp": {
    title: "Input OTP",
    description: "Accessible one-time password component with copy-paste functionality.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-input-otp maxlength="6"></shad-input-otp>`,
        code: `<shad-input-otp maxlength="6"></shad-input-otp>`
      },
      {
        name: "Separator",
        render: () => html`<shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp>`,
        code: `<shad-input-otp maxlength="6"></shad-input-otp>

otp.groups = [3, 3];   // a separator between the groups`
      },
      { name: "Disabled", render: () => html`<shad-input-otp maxlength="6" disabled value="123"></shad-input-otp>` },
      {
        name: "Controlled",
        render: () => html`<div class="flex flex-col items-center gap-3">
          <shad-input-otp
            maxlength="6"
            @input=${(e) => {
          const out = e.currentTarget.parentElement.querySelector("[data-otp-out]");
          out.textContent = e.detail || "—";
        }}
          ></shad-input-otp>
          <div class="text-sm text-muted-foreground">Entered: <span data-otp-out class="font-mono text-foreground">—</span></div>
        </div>`,
        code: `otp.addEventListener("input", (e) => console.log(e.detail));    // current value
otp.addEventListener("complete", (e) => verify(e.detail));      // when full`
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col items-center gap-2">
          <shad-input-otp maxlength="6" invalid value="123456"></shad-input-otp>
          <p class="text-sm text-destructive">Invalid code. Please try again.</p>
        </div>`
      },
      { name: "Four Digits", render: () => html`<shad-input-otp maxlength="4"></shad-input-otp>` },
      {
        name: "Alphanumeric",
        render: () => html`<shad-input-otp maxlength="6" pattern="alphanumeric"></shad-input-otp>`,
        code: `<shad-input-otp maxlength="6" pattern="alphanumeric"></shad-input-otp>`
      },
      {
        name: "Form",
        render: () => html`<div class="flex flex-col items-center gap-3">
          <shad-label>Verification code</shad-label>
          <shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp>
          <shad-button size="sm">Verify</shad-button>
        </div>`
      },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp></div>` }
    ],
    api: {
      props: [
        { name: "maxlength", type: "number", default: "6", description: "Number of slots / max characters." },
        { name: "value", type: "string", default: `""`, description: "Current value; mirrored to the attribute." },
        { name: "pattern", type: `"digits" | "alphanumeric" | regex`, default: `"digits"`, description: "Allowed characters (regex source also accepted)." },
        { name: "groups", type: "number[]", default: "[maxlength]", description: "Group sizes; a separator is drawn between groups (e.g. [3, 3])." },
        { name: "separator", type: "boolean", default: "false", description: "Shortcut: split into two equal halves with a separator." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables input and dims the field." },
        { name: "invalid", type: "boolean", default: "false", description: "Destructive border/ring + aria-invalid." }
      ],
      events: [
        { name: "input", detail: "string", description: "Fires on every change; detail is the current value." },
        { name: "complete", detail: "string", description: "Fires when all slots are filled." }
      ],
      extend: [
        `import { ShadInputOtp } from "@youneed/dom-ui-shad";`,
        ``,
        `const otp = document.querySelector("shad-input-otp");`,
        `otp.groups = [3, 3];                                   // separator`,
        `otp.addEventListener("complete", (e) => verify(e.detail));`
      ].join("\n")
    }
  },
  label: {
    title: "Label",
    description: "Renders an accessible label, optionally associated with a control.",
    examples: [
      { name: "Basic", render: () => html`<shad-label>Accept terms and conditions</shad-label>` },
      {
        name: "With Control",
        // `for` links across shadow DOM: clicking the label focuses + toggles the
        // control and donates the label text as its accessible name.
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox id="lbl-newsletter"></shad-checkbox>
            <shad-label for="lbl-newsletter">Subscribe to the newsletter</shad-label>
          </div>
        `
      },
      {
        name: "With Input",
        render: () => html`
          <div class="flex max-w-sm flex-col gap-2">
            <shad-label for="lbl-email">Email</shad-label>
            <shad-input id="lbl-email" type="email" placeholder="me@example.com"></shad-input>
          </div>
        `
      }
    ],
    api: {
      props: [
        {
          name: "for",
          type: "string",
          default: `""`,
          description: "Id of the control to associate (resolved within the label's root, so it works inside shadow DOM)."
        }
      ],
      slots: [{ name: "(default)", description: "The label text." }],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadLabel } from "@youneed/dom-ui-shad";`,
        ``,
        `// A required-field label that appends a red asterisk.`,
        `@Component.define()`,
        `export class RequiredLabel extends ShadLabel {`,
        `  static tagName = "required-label";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      \${super.render()}`,
        `      <span class="ml-0.5 text-destructive">*</span>\`;`,
        `  }`,
        `}`
      ].join("\n")
    }
  },
  switch: {
    title: "Switch",
    description: "A control that allows the user to toggle between checked and not checked.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex items-center gap-2">
          <shad-switch id="airplane"></shad-switch>
          <shad-label for="airplane">Airplane Mode</shad-label>
        </div>`,
        code: [
          `<div class="flex items-center gap-2">`,
          `  <shad-switch id="airplane"></shad-switch>`,
          `  <shad-label for="airplane">Airplane Mode</shad-label>`,
          `</div>`
        ].join("\n")
      },
      {
        name: "Description",
        render: () => html`<div class="flex max-w-sm items-start gap-3">
          <shad-switch id="sw-marketing" checked class="mt-0.5"></shad-switch>
          <div class="grid gap-1">
            <shad-label for="sw-marketing">Marketing emails</shad-label>
            <p class="text-sm text-muted-foreground">Receive emails about new products, features, and more.</p>
          </div>
        </div>`
      },
      {
        name: "Choice Card",
        render: () => html`<shad-label
          for="sw-card"
          class="flex w-full max-w-sm items-center justify-between gap-3 rounded-lg border border-border p-3.5 hover:bg-muted/50 has-[shad-switch[checked]]:border-primary has-[shad-switch[checked]]:bg-muted/40"
        >
          <div class="grid gap-0.5">
            <span class="font-medium leading-none">Two-factor auth</span>
            <span class="text-sm font-normal text-muted-foreground">Add an extra layer of security.</span>
          </div>
          <shad-switch id="sw-card"></shad-switch>
        </shad-label>`,
        code: `<shad-label class="… has-[shad-switch[checked]]:border-primary"><shad-switch .../></shad-label>`
      },
      {
        name: "Disabled",
        render: () => html`<div class="flex flex-col gap-3">
          <div class="flex items-center gap-2"><shad-switch id="sw-d1" disabled></shad-switch><shad-label for="sw-d1">Off (disabled)</shad-label></div>
          <div class="flex items-center gap-2"><shad-switch id="sw-d2" checked disabled></shad-switch><shad-label for="sw-d2">On (disabled)</shad-label></div>
        </div>`
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col gap-2">
          <div class="flex items-center gap-2"><shad-switch id="sw-inv" invalid></shad-switch><shad-label for="sw-inv">Accept terms</shad-label></div>
          <p class="text-sm text-destructive">You must enable this to continue.</p>
        </div>`
      },
      {
        name: "Size",
        render: () => html`<div class="flex items-center gap-6">
          <div class="flex items-center gap-2"><shad-switch id="sw-sm" size="sm" checked></shad-switch><shad-label for="sw-sm" class="text-xs">Small</shad-label></div>
          <div class="flex items-center gap-2"><shad-switch id="sw-df" checked></shad-switch><shad-label for="sw-df">Default</shad-label></div>
        </div>`,
        code: `<shad-switch size="sm"></shad-switch>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-2">
          <shad-switch id="sw-rtl" checked></shad-switch>
          <shad-label for="sw-rtl">وضع الطائرة</shad-label>
        </div>`
      }
    ],
    api: {
      props: [
        { name: "checked", type: "boolean", default: "false", description: "On/off state; mirrored to the attribute." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables the control and dims it." },
        { name: "invalid", type: "boolean", default: "false", description: "Destructive ring (aria-invalid)." },
        { name: "size", type: `"default" | "sm"`, default: `"default"`, description: "Track/thumb size." }
      ],
      events: [{ name: "change", detail: "boolean", description: "Fires on toggle; detail is the new checked state." }],
      extend: [
        `import { ShadSwitch } from "@youneed/dom-ui-shad";`,
        ``,
        `const sw = document.querySelector("shad-switch");`,
        `sw.addEventListener("change", (e) => console.log(e.detail));`,
        `// <shad-label for="id"> toggles + labels it across shadow DOM.`
      ].join("\n")
    }
  },
  checkbox: {
    title: "Checkbox",
    description: "A control that can be checked or unchecked.",
    examples: [
      {
        name: "Basic",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox id="cb-terms"></shad-checkbox>
            <shad-label for="cb-terms">Accept terms and conditions</shad-label>
          </div>
        `
      },
      {
        name: "Checked",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox checked></shad-checkbox>
            <shad-label>Subscribe to the newsletter</shad-label>
          </div>
        `
      },
      {
        name: "With Description",
        render: () => html`
          <div class="flex max-w-sm items-start gap-3">
            <shad-checkbox id="cb-desc" checked class="mt-0.5"></shad-checkbox>
            <div class="flex flex-col gap-0.5">
              <shad-label for="cb-desc">Accept terms and conditions</shad-label>
              <p class="text-sm text-muted-foreground">By clicking this checkbox, you agree to the terms.</p>
            </div>
          </div>
        `
      },
      {
        name: "Disabled",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-checkbox disabled></shad-checkbox>
            <shad-label>Enable notifications</shad-label>
          </div>
        `
      },
      {
        name: "Invalid",
        render: () => html`
          <div class="flex max-w-sm items-start gap-3">
            <shad-checkbox invalid class="mt-0.5"></shad-checkbox>
            <div class="flex flex-col gap-0.5">
              <shad-label class="text-destructive">Accept terms and conditions</shad-label>
              <p class="text-sm text-destructive">You must accept before continuing.</p>
            </div>
          </div>
        `
      },
      {
        name: "Group",
        render: () => html`
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3"><shad-checkbox checked></shad-checkbox><shad-label>Recents</shad-label></div>
            <div class="flex items-center gap-3"><shad-checkbox checked></shad-checkbox><shad-label>Home</shad-label></div>
            <div class="flex items-center gap-3"><shad-checkbox></shad-checkbox><shad-label>Applications</shad-label></div>
            <div class="flex items-center gap-3"><shad-checkbox disabled></shad-checkbox><shad-label>Desktop</shad-label></div>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "checked", type: "boolean", default: "false", description: "Whether the box is checked; mirrored to the attribute." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables interaction and dims the control." },
        { name: "invalid", type: "boolean", default: "false", description: "Marks the control invalid (destructive border + aria-invalid)." }
      ],
      events: [
        { name: "change", detail: "boolean", description: "Fires on toggle; detail is the new checked state." }
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadCheckbox } from "@youneed/dom-ui-shad";`,
        ``,
        `// A checkbox that starts checked and logs every change.`,
        `@Component.define()`,
        `export class TermsCheckbox extends ShadCheckbox {`,
        `  static tagName = "terms-checkbox";`,
        ``,
        `  override checked = true;`,
        ``,
        `  override toggle() {`,
        `    super.toggle();`,
        `    console.log("terms accepted:", this.checked);`,
        `  }`,
        `}`,
        ``,
        `// <terms-checkbox></terms-checkbox>`
      ].join("\n")
    }
  },
  collapsible: {
    title: "Collapsible",
    description: "An interactive component which expands/collapses a panel.",
    examples: [
      {
        name: "Basic",
        render: () => html`
          <shad-collapsible chevron open class="w-full max-w-sm">
            <span slot="trigger" class="text-sm font-medium">@peduarte starred 3 repositories</span>
            <div class="mt-2 flex flex-col gap-2">
              <div class="rounded-md border border-border px-4 py-2 text-sm">@radix-ui/primitives</div>
              <div class="rounded-md border border-border px-4 py-2 text-sm">@radix-ui/colors</div>
              <div class="rounded-md border border-border px-4 py-2 text-sm">@stitches/react</div>
            </div>
          </shad-collapsible>
        `
      },
      {
        name: "Settings Panel",
        render: () => html`
          <shad-collapsible chevron class="w-full max-w-sm rounded-lg border border-border p-4">
            <div slot="trigger">
              <div class="text-sm font-medium">Advanced settings</div>
              <div class="text-xs text-muted-foreground">Tweak behavior and defaults</div>
            </div>
            <div class="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <div class="flex items-center justify-between"><shad-label>Auto-save</shad-label><shad-switch checked></shad-switch></div>
              <div class="flex items-center justify-between"><shad-label>Telemetry</shad-label><shad-switch></shad-switch></div>
            </div>
          </shad-collapsible>
        `
      },
      {
        name: "File Tree",
        render: () => html`
          <div class="w-full max-w-xs text-sm">
            <shad-collapsible chevron open>
              <span slot="trigger" class="font-medium">📁 src</span>
              <div class="ml-4 mt-1 flex flex-col gap-1">
                <shad-collapsible chevron>
                  <span slot="trigger">📁 components</span>
                  <div class="ml-4 mt-1 flex flex-col gap-1 text-muted-foreground">
                    <div>📄 button.ts</div>
                    <div>📄 card.ts</div>
                  </div>
                </shad-collapsible>
                <div class="text-muted-foreground">📄 index.ts</div>
              </div>
            </shad-collapsible>
          </div>
        `
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-collapsible chevron open class="w-full max-w-sm">
              <span slot="trigger" class="text-sm font-medium">المستودعات المميزة</span>
              <div class="mt-2 flex flex-col gap-2">
                <div class="rounded-md border border-border px-4 py-2 text-sm">المكوّن الأول</div>
                <div class="rounded-md border border-border px-4 py-2 text-sm">المكوّن الثاني</div>
              </div>
            </shad-collapsible>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the panel is expanded; mirrored to the attribute (controllable)." },
        { name: "chevron", type: "boolean", default: "false", description: "Render a built-in caret that rotates with state." }
      ],
      events: [
        { name: "change", detail: "boolean", description: "Fires on toggle; detail is the new open state." }
      ],
      slots: [
        { name: "trigger", description: "Clickable header content." },
        { name: "(default)", description: "Collapsible body." }
      ],
      extend: [
        `import { ShadCollapsible } from "@youneed/dom-ui-shad";`,
        ``,
        `const c = document.querySelector("shad-collapsible");`,
        `c.addEventListener("change", (e) => console.log("open?", e.detail));`,
        `c.open = true; // controlled`
      ].join("\n")
    }
  },
  combobox: {
    title: "Combobox",
    description: "Autocomplete input and command palette with a list of suggestions.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox value="next" placeholder="Select framework…" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox value="next" placeholder="Select framework…"></shad-combobox>`)
      },
      {
        name: "Multiple",
        render: () => html`<div class="w-full max-w-[280px]"><shad-combobox multiple clearable placeholder="Select frameworks…" .values=${["next", "svelte"]} .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox multiple clearable placeholder="Select frameworks…"></shad-combobox>`)
      },
      {
        name: "Clear Button",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox clearable value="astro" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox clearable value="astro"></shad-combobox>`)
      },
      {
        name: "Groups",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox placeholder="Select…" .options=${GROUPED_OPTIONS}></shad-combobox></div>`,
        code: [
          `<shad-combobox></shad-combobox>`,
          ``,
          `combobox.options = [`,
          `  { group: "Frontend", value: "next", label: "Next.js" },`,
          `  { group: "Frontend", value: "svelte", label: "SvelteKit" },`,
          `  { group: "Backend", value: "nest", label: "NestJS" },`,
          `];`
        ].join("\n")
      },
      {
        name: "Invalid",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox invalid placeholder="Required…" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox invalid placeholder="Required…"></shad-combobox>`)
      },
      {
        name: "Disabled",
        render: () => html`<div class="w-full max-w-[260px]"><shad-combobox disabled value="next" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<shad-combobox disabled value="next"></shad-combobox>`)
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-[260px]"><shad-combobox placeholder="اختر إطار العمل…" .options=${FW_OPTIONS}></shad-combobox></div>`,
        code: COMBO_CODE(`<div dir="rtl"><shad-combobox placeholder="اختر…"></shad-combobox></div>`)
      }
    ],
    api: {
      props: [
        { name: "options", type: "ComboOption[]", default: "[]", description: "Items: { value, label, group? }." },
        { name: "value", type: "string", default: `""`, description: "Selected value (single mode); mirrored to the attribute." },
        { name: "values", type: "string[]", default: "[]", description: "Selected values (multiple mode)." },
        { name: "multiple", type: "boolean", default: "false", description: "Allow selecting several items (rendered as chips)." },
        { name: "clearable", type: "boolean", default: "false", description: "Show a clear (✕) control when something is selected." },
        { name: "placeholder", type: "string", default: `"Select…"`, description: "Trigger placeholder." },
        { name: "disabled", type: "boolean", default: "false", description: "Disable the control." },
        { name: "invalid", type: "boolean", default: "false", description: "Destructive border for invalid state." }
      ],
      events: [
        { name: "change", detail: "string | string[]", description: "Fires on select/clear; string (single) or string[] (multiple)." }
      ],
      extend: [
        `import { ShadCombobox } from "@youneed/dom-ui-shad";`,
        ``,
        `const cb = document.querySelector("shad-combobox");`,
        `cb.options = [{ value: "next", label: "Next.js" }, …];`,
        `cb.addEventListener("change", (e) => console.log(e.detail));`,
        ``,
        `// Keyboard: ↑/↓ to move, Enter to select, Esc to close; type to filter.`
      ].join("\n")
    }
  },
  command: {
    title: "Command",
    description: "Fast, composable, unstyled command menu.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_BASIC}></shad-command></div>`,
        code: CMD_CODE
      },
      {
        name: "Shortcuts",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_SHORTCUTS}></shad-command></div>`,
        code: CMD_CODE
      },
      {
        name: "Groups",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_GROUPS}></shad-command></div>`,
        code: [
          `<shad-command></shad-command>`,
          ``,
          `command.items = [`,
          `  { group: "Suggestions", value: "cal", label: "Calendar", icon: calendarIcon },`,
          `  { group: "Settings", value: "profile", label: "Profile", icon: userIcon, shortcut: "⌘P" },`,
          `];`
        ].join("\n")
      },
      {
        name: "Scrollable",
        render: () => html`<div class="w-full max-w-[420px]"><shad-command .items=${CMD_MANY}></shad-command></div>`,
        code: CMD_CODE
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-[420px]"><shad-command placeholder="اكتب أمرًا…" .items=${CMD_GROUPS}></shad-command></div>`,
        code: CMD_CODE
      }
    ],
    api: {
      props: [
        { name: "items", type: "CommandItem[]", default: "[]", description: "Commands: { value, label, group?, icon?, shortcut? }." },
        { name: "placeholder", type: "string", default: `"Type a command or search…"`, description: "Search input placeholder." }
      ],
      events: [
        { name: "select", detail: "string", description: "Fires when a command is chosen; detail is its value." }
      ],
      extend: [
        `import { ShadCommand } from "@youneed/dom-ui-shad";`,
        ``,
        `const cmd = document.querySelector("shad-command");`,
        `cmd.items = [{ value: "new", label: "New File", icon: fileIcon, shortcut: "⌘N" }, …];`,
        `cmd.addEventListener("select", (e) => run(e.detail));`
      ].join("\n")
    }
  },
  empty: {
    title: "Empty",
    description: "Use the Empty component to display an empty state.",
    examples: [
      {
        name: "Basic",
        render: () => emptyDemo(),
        code: [
          `<shad-empty>`,
          `  <shad-empty-header>`,
          `    <shad-empty-media variant="icon"><svg>…</svg></shad-empty-media>`,
          `    <shad-empty-title>No Projects Yet</shad-empty-title>`,
          `    <shad-empty-description>Get started by creating your first project.</shad-empty-description>`,
          `  </shad-empty-header>`,
          `  <shad-empty-content>`,
          `    <shad-button>Create Project</shad-button>`,
          `    <shad-button variant="outline">Import Project</shad-button>`,
          `  </shad-empty-content>`,
          `</shad-empty>`
        ].join("\n")
      },
      { name: "Outline", render: () => emptyDemo({ variant: "outline" }), code: `<shad-empty variant="outline"> … </shad-empty>` },
      { name: "Background", render: () => emptyDemo({ variant: "background" }), code: `<shad-empty variant="background"> … </shad-empty>` },
      {
        name: "Avatar",
        render: () => emptyDemo({ variant: "outline", media: "avatar" }),
        code: `<shad-empty-media variant="default"><shad-avatar src="…"></shad-avatar></shad-empty-media>`
      },
      {
        name: "Avatar Group",
        render: () => emptyDemo({ variant: "outline", media: "group" }),
        code: `<shad-empty-media variant="default"><shad-avatar-group>…</shad-avatar-group></shad-empty-media>`
      },
      {
        name: "InputGroup",
        render: () => emptyDemo({ variant: "outline", media: "input" }),
        code: [
          `<shad-empty-content>`,
          `  <shad-input placeholder="Search projects…"></shad-input>`,
          `  <shad-button>Search</shad-button>`,
          `</shad-empty-content>`
        ].join("\n")
      },
      { name: "RTL", render: () => emptyDemo({ variant: "outline", rtl: true }) }
    ],
    api: {
      props: [
        { name: "Empty · variant", type: `"default" | "outline" | "background"`, default: `"default"`, description: "The container surface: plain, dashed border, or a subtle gradient." },
        { name: "EmptyMedia · variant", type: `"icon" | "default"`, default: `"icon"`, description: "icon → a muted rounded box; default → bare (for an avatar / group)." }
      ],
      slots: [
        { name: "shad-empty", description: "The container; centers its header + content." },
        { name: "shad-empty-header", description: "Wraps media + title + description." },
        { name: "shad-empty-media", description: "An icon (in a box) or an avatar." },
        { name: "shad-empty-title", description: "The empty-state heading." },
        { name: "shad-empty-description", description: "Supporting text (links are underlined)." },
        { name: "shad-empty-content", description: "Actions row (buttons, an input group, etc.)." }
      ],
      extend: [
        `import { ShadEmpty } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose the parts, or subclass for a preset empty state:`,
        `class NoResults extends ShadEmpty {`,
        `  variant = "outline";`,
        `}`
      ].join("\n")
    }
  },
  item: {
    title: "Item",
    description: "A flexible container for a title, description, media and actions.",
    examples: [
      {
        name: "Variants",
        render: () => html`<div class="flex w-full max-w-md flex-col gap-4">
          ${map(
          ["default", "outline", "muted"],
          (v) => html`<shad-item variant=${v}>
              <shad-item-content>
                <shad-item-title>${v[0].toUpperCase() + v.slice(1)} Item</shad-item-title>
                <shad-item-description>A ${v} item with a title and description.</shad-item-description>
              </shad-item-content>
              <shad-item-actions><shad-button variant="outline" size="sm">Action</shad-button></shad-item-actions>
            </shad-item>`
        )}
        </div>`,
        code: [
          `<shad-item variant="outline">`,
          `  <shad-item-content>`,
          `    <shad-item-title>Basic Item</shad-item-title>`,
          `    <shad-item-description>A simple item.</shad-item-description>`,
          `  </shad-item-content>`,
          `  <shad-item-actions><shad-button size="sm">Action</shad-button></shad-item-actions>`,
          `</shad-item>`
        ].join("\n")
      },
      {
        name: "Size",
        render: () => html`<div class="flex w-full max-w-md flex-col gap-4">
          ${map(
          ["default", "sm", "xs"],
          (s) => html`<shad-item variant="outline" size=${s}>
              <shad-item-media variant="icon">${itBadge}</shad-item-media>
              <shad-item-content><shad-item-title>Size ${s}</shad-item-title></shad-item-content>
              <shad-item-actions>${itChevron}</shad-item-actions>
            </shad-item>`
        )}
        </div>`
      },
      {
        name: "Icon",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media variant="icon">${itBadge}</shad-item-media>
            <shad-item-content>
              <shad-item-title>Your profile has been verified.</shad-item-title>
              <shad-item-description>Verified 2 minutes ago.</shad-item-description>
            </shad-item-content>
            <shad-item-actions><shad-button variant="outline" size="sm">View</shad-button></shad-item-actions>
          </shad-item>
        </div>`
      },
      {
        name: "Avatar",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media>
              <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            </shad-item-media>
            <shad-item-content>
              <shad-item-title>shadcn</shad-item-title>
              <shad-item-description>Last seen 5 months ago.</shad-item-description>
            </shad-item-content>
            <shad-item-actions><shad-button variant="outline" size="sm">Follow</shad-button></shad-item-actions>
          </shad-item>
        </div>`
      },
      {
        name: "Image",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media variant="image">
              <img src="https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=80&h=80&fit=crop" alt="thumb" />
            </shad-item-media>
            <shad-item-content>
              <shad-item-title>Music for a Sunday Morning</shad-item-title>
              <shad-item-description>A playlist of calm tracks.</shad-item-description>
            </shad-item-content>
            <shad-item-actions>${itChevron}</shad-item-actions>
          </shad-item>
        </div>`
      },
      {
        name: "Group",
        render: () => html`<div class="w-full max-w-md">
          <shad-item-group class="rounded-lg border border-border">
            ${map(
          [["Profile", "Manage your public profile."], ["Billing", "Update your payment details."], ["Notifications", "Choose what you hear about."]],
          ([t, d], i) => html`
                ${when(i > 0, () => html`<shad-item-separator></shad-item-separator>`)}
                <shad-item href="#">
                  <shad-item-content>
                    <shad-item-title>${t}</shad-item-title>
                    <shad-item-description>${d}</shad-item-description>
                  </shad-item-content>
                  <shad-item-actions>${itChevron}</shad-item-actions>
                </shad-item>`
        )}
          </shad-item-group>
        </div>`,
        code: [
          `<shad-item-group>`,
          `  <shad-item href="#"> … </shad-item>`,
          `  <shad-item-separator></shad-item-separator>`,
          `  <shad-item href="#"> … </shad-item>`,
          `</shad-item-group>`
        ].join("\n")
      },
      {
        name: "Header",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-header>
              <shad-item-title>Storage</shad-item-title>
              <shad-badge>Pro</shad-badge>
            </shad-item-header>
            <shad-item-content>
              <shad-item-description>You are using 8.2 GB of your 20 GB plan.</shad-item-description>
            </shad-item-content>
          </shad-item>
        </div>`
      },
      {
        name: "Link",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline" size="sm" href="#">
            <shad-item-media variant="icon">${itBadge}</shad-item-media>
            <shad-item-content><shad-item-title>Your profile has been verified.</shad-item-title></shad-item-content>
            <shad-item-actions>${itChevron}</shad-item-actions>
          </shad-item>
        </div>`,
        code: `<shad-item href="/profile"> … </shad-item>  <!-- renders an <a>, hover bg -->`
      },
      {
        name: "Dropdown",
        render: () => html`<div class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media><shad-avatar alt="Jane">JD</shad-avatar></shad-item-media>
            <shad-item-content>
              <shad-item-title>Jane Doe</shad-item-title>
              <shad-item-description>jane@example.com</shad-item-description>
            </shad-item-content>
            <shad-item-actions>
              <shad-dropdown-menu align="end" .items=${[{ label: "Edit" }, { label: "Share" }, { separator: true }, { label: "Delete", destructive: true }]}>
                <shad-button variant="ghost" size="icon-xs">${itDots}</shad-button>
              </shad-dropdown-menu>
            </shad-item-actions>
          </shad-item>
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-md">
          <shad-item variant="outline">
            <shad-item-media variant="icon">${itBadge}</shad-item-media>
            <shad-item-content>
              <shad-item-title>تم التحقق من ملفك الشخصي.</shad-item-title>
              <shad-item-description>قبل دقيقتين.</shad-item-description>
            </shad-item-content>
            <shad-item-actions><shad-button variant="outline" size="sm">عرض</shad-button></shad-item-actions>
          </shad-item>
        </div>`
      }
    ],
    api: {
      props: [
        { name: "Item · variant", type: `"default" | "outline" | "muted"`, default: `"default"`, description: "The container surface." },
        { name: "Item · size", type: `"default" | "sm" | "xs"`, default: `"default"`, description: "Padding density." },
        { name: "Item · href", type: "string", default: `""`, description: "Renders the item as an <a> (a clickable row with hover)." },
        { name: "ItemMedia · variant", type: `"default" | "icon" | "image"`, default: `"default"`, description: "Bare, a muted icon box, or an image thumbnail." }
      ],
      slots: [
        { name: "shad-item", description: "The row container (div or <a>)." },
        { name: "shad-item-group / -separator", description: "Stack items into a list with dividers." },
        { name: "shad-item-media", description: "Leading icon / avatar / image." },
        { name: "shad-item-content", description: "Wraps title + description (grows to fill)." },
        { name: "shad-item-title / -description", description: "The primary + secondary text." },
        { name: "shad-item-actions", description: "Trailing buttons / dropdown (kept to the right)." },
        { name: "shad-item-header / -footer", description: "Full-width rows above / below the main line." }
      ],
      extend: [
        `import { ShadItem } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose the parts; or subclass for a preset row:`,
        `class SettingRow extends ShadItem {`,
        `  variant = "outline";`,
        `  href = "#";`,
        `}`
      ].join("\n")
    }
  },
  kbd: {
    title: "Kbd",
    description: "Used to display textual user input from keyboard.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex flex-col items-center gap-4">
          <shad-kbd-group>
            <shad-kbd>⌘</shad-kbd><shad-kbd>⇧</shad-kbd><shad-kbd>⌥</shad-kbd><shad-kbd>⌃</shad-kbd>
          </shad-kbd-group>
          <shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>
        </div>`,
        code: [
          `<shad-kbd-group>`,
          `  <shad-kbd>⌘</shad-kbd><shad-kbd>⇧</shad-kbd><shad-kbd>⌥</shad-kbd>`,
          `</shad-kbd-group>`,
          ``,
          `<shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>`
        ].join("\n")
      },
      {
        name: "Group",
        render: () => html`<div class="flex items-center gap-2 text-sm text-muted-foreground">
          Press <shad-kbd-group><shad-kbd>⌘</shad-kbd><shad-kbd>J</shad-kbd></shad-kbd-group> to open.
        </div>`
      },
      {
        name: "Button",
        render: () => html`<shad-button variant="outline" size="sm">
          Accept <shad-kbd>⏎</shad-kbd>
        </shad-button>`,
        code: `<shad-button variant="outline" size="sm">Accept <shad-kbd>⏎</shad-kbd></shad-button>`
      },
      {
        name: "Tooltip",
        render: () => html`<shad-tooltip>
          <shad-button variant="outline">Print</shad-button>
          <span slot="content" class="flex items-center gap-2">Print document <shad-kbd>⌘P</shad-kbd></span>
        </shad-tooltip>`,
        code: `<shad-tooltip>
  <shad-button variant="outline">Print</shad-button>
  <span slot="content">Print document <shad-kbd>⌘P</shad-kbd></span>
</shad-tooltip>`
      },
      {
        name: "Input Group",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Search…"></shad-input-group-input>
            <shad-input-group-addon>${igSearch}</shad-input-group-addon>
            <shad-input-group-addon align="inline-end"><shad-kbd>⌘K</shad-kbd></shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-2 text-sm text-muted-foreground">
          اضغط <shad-kbd-group><shad-kbd>⌘</shad-kbd><shad-kbd>J</shad-kbd></shad-kbd-group> للفتح.
        </div>`
      }
    ],
    api: {
      slots: [
        { name: "shad-kbd", description: "A single key — text or an icon (sized automatically)." },
        { name: "shad-kbd-group", description: "Groups several keys (and plain separators like “+”)." }
      ],
      extend: [
        `import { ShadKbd } from "@youneed/dom-ui-shad";`,
        ``,
        `// Just a styled <kbd>; drop it anywhere text flows:`,
        `<shad-kbd>⌘K</shad-kbd>`,
        `<shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>`
      ].join("\n")
    }
  },
  "dropdown-menu": {
    title: "Dropdown Menu",
    description: "Displays a menu to the user — triggered by a button.",
    examples: [
      { name: "Basic", render: () => ddTrigger(DD_BASIC), code: DD_CODE },
      { name: "Submenu", render: () => ddTrigger(DD_COMPLEX) },
      { name: "Shortcuts", render: () => ddTrigger(DD_SHORTCUTS) },
      { name: "Icons", render: () => ddTrigger(DD_ICONS) },
      { name: "Checkboxes", render: () => ddTrigger(DD_CHECKBOXES) },
      { name: "Checkboxes Icons", render: () => ddTrigger(DD_CHECKBOXES_ICONS) },
      { name: "Radio Group", render: () => ddTrigger(DD_RADIO) },
      { name: "Radio Icons", render: () => ddTrigger(DD_RADIO_ICONS) },
      { name: "Destructive", render: () => ddTrigger(DD_DESTRUCTIVE) },
      {
        name: "Avatar",
        render: () => ddTrigger(
          DD_BASIC,
          html`<button class="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            </button>`
        ),
        code: [
          `<shad-dropdown-menu>`,
          `  <button><shad-avatar src="…"></shad-avatar></button> <!-- any node is the trigger -->`,
          `</shad-dropdown-menu>`
        ].join("\n")
      },
      { name: "Complex", render: () => ddTrigger(DD_COMPLEX), code: DD_CODE },
      { name: "RTL", render: () => html`<div dir="rtl">${ddTrigger(DD_COMPLEX)}</div>` }
    ],
    api: {
      props: [
        { name: "items", type: "MenuEntry[]", default: "[]", description: "Menu structure (heading, separator, item, checkbox, radio, submenu)." },
        { name: "align", type: `"start" | "end"`, default: `"start"`, description: "Align the menu's start/end edge to the trigger." }
      ],
      events: [
        { name: "select", detail: "string", description: "An action item was chosen; detail is its value/label." },
        { name: "checkedchange", detail: "{ value, checked }", description: "A checkbox item toggled." },
        { name: "radiochange", detail: "{ group, value }", description: "A radio option was picked." }
      ],
      slots: [{ name: "(default)", description: "The trigger (a button, avatar, or any element). Clicking it opens the menu." }],
      extend: [
        `import { ShadDropdownMenu } from "@youneed/dom-ui-shad";`,
        ``,
        `const m = document.querySelector("shad-dropdown-menu");`,
        `m.items = [`,
        `  { heading: true, label: "My Account" },`,
        `  { label: "Profile", shortcut: "⇧⌘P" },`,
        `  { label: "Invite users", items: [{ label: "Email" }] }, // submenu`,
        `  { checkbox: true, label: "Status Bar", value: "status", checked: true },`,
        `  { radio: "pos", value: "top", label: "Top", checked: true },`,
        `  { label: "Log out", destructive: true },`,
        `];`,
        `m.addEventListener("select", (e) => console.log(e.detail));`
      ].join("\n")
    }
  },
  menubar: {
    title: "Menubar",
    description: "A visually persistent menu common in desktop applications.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-menubar .menus=${MB_MENUS}></shad-menubar>`,
        code: [
          `<shad-menubar></shad-menubar>`,
          ``,
          `bar.menus = [`,
          `  { label: "File", items: [`,
          `    { label: "New Tab", shortcut: "⌘T" },`,
          `    { label: "Share", items: [{ label: "Email link" }] }, // submenu`,
          `  ] },`,
          `  { label: "Edit", items: [ … ] },`,
          `];`,
          `bar.addEventListener("select", (e) => console.log(e.detail));`
        ].join("\n")
      },
      { name: "Checkbox", render: () => html`<shad-menubar .menus=${[MB_MENUS[2]]}></shad-menubar>` },
      { name: "Radio", render: () => html`<shad-menubar .menus=${[MB_MENUS[3]]}></shad-menubar>` },
      { name: "Submenu", render: () => html`<shad-menubar .menus=${[MB_MENUS[0]]}></shad-menubar>` },
      { name: "With Icons", render: () => html`<shad-menubar .menus=${MB_ICONS}></shad-menubar>` },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-menubar .menus=${MB_MENUS}></shad-menubar></div>` }
    ],
    api: {
      props: [
        { name: "menus", type: "MenubarMenu[]", default: "[]", description: "Top-level menus, each { label, items: MenuEntry[] }." }
      ],
      events: [
        { name: "select", detail: "string", description: "An action item was chosen; detail is its value/label." },
        { name: "checkedchange", detail: "{ value, checked }", description: "A checkbox item toggled." },
        { name: "radiochange", detail: "{ group, value }", description: "A radio option was picked." }
      ],
      extend: [
        `import { ShadMenubar } from "@youneed/dom-ui-shad";`,
        ``,
        `const bar = document.querySelector("shad-menubar");`,
        `bar.menus = [`,
        `  { label: "File", items: [`,
        `    { label: "New Tab", shortcut: "⌘T" },`,
        `    { separator: true },`,
        `    { label: "Share", items: [{ label: "Email link" }] }, // submenu`,
        `  ] },`,
        `  { label: "View", items: [`,
        `    { checkbox: true, label: "Full URLs", value: "urls", checked: true },`,
        `  ] },`,
        `];`,
        `bar.addEventListener("select", (e) => console.log(e.detail));`
      ].join("\n")
    }
  },
  "navigation-menu": {
    title: "Navigation Menu",
    description: "A collection of links for navigating websites.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex min-h-[260px] justify-center pt-4"><shad-navigation-menu .items=${NAV_ITEMS}></shad-navigation-menu></div>`,
        code: [
          `<shad-navigation-menu></shad-navigation-menu>`,
          ``,
          `nav.items = [`,
          `  { label: "Getting started", links: [`,
          `    { title: "Introduction", href: "/docs", description: "…" },`,
          `  ] },`,
          `  { label: "Components", cols: 2, links: components },`,
          `  { label: "Docs", href: "/docs" },   // a plain link`,
          `];`
        ].join("\n")
      },
      {
        name: "Link Component",
        render: () => html`<div class="flex justify-center pt-2">
          <shad-navigation-menu .items=${[{ label: "Home", href: "#" }, { label: "Docs", href: "#" }, { label: "Pricing", href: "#" }]}></shad-navigation-menu>
        </div>`,
        code: `nav.items = [{ label: "Home", href: "/" }, { label: "Docs", href: "/docs" }];`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex min-h-[260px] justify-center pt-4"><shad-navigation-menu .items=${NAV_ITEMS}></shad-navigation-menu></div>`
      }
    ],
    api: {
      props: [
        { name: "items", type: "NavItem[]", default: "[]", description: "Each item is a trigger (links/content) or a plain link (href)." }
      ],
      slots: [],
      extend: [
        `import { ShadNavigationMenu } from "@youneed/dom-ui-shad";`,
        ``,
        `const nav = document.querySelector("shad-navigation-menu");`,
        `nav.items = [`,
        `  { label: "Getting started", width: "w-96", links: [`,
        `    { title: "Introduction", href: "/docs", description: "Re-usable components." },`,
        `  ] },`,
        `  { label: "Components", cols: 2, width: "w-[520px]", links: components },`,
        `  { label: "Docs", href: "/docs" },`,
        `];`
      ].join("\n")
    }
  },
  "context-menu": {
    title: "Context Menu",
    description: "Displays a menu located at the pointer, triggered by a right click.",
    examples: [
      { name: "Basic", render: () => cmTrigger(CM_BASIC), code: CM_CODE },
      { name: "Submenu", render: () => cmTrigger(CM_FULL), code: CM_SUB_CODE },
      { name: "Icons", render: () => cmTrigger(CM_ICONS), code: CM_CODE },
      { name: "Checkboxes & Radio", render: () => cmTrigger(CM_FULL), code: CM_SUB_CODE },
      { name: "Destructive", render: () => cmTrigger(CM_DESTRUCTIVE), code: CM_CODE },
      { name: "RTL", render: () => html`<div dir="rtl">${cmTrigger(CM_FULL)}</div>`, code: CM_SUB_CODE }
    ],
    api: {
      props: [
        { name: "items", type: "MenuEntry[]", default: "[]", description: "Menu structure (see kinds below)." }
      ],
      events: [
        { name: "select", detail: "string", description: "An action item was chosen; detail is its value/label." },
        { name: "checkedchange", detail: "{ value, checked }", description: "A checkbox item toggled." },
        { name: "radiochange", detail: "{ group, value }", description: "A radio option was picked." }
      ],
      slots: [{ name: "(default)", description: "The trigger area (right-click opens the menu at the cursor)." }],
      extend: [
        `import { ShadContextMenu } from "@youneed/dom-ui-shad";`,
        ``,
        `const m = document.querySelector("shad-context-menu");`,
        `m.items = [`,
        `  { label: "Reload", shortcut: "⌘R" },`,
        `  { label: "More Tools", items: [{ label: "Developer Tools" }] }, // submenu`,
        `  { separator: true },`,
        `  { checkbox: true, label: "Show Bookmarks", value: "bm", checked: true },`,
        `  { heading: "People" },`,
        `  { radio: "people", value: "pedro", label: "Pedro Duarte", checked: true },`,
        `  { label: "Delete", destructive: true },`,
        `];`,
        `m.addEventListener("select", (e) => console.log(e.detail));`
      ].join("\n")
    }
  },
  toggle: {
    title: "Toggle",
    description: "A two-state button that can be on or off.",
    examples: [
      {
        render: () => html`
          <div class="flex gap-3">
            <shad-toggle variant="outline">B</shad-toggle>
            <shad-toggle variant="outline">I</shad-toggle>
            <shad-toggle variant="outline">U</shad-toggle>
          </div>
        `
      }
    ]
  },
  progress: {
    title: "Progress",
    description: "Displays an indicator showing completion progress.",
    examples: [
      { name: "Basic", render: () => html`<div class="w-full max-w-md"><shad-progress value="60"></shad-progress></div>` },
      {
        name: "Controlled",
        render: () => {
          const set = (e, delta) => {
            const root = e.currentTarget.closest("[data-ctl]");
            const bar = root.querySelector("shad-progress");
            const v = Math.max(0, Math.min(100, bar.value + delta));
            bar.value = v;
            root.querySelector("[data-pct]").textContent = v + "%";
          };
          return html`<div data-ctl class="flex w-full max-w-md flex-col gap-3">
            <shad-progress value="40"></shad-progress>
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground"><span data-pct class="font-medium text-foreground">40%</span> complete</span>
              <div class="flex gap-2">
                <shad-button variant="outline" size="sm" @click=${(e) => set(e, -10)}>−10</shad-button>
                <shad-button variant="outline" size="sm" @click=${(e) => set(e, 10)}>+10</shad-button>
              </div>
            </div>
          </div>`;
        },
        code: [
          `<shad-progress value="40"></shad-progress>`,
          ``,
          `// Drive it from your own state:`,
          `const bar = document.querySelector("shad-progress");`,
          `bar.value = 66;   // reactive — the indicator animates to the new value`
        ].join("\n")
      }
    ],
    api: {
      props: [{ name: "value", type: "number", default: "0", description: "Completion percentage (0–100); mirrored to the attribute." }],
      extend: [
        `import { ShadProgress } from "@youneed/dom-ui-shad";`,
        ``,
        `const bar = document.querySelector("shad-progress");`,
        `bar.value = 66;   // the indicator transitions to the new value`
      ].join("\n")
    }
  },
  resizable: {
    title: "Resizable",
    description: "Accessible resizable panel groups and layouts with keyboard support.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-resizable-panel-group orientation="horizontal" class="h-[220px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="50%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">One</span></div>
          </shad-resizable-panel>
          <shad-resizable-handle with-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="50%">
            <shad-resizable-panel-group orientation="vertical">
              <shad-resizable-panel default-size="25%">
                <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Two</span></div>
              </shad-resizable-panel>
              <shad-resizable-handle with-handle></shad-resizable-handle>
              <shad-resizable-panel default-size="75%">
                <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Three</span></div>
              </shad-resizable-panel>
            </shad-resizable-panel-group>
          </shad-resizable-panel>
        </shad-resizable-panel-group>`,
        code: [
          `<shad-resizable-panel-group orientation="horizontal" class="rounded-lg border">`,
          `  <shad-resizable-panel default-size="50%"> … One … </shad-resizable-panel>`,
          `  <shad-resizable-handle with-handle></shad-resizable-handle>`,
          `  <shad-resizable-panel default-size="50%">`,
          `    <shad-resizable-panel-group orientation="vertical"> … Two / Three … </shad-resizable-panel-group>`,
          `  </shad-resizable-panel>`,
          `</shad-resizable-panel-group>`
        ].join("\n")
      },
      {
        name: "Vertical",
        render: () => html`<shad-resizable-panel-group orientation="vertical" class="h-[220px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="40%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Header</span></div>
          </shad-resizable-panel>
          <shad-resizable-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="60%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Content</span></div>
          </shad-resizable-panel>
        </shad-resizable-panel-group>`,
        code: `<shad-resizable-panel-group orientation="vertical"> … </shad-resizable-panel-group>`
      },
      {
        name: "Handle",
        render: () => html`<shad-resizable-panel-group orientation="horizontal" class="h-[160px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="25%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Sidebar</span></div>
          </shad-resizable-panel>
          <shad-resizable-handle with-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="75%">
            <div class="flex h-full items-center justify-center p-6"><span class="font-semibold">Main</span></div>
          </shad-resizable-panel>
        </shad-resizable-panel-group>`,
        code: `<shad-resizable-handle with-handle></shad-resizable-handle>  <!-- shows the grip -->`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-resizable-panel-group orientation="horizontal" class="h-[160px] max-w-md rounded-lg border border-border">
          <shad-resizable-panel default-size="50%"><div class="flex h-full items-center justify-center p-6"><span class="font-semibold">واحد</span></div></shad-resizable-panel>
          <shad-resizable-handle with-handle></shad-resizable-handle>
          <shad-resizable-panel default-size="50%"><div class="flex h-full items-center justify-center p-6"><span class="font-semibold">اثنان</span></div></shad-resizable-panel>
        </shad-resizable-panel-group></div>`
      }
    ],
    api: {
      props: [
        { name: "PanelGroup · orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Split direction (reflected for nested styling)." },
        { name: "Panel · default-size", type: "string", default: "equal", description: `Initial size weight, e.g. "50%" (panels share space proportionally).` },
        { name: "Handle · with-handle", type: "boolean", default: "false", description: "Show the draggable grip on the separator." }
      ],
      events: [
        { name: "resize", detail: "number[]", description: "Fires on the panel group while resizing (drag or arrow keys); detail is the panel sizes in percent (sums to 100)." }
      ],
      slots: [
        { name: "shad-resizable-panel-group", description: "The flex container; nest one inside a panel for grids." },
        { name: "shad-resizable-panel", description: "A resizable region (flex-basis 0; grows by weight)." },
        { name: "shad-resizable-handle", description: "Drag (pointer) or arrow-key to resize the adjacent panels." }
      ],
      extend: [
        `import { ShadResizablePanelGroup } from "@youneed/dom-ui-shad";`,
        ``,
        `// Compose freely; sizes are proportional flex-grow weights.`,
        `<shad-resizable-panel-group orientation="horizontal">`,
        `  <shad-resizable-panel default-size="30%"> … </shad-resizable-panel>`,
        `  <shad-resizable-handle with-handle></shad-resizable-handle>`,
        `  <shad-resizable-panel default-size="70%"> … </shad-resizable-panel>`,
        `</shad-resizable-panel-group>`,
        ``,
        `// React to resizing — detail is the panel sizes in percent:`,
        `group.addEventListener("resize", (e) => console.log(e.detail)); // e.g. [62.5, 37.5]`
      ].join("\n")
    }
  },
  "radio-group": {
    title: "Radio Group",
    description: "A set of checkable buttons where no more than one can be checked at a time.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-radio-group value="comfortable" class="w-fit">
          ${map(
          [["default", "Default"], ["comfortable", "Comfortable"], ["compact", "Compact"]],
          ([v, label], i) => html`<div class="flex items-center gap-3">
              <shad-radio-group-item value=${v} id=${"rg-" + i}></shad-radio-group-item>
              <shad-label for=${"rg-" + i}>${label}</shad-label>
            </div>`
        )}
        </shad-radio-group>`,
        code: [
          `<shad-radio-group value="comfortable">`,
          `  <div class="flex items-center gap-3">`,
          `    <shad-radio-group-item value="default" id="r1"></shad-radio-group-item>`,
          `    <shad-label for="r1">Default</shad-label>`,
          `  </div>`,
          `  …`,
          `</shad-radio-group>`,
          ``,
          `group.addEventListener("change", (e) => console.log(e.detail));`
        ].join("\n")
      },
      {
        name: "Description",
        render: () => html`<shad-radio-group value="card" class="w-fit gap-4">
          ${map(
          [
            ["card", "Card", "Pay with your saved credit or debit card."],
            ["paypal", "PayPal", "You'll be redirected to PayPal to finish."],
            ["apple", "Apple Pay", "Pay quickly with Touch ID or Face ID."]
          ],
          ([v, t, d], i) => html`<div class="flex items-start gap-3">
              <shad-radio-group-item value=${v} id=${"rd-" + i} class="mt-0.5"></shad-radio-group-item>
              <div class="grid gap-0.5">
                <shad-label for=${"rd-" + i}>${t}</shad-label>
                <p class="text-sm text-muted-foreground">${d}</p>
              </div>
            </div>`
        )}
        </shad-radio-group>`
      },
      {
        name: "Choice Card",
        render: () => html`<shad-radio-group value="pro" class="grid w-full max-w-md gap-3">
          ${map(
          [
            ["starter", "Starter", "For individuals and small teams."],
            ["pro", "Pro", "For growing businesses."],
            ["enterprise", "Enterprise", "For large teams and enterprises."]
          ],
          ([v, t, d], i) => html`<shad-label
              for=${"cc-" + i}
              class="block rounded-lg border border-border p-3.5 transition-colors hover:bg-muted/50 has-[shad-radio-group-item[checked]]:border-primary has-[shad-radio-group-item[checked]]:bg-muted/40"
            >
              <div class="flex items-center gap-3">
                <div class="flex flex-1 flex-col gap-1">
                  <span class="font-medium leading-none">${t}</span>
                  <span class="text-sm font-normal text-muted-foreground">${d}</span>
                </div>
                <shad-radio-group-item value=${v} id=${"cc-" + i}></shad-radio-group-item>
              </div>
            </shad-label>`
        )}
        </shad-radio-group>`,
        code: [
          `<shad-label for="r1" class="block rounded-lg border p-3.5`,
          `  has-[shad-radio-group-item[checked]]:border-primary">`,
          `  <div class="flex items-center gap-3">`,
          `    <div class="flex flex-1 flex-col gap-1">`,
          `      <span class="font-medium">Pro</span>`,
          `      <span class="text-sm text-muted-foreground">For growing businesses.</span>`,
          `    </div>`,
          `    <shad-radio-group-item value="pro" id="r1"></shad-radio-group-item>`,
          `  </div>`,
          `</shad-label>`
        ].join("\n")
      },
      {
        name: "Disabled",
        render: () => html`<shad-radio-group value="one" class="w-fit">
          <div class="flex items-center gap-3"><shad-radio-group-item value="one" id="rdis1"></shad-radio-group-item><shad-label for="rdis1">Enabled</shad-label></div>
          <div class="flex items-center gap-3"><shad-radio-group-item value="two" id="rdis2" disabled></shad-radio-group-item><shad-label for="rdis2">Disabled option</shad-label></div>
        </shad-radio-group>`
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col gap-2">
          <shad-radio-group invalid class="w-fit">
            ${map(
          [["yes", "Yes"], ["no", "No"]],
          ([v, label], i) => html`<div class="flex items-center gap-3"><shad-radio-group-item value=${v} id=${"riv-" + i}></shad-radio-group-item><shad-label for=${"riv-" + i}>${label}</shad-label></div>`
        )}
          </shad-radio-group>
          <p class="text-sm text-destructive">Please select an option.</p>
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-radio-group value="comfortable" class="w-fit">
          ${map(
          [["default", "افتراضي"], ["comfortable", "مريح"], ["compact", "مضغوط"]],
          ([v, label], i) => html`<div class="flex items-center gap-3"><shad-radio-group-item value=${v} id=${"rr-" + i}></shad-radio-group-item><shad-label for=${"rr-" + i}>${label}</shad-label></div>`
        )}
        </shad-radio-group></div>`
      }
    ],
    api: {
      props: [
        { name: "RadioGroup · value", type: "string", default: `""`, description: "The selected item's value; mirrored to the attribute." },
        { name: "RadioGroup · disabled", type: "boolean", default: "false", description: "Disables the whole group." },
        { name: "RadioGroup · invalid", type: "boolean", default: "false", description: "Marks every item invalid (destructive ring)." },
        { name: "RadioGroupItem · value / id / disabled", type: "string / string / boolean", default: "—", description: "Item value, id (for <shad-label for>), and per-item disable." }
      ],
      events: [{ name: "change", detail: "string", description: "Fires when the selection changes; detail is the new value." }],
      slots: [
        { name: "shad-radio-group", description: "Wraps the items (often in flex rows with labels)." },
        { name: "shad-radio-group-item", description: "A single radio control." }
      ],
      extend: [
        `import { ShadRadioGroup } from "@youneed/dom-ui-shad";`,
        ``,
        `const group = document.querySelector("shad-radio-group");`,
        `group.value = "compact";                       // select programmatically`,
        `group.addEventListener("change", (e) => console.log(e.detail));`
      ].join("\n")
    }
  },
  pagination: {
    title: "Pagination",
    description: "Pagination with page navigation, next and previous links.",
    examples: [
      {
        name: "Simple",
        render: () => html`<shad-pagination page="2" total="10"></shad-pagination>`,
        code: [
          `<shad-pagination page="2" total="10"></shad-pagination>`,
          ``,
          `pager.addEventListener("change", (e) => goToPage(e.detail));`
        ].join("\n")
      },
      {
        name: "Icons Only",
        render: () => html`<shad-pagination page="4" total="10" icons-only></shad-pagination>`,
        code: `<shad-pagination page="4" total="10" icons-only></shad-pagination>`
      },
      {
        name: "Links (href)",
        render: () => html`<shad-pagination page="2" total="5" .hrefFor=${(p) => `#page-${p}`}></shad-pagination>`,
        code: [
          `// Render real <a href> links (SSR / router) instead of buttons:`,
          `pager.hrefFor = (page) => \`/products?page=\${page}\`;`
        ].join("\n")
      },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-pagination page="2" total="10"></shad-pagination></div>` }
    ],
    api: {
      props: [
        { name: "page", type: "number", default: "1", description: "Current page (1-based); mirrored to the attribute." },
        { name: "total", type: "number", default: "1", description: "Total number of pages." },
        { name: "siblings", type: "number", default: "1", description: "How many page numbers to show on each side of the current page." },
        { name: "iconsOnly", type: "boolean", default: "false", description: `Previous/Next show only chevrons (attribute "icons-only").` },
        { name: "hrefFor", type: "(page) => string", default: "—", description: "Property: render items as <a href> for SSR/router links." }
      ],
      events: [
        { name: "change", detail: "number", description: "Fires when a page is chosen (button mode); detail is the new page." }
      ],
      extend: [
        `import { ShadPagination } from "@youneed/dom-ui-shad";`,
        ``,
        `const pager = document.querySelector("shad-pagination");`,
        `pager.total = 20;`,
        `pager.addEventListener("change", (e) => { pager.page = e.detail; load(e.detail); });`,
        ``,
        `// Or real links for an SSR app:`,
        `pager.hrefFor = (page) => \`/products?page=\${page}\`;`
      ].join("\n")
    }
  },
  avatar: {
    title: "Avatar",
    description: "An image element with a fallback for representing the user.",
    examples: [
      {
        name: "Basic",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            <shad-avatar alt="no image">JD</shad-avatar>
          </div>
        `
      },
      {
        name: "Badge",
        render: () => html`
          <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">
            CN
            <span slot="badge" class="h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"></span>
          </shad-avatar>
        `
      },
      {
        name: "Badge with Icon",
        render: () => html`
          <shad-avatar size="lg" alt="Jane Doe">
            JD
            <span slot="badge" class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
          </shad-avatar>
        `
      },
      {
        name: "Avatar Group",
        render: () => html`
          <shad-avatar-group>
            <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
            <shad-avatar alt="Jane Doe">JD</shad-avatar>
            <shad-avatar alt="Alex Kim">AK</shad-avatar>
          </shad-avatar-group>
        `
      },
      {
        name: "Avatar Group Count",
        render: () => html`
          <shad-avatar-group>
            <shad-avatar alt="Chris">CN</shad-avatar>
            <shad-avatar alt="Jane Doe">JD</shad-avatar>
            <shad-avatar alt="Alex Kim">AK</shad-avatar>
            <shad-avatar alt="3 more"><span class="text-xs">+3</span></shad-avatar>
          </shad-avatar-group>
        `
      },
      {
        name: "Avatar Group with Icon",
        render: () => html`
          <shad-avatar-group>
            <shad-avatar alt="Chris">CN</shad-avatar>
            <shad-avatar alt="Jane Doe">JD</shad-avatar>
            <shad-avatar alt="Add person">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            </shad-avatar>
          </shad-avatar-group>
        `
      },
      {
        name: "Sizes",
        render: () => html`
          <div class="flex items-center gap-3">
            <shad-avatar size="sm" alt="sm">SM</shad-avatar>
            <shad-avatar alt="default">MD</shad-avatar>
            <shad-avatar size="lg" alt="lg">LG</shad-avatar>
          </div>
        `
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl">
            <shad-avatar-group>
              <shad-avatar alt="Chris">CN</shad-avatar>
              <shad-avatar alt="Jane Doe">JD</shad-avatar>
              <shad-avatar alt="Alex Kim">AK</shad-avatar>
            </shad-avatar-group>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "src", type: "string", default: `""`, description: "Image URL; falls back to the slotted content if empty or it fails to load." },
        { name: "alt", type: "string", default: `""`, description: "Alternative text for the image." },
        { name: "size", type: `"sm" | "default" | "lg"`, default: `"default"`, description: "Avatar diameter (h-8 / h-10 / h-14)." }
      ],
      slots: [
        { name: "(default)", description: "Fallback content (initials / icon) shown until the image loads." },
        { name: "badge", description: "Optional corner indicator — a status dot or small icon." }
      ],
      extend: [
        `import { Component } from "@youneed/dom";`,
        `import { ShadAvatar } from "@youneed/dom-ui-shad";`,
        ``,
        `// Always-large avatar that derives its alt text into initials.`,
        `@Component.define()`,
        `export class UserAvatar extends ShadAvatar {`,
        `  static tagName = "user-avatar";`,
        ``,
        `  override size = "lg" as const;`,
        `}`,
        ``,
        `// Stack avatars with <shad-avatar-group> (overlap + ring):`,
        `// <shad-avatar-group><shad-avatar>CN</shad-avatar>…</shad-avatar-group>`
      ].join("\n")
    }
  },
  skeleton: {
    title: "Skeleton",
    description: "Use to show a placeholder while content is loading.",
    examples: [
      {
        name: "Avatar",
        render: () => html`<div class="flex items-center gap-4">
          <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>
          <div class="flex flex-col gap-2">
            <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>
            <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>
          </div>
        </div>`,
        code: [
          `<div class="flex items-center gap-4">`,
          `  <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>`,
          `  <div class="flex flex-col gap-2">`,
          `    <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>`,
          `    <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>`,
          `  </div>`,
          `</div>`
        ].join("\n")
      },
      {
        name: "Card",
        render: () => html`<div class="flex flex-col gap-3">
          <shad-skeleton class="h-[125px] w-[250px] rounded-xl"></shad-skeleton>
          <div class="flex flex-col gap-2">
            <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>
            <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>
          </div>
        </div>`
      },
      {
        name: "Text",
        render: () => html`<div class="flex w-full max-w-sm flex-col gap-2">
          <shad-skeleton class="h-4 w-full"></shad-skeleton>
          <shad-skeleton class="h-4 w-full"></shad-skeleton>
          <shad-skeleton class="h-4 w-full"></shad-skeleton>
          <shad-skeleton class="h-4 w-3/4"></shad-skeleton>
        </div>`
      },
      {
        name: "Form",
        render: () => html`<div class="flex w-full max-w-sm flex-col gap-5">
          ${map(
          ["w-16", "w-20", "w-14"],
          (lw) => html`<div class="flex flex-col gap-2">
              <shad-skeleton class=${"h-3.5 " + lw}></shad-skeleton>
              <shad-skeleton class="h-9 w-full"></shad-skeleton>
            </div>`
        )}
          <shad-skeleton class="h-9 w-24 self-end"></shad-skeleton>
        </div>`
      },
      {
        name: "Table",
        render: () => html`<div class="w-full max-w-md overflow-hidden rounded-lg border border-border">
          <div class="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5">
            ${map(["w-24", "w-32", "w-16"], (w) => html`<shad-skeleton class=${"h-4 " + w}></shad-skeleton>`)}
          </div>
          ${map(
          [0, 1, 2, 3],
          () => html`<div class="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
              <shad-skeleton class="h-4 w-24"></shad-skeleton>
              <shad-skeleton class="h-4 w-32"></shad-skeleton>
              <shad-skeleton class="h-4 w-16"></shad-skeleton>
            </div>`
        )}
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-4">
          <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>
          <div class="flex flex-col gap-2">
            <shad-skeleton class="h-4 w-[250px]"></shad-skeleton>
            <shad-skeleton class="h-4 w-[200px]"></shad-skeleton>
          </div>
        </div>`
      }
    ],
    api: {
      slots: [{ name: "(default)", description: "None — size and shape the host with utility classes (h-*, w-*, rounded-*)." }],
      extend: [
        `import { ShadSkeleton } from "@youneed/dom-ui-shad";`,
        ``,
        `<shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>  <!-- avatar -->`,
        `<shad-skeleton class="h-4 w-[200px]"></shad-skeleton>          <!-- text line -->`
      ].join("\n")
    }
  },
  slider: {
    title: "Slider",
    description: "An input where the user selects a value from within a given range.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[75]} max="100" step="1"></shad-slider></div>`,
        code: [
          `<shad-slider max="100" step="1"></shad-slider>`,
          ``,
          `slider.value = [75];                              // one thumb`,
          `slider.addEventListener("change", (e) => console.log(e.detail));`
        ].join("\n")
      },
      {
        name: "Range",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[25, 60]} max="100"></shad-slider></div>`,
        code: `<shad-slider></shad-slider>

slider.value = [25, 60];   // two thumbs → a range`
      },
      {
        name: "Multiple Thumbs",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[15, 45, 80]} max="100"></shad-slider></div>`,
        code: `slider.value = [15, 45, 80];   // any number of thumbs`
      },
      {
        name: "Vertical",
        render: () => html`<div class="flex h-44 justify-center"><shad-slider orientation="vertical" .value=${[40]}></shad-slider></div>`,
        code: `<shad-slider orientation="vertical"></shad-slider>`
      },
      {
        name: "Controlled",
        render: () => html`<div class="mx-auto grid w-full max-w-xs gap-3">
          <div class="flex items-center justify-between gap-2">
            <shad-label for="slider-temp">Temperature</shad-label>
            <span data-out class="text-sm text-muted-foreground">0.3, 0.7</span>
          </div>
          <shad-slider
            id="slider-temp"
            .value=${[0.3, 0.7]}
            min="0"
            max="1"
            step="0.1"
            @change=${(e) => {
          const out = e.currentTarget.closest("[class*=grid]").querySelector("[data-out]");
          out.textContent = e.detail.map((n) => n.toFixed(1)).join(", ");
        }}
          ></shad-slider>
        </div>`,
        code: [
          `<shad-slider id="t" min="0" max="1" step="0.1"></shad-slider>`,
          ``,
          `slider.value = [0.3, 0.7];`,
          `slider.addEventListener("change", (e) => {`,
          `  label.textContent = e.detail.join(", ");   // e.g. "0.3, 0.7"`,
          `});`
        ].join("\n")
      },
      {
        name: "Disabled",
        render: () => html`<div class="w-full max-w-xs"><shad-slider .value=${[40]} disabled></shad-slider></div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-xs"><shad-slider .value=${[30]} max="100"></shad-slider></div>`
      }
    ],
    api: {
      props: [
        { name: "value", type: "number[]", default: "[50]", description: "Thumb values; one entry per thumb (reflected via change)." },
        { name: "min / max / step", type: "number", default: "0 / 100 / 1", description: "Range bounds and snap increment." },
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Slider direction." },
        { name: "disabled", type: "boolean", default: "false", description: "Disables interaction and dims it." }
      ],
      events: [{ name: "change", detail: "number[]", description: "Fires on drag / arrow keys; detail is the new value array." }],
      extend: [
        `import { ShadSlider } from "@youneed/dom-ui-shad";`,
        ``,
        `const slider = document.querySelector("shad-slider");`,
        `slider.value = [25, 75];                          // range`,
        `slider.addEventListener("change", (e) => console.log(e.detail));`
      ].join("\n")
    }
  },
  spinner: {
    title: "Spinner",
    description: "An indicator that can be used to show a loading state.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex w-full max-w-xs flex-col gap-4">
          <shad-item variant="muted">
            <shad-item-media><shad-spinner></shad-spinner></shad-item-media>
            <shad-item-content><shad-item-title>Processing payment…</shad-item-title></shad-item-content>
            <shad-item-actions><span class="text-sm tabular-nums">$100.00</span></shad-item-actions>
          </shad-item>
        </div>`,
        code: [
          `<shad-item variant="muted">`,
          `  <shad-item-media><shad-spinner></shad-spinner></shad-item-media>`,
          `  <shad-item-content><shad-item-title>Processing payment…</shad-item-title></shad-item-content>`,
          `</shad-item>`
        ].join("\n")
      },
      {
        name: "Size",
        render: () => html`<div class="flex items-center gap-6 text-foreground">
          <shad-spinner class="size-4"></shad-spinner>
          <shad-spinner class="size-6"></shad-spinner>
          <shad-spinner class="size-8"></shad-spinner>
          <shad-spinner class="size-10 text-primary"></shad-spinner>
        </div>`,
        code: `<shad-spinner class="size-8"></shad-spinner>  <!-- size + color via classes -->`
      },
      {
        name: "Button",
        render: () => html`<div class="flex gap-3">
          <shad-button disabled><shad-spinner></shad-spinner> Loading…</shad-button>
          <shad-button variant="outline" disabled><shad-spinner></shad-spinner> Please wait</shad-button>
        </div>`,
        code: `<shad-button disabled><shad-spinner></shad-spinner> Loading…</shad-button>`
      },
      {
        name: "Badge",
        render: () => html`<shad-badge variant="secondary"><shad-spinner class="size-3"></shad-spinner> Syncing</shad-badge>`,
        code: `<shad-badge><shad-spinner class="size-3"></shad-spinner> Syncing</shad-badge>`
      },
      {
        name: "Input Group",
        render: () => html`<div class="max-w-xs">
          <shad-input-group>
            <shad-input-group-input placeholder="Checking…" value="my-username"></shad-input-group-input>
            <shad-input-group-addon align="inline-end"><shad-spinner></shad-spinner></shad-input-group-addon>
          </shad-input-group>
        </div>`
      },
      {
        name: "Empty",
        render: () => html`<div class="flex h-56 w-full">
          <shad-empty variant="outline">
            <shad-empty-header>
              <shad-empty-media variant="icon"><shad-spinner></shad-spinner></shad-empty-media>
              <shad-empty-title>Loading projects…</shad-empty-title>
              <shad-empty-description>This may take a few seconds.</shad-empty-description>
            </shad-empty-header>
          </shad-empty>
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-button disabled><shad-spinner></shad-spinner> جارٍ التحميل…</shad-button></div>`
      }
    ],
    api: {
      slots: [{ name: "(default)", description: "None — size the host (size-4 default) and color via currentColor." }],
      extend: [
        `import { ShadSpinner } from "@youneed/dom-ui-shad";`,
        ``,
        `<shad-spinner></shad-spinner>                <!-- 1rem, inherits color -->`,
        `<shad-spinner class="size-8 text-primary"></shad-spinner>`
      ].join("\n")
    }
  },
  sonner: {
    title: "Toast (Sonner)",
    description: "An opinionated toast component — call toast() from anywhere.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div>
          <shad-toaster></shad-toaster>
          <shad-button
            variant="outline"
            @click=${() => toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: { label: "Undo", onClick: () => {
          } }
        })}
            >Show Toast</shad-button
          >
        </div>`,
        code: [
          `import { toast } from "@youneed/dom-ui-shad";`,
          ``,
          `<shad-toaster></shad-toaster>   <!-- once on the page -->`,
          ``,
          `toast("Event has been created", {`,
          `  description: "Sunday, December 03, 2023 at 9:00 AM",`,
          `  action: { label: "Undo", onClick: () => undo() },`,
          `});`
        ].join("\n")
      },
      {
        name: "Types",
        render: () => html`<div class="flex flex-wrap gap-2">
          <shad-button variant="outline" size="sm" @click=${() => toast("Event created")}>Default</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.success("Changes saved")}>Success</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.error("Something went wrong")}>Error</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.warning("Low on storage")}>Warning</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.info("New update available")}>Info</shad-button>
          <shad-button variant="outline" size="sm" @click=${() => toast.loading("Uploading…", { duration: 2500 })}>Loading</shad-button>
        </div>`,
        code: `toast.success("Saved"); toast.error("Failed"); toast.loading("Working…");`
      },
      {
        name: "Description",
        render: () => html`<shad-button
          variant="outline"
          @click=${() => toast("Scheduled: Catch up", { description: "Friday, February 10, 2023 at 5:57 PM" })}
          >Show Toast</shad-button
        >`,
        code: `toast("Scheduled: Catch up", { description: "Friday, February 10, 2023 at 5:57 PM" });`
      },
      {
        name: "Position",
        render: () => html`<div class="flex flex-wrap gap-2">
          ${map(
          ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"],
          (pos) => html`<shad-button variant="outline" size="sm" @click=${() => toast(pos, { position: pos })}>${pos}</shad-button>`
        )}
        </div>`,
        code: [
          `// Per-toast position (only the new toast moves):`,
          `toast("Saved", { position: "top-center" });`,
          ``,
          `// Or set the default for all toasts on the toaster:`,
          `<shad-toaster position="top-center"></shad-toaster>`
        ].join("\n")
      }
    ],
    api: {
      props: [
        { name: "Toaster · position", type: `"top|bottom"-"left|center|right"`, default: `"bottom-right"`, description: "Corner the toast stack anchors to." },
        { name: "toast(msg, opts)", type: "fn", default: "—", description: "opts: description, action {label,onClick}, type, duration. Plus toast.success/error/warning/info/loading/message/dismiss." }
      ],
      slots: [{ name: "shad-toaster", description: "Place one on the page; toast() renders into it." }],
      extend: [
        `import { toast } from "@youneed/dom-ui-shad";`,
        ``,
        `const id = toast.loading("Saving…");`,
        `await save();`,
        `toast.dismiss(id);`,
        `toast.success("Saved");`
      ].join("\n")
    }
  },
  separator: {
    title: "Separator",
    description: "Visually or semantically separates content.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="flex max-w-sm flex-col gap-4 rounded-lg border border-border bg-background p-6 text-sm">
          <div class="flex flex-col gap-1.5">
            <div class="font-medium leading-none">youneed/shad</div>
            <div class="text-muted-foreground">The Foundation for your Design System</div>
          </div>
          <shad-separator></shad-separator>
          <div>A set of beautifully designed components that you can customize, extend, and build on.</div>
        </div>`,
        code: [
          `<div class="flex flex-col gap-4">`,
          `  <div>…</div>`,
          `  <shad-separator></shad-separator>`,
          `  <div>…</div>`,
          `</div>`
        ].join("\n")
      },
      {
        name: "Vertical",
        render: () => html`<div class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-sm">
          <span>Blog</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>Docs</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>Source</span>
        </div>`,
        code: `<shad-separator orientation="vertical"></shad-separator>`
      },
      {
        name: "Menu",
        render: () => html`<div class="flex items-center gap-3 rounded-lg border border-border p-1.5 text-sm">
          <button class="rounded-md px-2 py-1 hover:bg-muted">File</button>
          <shad-separator orientation="vertical" class="!h-4"></shad-separator>
          <button class="rounded-md px-2 py-1 hover:bg-muted">Edit</button>
          <shad-separator orientation="vertical" class="!h-4"></shad-separator>
          <button class="rounded-md px-2 py-1 hover:bg-muted">View</button>
        </div>`
      },
      {
        name: "List",
        render: () => html`<div class="w-full max-w-xs overflow-hidden rounded-lg border border-border">
          ${map(
          ["Inbox", "Drafts", "Sent", "Archive"],
          (label, i) => html`
              ${when(i > 0, () => html`<shad-separator></shad-separator>`)}
              <div class="px-3 py-2 text-sm hover:bg-muted">${label}</div>
            `
        )}
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="flex items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-sm">
          <span>المدونة</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>الوثائق</span>
          <shad-separator orientation="vertical" class="!h-5"></shad-separator>
          <span>المصدر</span>
        </div>`
      }
    ],
    api: {
      props: [
        { name: "orientation", type: `"horizontal" | "vertical"`, default: `"horizontal"`, description: "Line direction. Vertical stretches to the flex row's height (self-stretch)." }
      ],
      extend: [
        `import { ShadSeparator } from "@youneed/dom-ui-shad";`,
        ``,
        `<shad-separator></shad-separator>                         <!-- horizontal -->`,
        `<shad-separator orientation="vertical"></shad-separator>  <!-- vertical (in a flex row) -->`
      ].join("\n")
    }
  },
  "scroll-area": {
    title: "Scroll Area",
    description: "Augments native scroll functionality for custom, cross-browser styling.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-scroll-area class="h-72 w-48 rounded-md border border-border">
          <div class="p-4">
            <h4 class="mb-4 text-sm font-medium leading-none">Tags</h4>
            ${map(
          Array.from({ length: 50 }, (_, i) => `v1.2.0-beta.${50 - i}`),
          (tag) => html`<div class="text-sm">${tag}</div><shad-separator class="my-2"></shad-separator>`
        )}
          </div>
        </shad-scroll-area>`,
        code: [
          `<shad-scroll-area class="h-72 w-48 rounded-md border">`,
          `  <div class="p-4">`,
          `    <h4 class="mb-4 text-sm font-medium">Tags</h4>`,
          `    <div class="text-sm">v1.2.0-beta.50</div>`,
          `    <shad-separator class="my-2"></shad-separator>`,
          `    …`,
          `  </div>`,
          `</shad-scroll-area>`
        ].join("\n")
      },
      {
        name: "Horizontal",
        render: () => html`<shad-scroll-area orientation="horizontal" class="w-96 max-w-full rounded-md border border-border">
          <div class="flex w-max gap-4 p-4">
            ${map(
          Array.from({ length: 12 }, (_, i) => i + 1),
          (n) => html`<figure class="shrink-0">
                <div class="flex h-32 w-32 items-center justify-center rounded-md bg-muted text-3xl font-semibold">${n}</div>
                <figcaption class="pt-2 text-xs text-muted-foreground">Photo ${n}</figcaption>
              </figure>`
        )}
          </div>
        </shad-scroll-area>`,
        code: `<shad-scroll-area orientation="horizontal" class="rounded-md border"><div class="flex w-max gap-4 p-4">…</div></shad-scroll-area>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-scroll-area class="h-56 w-48 rounded-md border border-border">
          <div class="p-4">
            <h4 class="mb-4 text-sm font-medium leading-none">العلامات</h4>
            ${map(
          Array.from({ length: 30 }, (_, i) => `الإصدار ${30 - i}`),
          (t) => html`<div class="text-sm">${t}</div><shad-separator class="my-2"></shad-separator>`
        )}
          </div>
        </shad-scroll-area></div>`
      }
    ],
    api: {
      props: [
        { name: "orientation", type: `"vertical" | "horizontal" | "both"`, default: `"vertical"`, description: "Which axis scrolls (the scrollbar is themed and slim)." }
      ],
      slots: [{ name: "(default)", description: "The scrollable content. Set the host's height/width to bound it." }],
      extend: [
        `import { ShadScrollArea } from "@youneed/dom-ui-shad";`,
        ``,
        `// Bound it with size classes; the slim themed scrollbar is built in.`,
        `<shad-scroll-area class="h-72 w-48 rounded-md border"> … </shad-scroll-area>`,
        `<shad-scroll-area orientation="horizontal"> … </shad-scroll-area>`
      ].join("\n")
    }
  },
  sidebar: {
    title: "Sidebar",
    description: "A composable, themeable and customizable sidebar component.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="h-[460px] w-full overflow-hidden rounded-lg border border-border">
          <shad-sidebar-provider>
            <shad-sidebar>
              <shad-sidebar-header>
                <shad-sidebar-menu>
                  <shad-sidebar-menu-item>
                    <shad-sidebar-menu-button size="lg">
                      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">A</span>
                      <span class="flex flex-col leading-tight group-data-[state=collapsed]/sidebar:hidden"><span class="font-medium">Acme Inc</span><span class="text-xs text-muted-foreground">Enterprise</span></span>
                      ${sbUpDown}
                    </shad-sidebar-menu-button>
                  </shad-sidebar-menu-item>
                </shad-sidebar-menu>
              </shad-sidebar-header>
              <shad-sidebar-content>
                <shad-sidebar-group>
                  <shad-sidebar-group-label>Platform</shad-sidebar-group-label>
                  <shad-sidebar-menu>
                    <shad-sidebar-menu-item default-open>
                      <shad-sidebar-menu-button active>${sbTerminal}<span class="group-data-[state=collapsed]/sidebar:hidden">Playground</span>${sbChevron}</shad-sidebar-menu-button>
                      <shad-sidebar-menu-sub>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>History</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Starred</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Settings</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                      </shad-sidebar-menu-sub>
                    </shad-sidebar-menu-item>
                    <shad-sidebar-menu-item>
                      <shad-sidebar-menu-button>${sbBot}<span class="group-data-[state=collapsed]/sidebar:hidden">Models</span>${sbChevron}</shad-sidebar-menu-button>
                      <shad-sidebar-menu-sub>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Genesis</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Explorer</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Quantum</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                      </shad-sidebar-menu-sub>
                    </shad-sidebar-menu-item>
                    <shad-sidebar-menu-item><shad-sidebar-menu-button>${sbBook}<span class="group-data-[state=collapsed]/sidebar:hidden">Documentation</span></shad-sidebar-menu-button><shad-sidebar-menu-badge>3</shad-sidebar-menu-badge></shad-sidebar-menu-item>
                    <shad-sidebar-menu-item>
                      <shad-sidebar-menu-button>${sbSettings}<span class="group-data-[state=collapsed]/sidebar:hidden">Settings</span>${sbChevron}</shad-sidebar-menu-button>
                      <shad-sidebar-menu-sub>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>General</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Team</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                        <shad-sidebar-menu-sub-item><shad-sidebar-menu-sub-button href="#"><span>Billing</span></shad-sidebar-menu-sub-button></shad-sidebar-menu-sub-item>
                      </shad-sidebar-menu-sub>
                    </shad-sidebar-menu-item>
                  </shad-sidebar-menu>
                </shad-sidebar-group>
              </shad-sidebar-content>
              <shad-sidebar-footer>
                <shad-sidebar-menu>
                  <shad-sidebar-menu-item>
                    <shad-dropdown-menu side="right" align="end" .items=${SB_USER_MENU} class="block">
                      <shad-sidebar-menu-button size="lg">
                        <shad-avatar src="https://github.com/shadcn.png" alt="shadcn">CN</shad-avatar>
                        <span class="flex flex-col leading-tight group-data-[state=collapsed]/sidebar:hidden"><span class="font-medium">shadcn</span><span class="text-xs text-muted-foreground">m@example.com</span></span>
                        ${sbUpDown}
                      </shad-sidebar-menu-button>
                    </shad-dropdown-menu>
                  </shad-sidebar-menu-item>
                </shad-sidebar-menu>
              </shad-sidebar-footer>
              <shad-sidebar-rail></shad-sidebar-rail>
            </shad-sidebar>
            <shad-sidebar-inset>
              <header class="flex h-12 items-center gap-2 border-b border-border px-3">
                <shad-sidebar-trigger></shad-sidebar-trigger>
                <shad-separator orientation="vertical" class="my-2"></shad-separator>
                <span class="text-sm text-muted-foreground">Dashboard</span>
              </header>
              <div class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">A sidebar that collapses to icons.</div>
            </shad-sidebar-inset>
          </shad-sidebar-provider>
        </div>`,
        code: [
          `<shad-sidebar-provider>`,
          `  <shad-sidebar>`,
          `    <shad-sidebar-header> … </shad-sidebar-header>`,
          `    <shad-sidebar-content>`,
          `      <shad-sidebar-group>`,
          `        <shad-sidebar-group-label>Platform</shad-sidebar-group-label>`,
          `        <shad-sidebar-menu>`,
          `          <shad-sidebar-menu-item>`,
          `            <shad-sidebar-menu-button active><svg/><span>Playground</span></shad-sidebar-menu-button>`,
          `          </shad-sidebar-menu-item>`,
          `        </shad-sidebar-menu>`,
          `      </shad-sidebar-group>`,
          `    </shad-sidebar-content>`,
          `    <shad-sidebar-footer> … </shad-sidebar-footer>`,
          `    <shad-sidebar-rail></shad-sidebar-rail>`,
          `  </shad-sidebar>`,
          `  <shad-sidebar-inset><shad-sidebar-trigger></shad-sidebar-trigger> … </shad-sidebar-inset>`,
          `</shad-sidebar-provider>`
        ].join("\n")
      }
    ],
    api: {
      props: [
        { name: "SidebarProvider · open", type: "boolean", default: "true", description: "Expanded/collapsed state (reflected as data-state; toggled by trigger, rail, or ⌘/Ctrl+B)." },
        { name: "SidebarMenuButton · active / size / href", type: 'boolean / "default"|"lg" / string', default: "—", description: "Highlight, row height, and render as a link." }
      ],
      slots: [
        { name: "shad-sidebar-provider", description: "Wraps the sidebar + inset; owns the open state." },
        { name: "shad-sidebar", description: "The panel (header / content / footer / rail). Collapses to an icon rail." },
        { name: "shad-sidebar-group + -label / -menu / -menu-item / -menu-button", description: "Sections and navigation rows (button with icon + <span> label)." },
        { name: "shad-sidebar-menu-sub / -sub-item / -sub-button", description: "Nested sub-navigation." },
        { name: "shad-sidebar-menu-action / -menu-badge", description: "Trailing action button / count badge on a row." },
        { name: "shad-sidebar-trigger / -rail / -inset", description: "Toggle button, draggable edge, and the main content area." }
      ],
      extend: [
        `import { ShadSidebarProvider } from "@youneed/dom-ui-shad";`,
        ``,
        `const provider = document.querySelector("shad-sidebar-provider");`,
        `provider.toggle();        // or set provider.open = false`,
        `// ⌘/Ctrl+B toggles it too. The provider is a Tailwind group: hide labels`,
        `// on collapse with class="group-data-[state=collapsed]/sidebar:hidden".`
      ].join("\n")
    }
  },
  textarea: {
    title: "Textarea",
    description: "Displays a multi-line form text field.",
    examples: [
      { render: () => html`<div class="max-w-md"><shad-textarea placeholder="Type your message here." rows="4"></shad-textarea></div>` }
    ]
  },
  alert: {
    title: "Alert",
    description: "Displays a callout for user attention.",
    examples: [
      {
        name: "Default",
        render: () => html`<div class="w-full max-w-md"><shad-alert><span slot="title">Heads up!</span>You can add components to your app using the CLI.</shad-alert></div>`
      },
      {
        name: "With Icon",
        render: () => html`
          <div class="w-full max-w-md">
            <shad-alert>
              <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>
              </svg>
              <span slot="title">Payment successful</span>
              Your payment of $29.99 has been processed. A receipt was sent to your email.
            </shad-alert>
          </div>
        `
      },
      {
        name: "Destructive",
        render: () => html`
          <div class="w-full max-w-md">
            <shad-alert variant="destructive">
              <svg slot="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path>
              </svg>
              <span slot="title">Unable to process payment</span>
              Your card was declined. Please try a different payment method.
            </shad-alert>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "variant", type: `"default" | "destructive"`, default: `"default"`, description: "Visual tone of the callout." }
      ],
      slots: [
        { name: "icon", description: "Optional leading icon (e.g. an <svg>); adds the icon column when present." },
        { name: "title", description: "The alert heading." },
        { name: "(default)", description: "The alert description / body." }
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadAlert } from "@youneed/dom-ui-shad";`,
        ``,
        `// A success alert that ships its own icon + default title.`,
        `@Component.define()`,
        `export class SuccessAlert extends ShadAlert {`,
        `  static tagName = "success-alert";`,
        ``,
        `  override render() {`,
        `    return html\``,
        `      <svg slot="icon" viewBox="0 0 24 24"><!-- check --></svg>`,
        `      <span slot="title">Success</span>`,
        `      \${super.render()}\`;`,
        `  }`,
        `}`
      ].join("\n")
    }
  },
  "aspect-ratio": {
    title: "Aspect Ratio",
    description: "Displays content within a desired ratio.",
    examples: [
      {
        name: "Default",
        render: () => html`
          <div class="w-full max-w-md">
            <shad-aspect-ratio class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">16 / 9</div>
            </shad-aspect-ratio>
          </div>
        `
      },
      {
        name: "Square",
        render: () => html`
          <div class="w-full max-w-[16rem]">
            <shad-aspect-ratio ratio="1" class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">1 / 1</div>
            </shad-aspect-ratio>
          </div>
        `
      },
      {
        name: "Portrait",
        render: () => html`
          <div class="w-full max-w-[14rem]">
            <shad-aspect-ratio ratio="0.75" class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">3 / 4</div>
            </shad-aspect-ratio>
          </div>
        `
      },
      {
        name: "RTL",
        render: () => html`
          <div dir="rtl" class="w-full max-w-md">
            <shad-aspect-ratio class="overflow-hidden rounded-lg border border-border">
              <div class="flex items-center justify-center bg-muted text-sm font-medium text-muted-foreground">16 / 9</div>
            </shad-aspect-ratio>
          </div>
        `
      }
    ],
    api: {
      props: [
        { name: "ratio", type: "number", default: "16 / 9", description: "Width ÷ height — e.g. 1 (square), 0.75 (3/4 portrait), 1.7777 (16/9)." }
      ],
      slots: [{ name: "(default)", description: "The content to constrain — an <img>, <video>, or any box (it fills the frame)." }],
      extend: [
        `import { Component } from "@youneed/dom";`,
        `import { ShadAspectRatio } from "@youneed/dom-ui-shad";`,
        ``,
        `// A poster that locks every instance to a 2:3 movie ratio.`,
        `@Component.define()`,
        `export class Poster extends ShadAspectRatio {`,
        `  static tagName = "movie-poster";`,
        ``,
        `  override ratio = 2 / 3;`,
        `}`,
        ``,
        `// <movie-poster><img src="…" /></movie-poster>`
      ].join("\n")
    }
  },
  tabs: {
    title: "Tabs",
    description: "A set of layered sections of content shown one at a time.",
    examples: [
      {
        render: () => html`
          <shad-tabs value="account" class="max-w-md">
            <shad-tab value="account" title="Account">Make changes to your account here.</shad-tab>
            <shad-tab value="password" title="Password">Change your password here.</shad-tab>
          </shad-tabs>
        `
      }
    ]
  },
  accordion: {
    title: "Accordion",
    description: "A vertically stacked set of interactive headings that each reveal a section of content.",
    examples: [
      {
        name: "Single",
        render: () => html`
          <shad-accordion type="single" class="w-full max-w-md">
            <shad-accordion-item title="What are your shipping options?" open
              >We offer standard (5–7 days), express (2–3 days), and overnight shipping.</shad-accordion-item
            >
            <shad-accordion-item title="What is your return policy?"
              >Returns are accepted within 30 days of delivery, no questions asked.</shad-accordion-item
            >
            <shad-accordion-item title="How can I contact customer support?"
              >Reach us 24/7 by email at support@example.com or via live chat.</shad-accordion-item
            >
          </shad-accordion>
        `
      },
      {
        name: "Multiple",
        render: () => html`
          <shad-accordion type="multiple" class="w-full max-w-md">
            <shad-accordion-item title="Is it accessible?" open
              >Yes — proper roles, aria-expanded/controls and keyboard support.</shad-accordion-item
            >
            <shad-accordion-item title="Is it animated?"
              >Yes — the height animates via a CSS grid track, the chevron rotates.</shad-accordion-item
            >
            <shad-accordion-item title="Can several be open at once?"
              >With <code>type="multiple"</code>, yes — each toggles independently.</shad-accordion-item
            >
          </shad-accordion>
        `
      }
    ],
    api: {
      props: [
        { name: "type", type: `"single" | "multiple"`, default: `"single"`, description: "On <shad-accordion>: single closes siblings when one opens; multiple is independent." },
        { name: "title", type: "string", default: `""`, description: "On <shad-accordion-item>: the trigger heading text." },
        { name: "open", type: "boolean", default: "false", description: "On <shad-accordion-item>: whether the section starts expanded." }
      ],
      events: [
        { name: "toggle", detail: "boolean", description: "<shad-accordion-item> fires on expand/collapse; detail is the new open state." }
      ],
      slots: [{ name: "(default)", description: "On <shad-accordion-item>: the collapsible content." }],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadAccordionItem } from "@youneed/dom-ui-shad";`,
        ``,
        `// An item that starts open and logs every expand/collapse.`,
        `@Component.define()`,
        `export class FaqItem extends ShadAccordionItem {`,
        `  static tagName = "faq-item";`,
        ``,
        `  override open = true;`,
        ``,
        `  override toggle() {`,
        `    super.toggle();`,
        `    console.log("faq toggled:", this.title, this.open);`,
        `  }`,
        `}`
      ].join("\n")
    }
  },
  select: {
    title: "Select",
    description: "Displays a list of options for the user to pick from—triggered by a button.",
    examples: [
      {
        name: "Basic",
        render: () => html`<div class="w-full max-w-48">
          <shad-select placeholder="Select a fruit">
            <shad-option value="apple" group="Fruits">Apple</shad-option>
            <shad-option value="banana" group="Fruits">Banana</shad-option>
            <shad-option value="blueberry" group="Fruits">Blueberry</shad-option>
            <shad-option value="grapes" group="Fruits">Grapes</shad-option>
            <shad-option value="pineapple" group="Fruits">Pineapple</shad-option>
          </shad-select>
        </div>`,
        code: [
          `<shad-select placeholder="Select a fruit">`,
          `  <shad-option value="apple" group="Fruits">Apple</shad-option>`,
          `  <shad-option value="banana" group="Fruits">Banana</shad-option>`,
          `</shad-select>`,
          ``,
          `select.addEventListener("change", (e) => console.log(e.detail));`
        ].join("\n")
      },
      {
        name: "Align Item With Trigger",
        render: () => html`<div class="w-full max-w-48">
          <shad-select position="item" value="banana">
            <shad-option value="apple">Apple</shad-option>
            <shad-option value="banana">Banana</shad-option>
            <shad-option value="blueberry">Blueberry</shad-option>
            <shad-option value="grapes">Grapes</shad-option>
          </shad-select>
        </div>`,
        code: `<shad-select position="item"> … </shad-select>  <!-- selected item opens over the trigger -->`
      },
      {
        name: "Groups",
        render: () => html`<div class="w-full max-w-48">
          <shad-select placeholder="Select a timezone">
            <shad-option value="est" group="North America">Eastern</shad-option>
            <shad-option value="cst" group="North America">Central</shad-option>
            <shad-option value="pst" group="North America">Pacific</shad-option>
            <shad-option value="gmt" group="Europe">GMT</shad-option>
            <shad-option value="cet" group="Europe">Central European</shad-option>
            <shad-option value="jst" group="Asia">Japan</shad-option>
            <shad-option value="ist" group="Asia">India</shad-option>
          </shad-select>
        </div>`,
        code: `<shad-option value="est" group="North America">Eastern</shad-option>  <!-- group → section label -->`
      },
      {
        name: "Scrollable",
        render: () => html`<div class="w-full max-w-48">
          <shad-select placeholder="Select a number">
            ${map(Array.from({ length: 40 }, (_, i) => i + 1), (n) => html`<shad-option value=${String(n)}>Item ${n}</shad-option>`)}
          </shad-select>
        </div>`
      },
      {
        name: "Disabled",
        render: () => html`<div class="flex flex-col gap-3">
          <div class="w-full max-w-48"><shad-select placeholder="Whole select disabled" disabled></shad-select></div>
          <div class="w-full max-w-48">
            <shad-select placeholder="Some options disabled">
              <shad-option value="apple">Apple</shad-option>
              <shad-option value="banana" disabled>Banana (out of stock)</shad-option>
              <shad-option value="grapes">Grapes</shad-option>
            </shad-select>
          </div>
        </div>`
      },
      {
        name: "Invalid",
        render: () => html`<div class="flex flex-col gap-2">
          <div class="w-full max-w-48">
            <shad-select placeholder="Select a fruit" invalid>
              <shad-option value="apple">Apple</shad-option>
              <shad-option value="banana">Banana</shad-option>
            </shad-select>
          </div>
          <p class="text-sm text-destructive">Please select a fruit.</p>
        </div>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl" class="w-full max-w-48">
          <shad-select placeholder="اختر فاكهة">
            <shad-option value="apple" group="الفواكه">تفاحة</shad-option>
            <shad-option value="banana" group="الفواكه">موز</shad-option>
            <shad-option value="grapes" group="الفواكه">عنب</shad-option>
          </shad-select>
        </div>`
      }
    ],
    api: {
      props: [
        { name: "Select · value", type: "string", default: `""`, description: "The selected option's value; mirrored to the attribute." },
        { name: "Select · placeholder", type: "string", default: `"Select…"`, description: "Trigger text shown when nothing is selected." },
        { name: "Select · position", type: `"popper" | "item"`, default: `"popper"`, description: "Open below the trigger, or align the selected item over it." },
        { name: "Select · disabled / invalid", type: "boolean", default: "false", description: "Disable the control / mark it invalid (destructive ring)." },
        { name: "Option · value / disabled / group", type: "string / boolean / string", default: "—", description: "Option value, per-option disable, and section label." }
      ],
      events: [{ name: "change", detail: "string", description: "Fires when an option is chosen; detail is its value." }],
      slots: [{ name: "(default)", description: "<shad-option> children (data-only: value, disabled, group)." }],
      extend: [
        `import { ShadSelect } from "@youneed/dom-ui-shad";`,
        ``,
        `const select = document.querySelector("shad-select");`,
        `select.value = "banana";                          // select programmatically`,
        `select.addEventListener("change", (e) => console.log(e.detail));`
      ].join("\n")
    }
  },
  tooltip: {
    title: "Tooltip",
    description: "A popup that displays information on hover or focus.",
    examples: [
      {
        render: () => html`
          <shad-tooltip text="Add to library">
            <shad-button variant="outline">Hover me</shad-button>
          </shad-tooltip>
        `
      }
    ]
  },
  "hover-card": {
    title: "Hover Card",
    description: "For sighted users to preview content available behind a link.",
    examples: [
      {
        name: "Basic",
        render: () => hoverCardDemo(),
        code: [
          `<shad-hover-card>`,
          `  <shad-button variant="link">@nextjs</shad-button>`,
          `  <div slot="content" class="flex w-64 flex-col gap-0.5">`,
          `    <div class="font-semibold">@nextjs</div>`,
          `    <div>The React Framework – created and maintained by @vercel.</div>`,
          `    <div class="mt-1 text-xs text-muted-foreground">Joined December 2021</div>`,
          `  </div>`,
          `</shad-hover-card>`
        ].join("\n")
      },
      {
        name: "Trigger Delays",
        render: () => hoverCardDemo({ openDelay: 10, closeDelay: 100, label: "Hover Here (fast)" }),
        code: `<shad-hover-card open-delay="10" close-delay="100"> … </shad-hover-card>`
      },
      {
        name: "Sides",
        render: () => html`<div class="flex flex-wrap gap-8">
          ${map(
          ["top", "right", "bottom", "left"],
          (side) => hoverCardDemo({ side, label: side })
        )}
        </div>`,
        code: `<shad-hover-card side="top | right | bottom | left"> … </shad-hover-card>`
      },
      { name: "RTL", render: () => html`<div dir="rtl">${hoverCardDemo()}</div>` }
    ],
    api: {
      props: [
        { name: "openDelay", type: "number", default: "700", description: `Ms before opening on hover (attribute "open-delay").` },
        { name: "closeDelay", type: "number", default: "300", description: `Ms before closing after the pointer leaves (attribute "close-delay").` },
        { name: "side", type: `"top" | "right" | "bottom" | "left"`, default: `"bottom"`, description: "Which side of the trigger the card opens on." },
        { name: "align", type: `"start" | "center" | "end"`, default: `"center"`, description: "Alignment along the chosen side." }
      ],
      slots: [
        { name: "(default)", description: "The trigger — hovering (or focusing) it opens the card." },
        { name: "content", description: "The card body shown in the popover." }
      ],
      extend: [
        `import { ShadHoverCard } from "@youneed/dom-ui-shad";`,
        ``,
        `// Hovering the trigger opens the card after open-delay ms; it stays`,
        `// open while the pointer is over the trigger OR the card.`,
        `class ProfileCard extends ShadHoverCard {`,
        `  openDelay = 100;`,
        `  side = "top";`,
        `}`
      ].join("\n")
    }
  },
  popover: {
    title: "Popover",
    description: "Displays rich content in a portal, triggered by a button.",
    examples: [
      {
        name: "Basic",
        render: () => html`<shad-popover width="w-80">
          <shad-button variant="outline">Open popover</shad-button>
          <div slot="content" class="grid gap-4">
            <div class="space-y-1.5">
              <h4 class="font-medium leading-none">Dimensions</h4>
              <p class="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
            </div>
            <div class="grid gap-2">
              ${map(
          [["Width", "100%"], ["Max. width", "300px"], ["Height", "25px"], ["Max. height", "none"]],
          ([label, val]) => html`<div class="grid grid-cols-3 items-center gap-4">
                  <shad-label>${label}</shad-label>
                  <shad-input class="col-span-2" value=${val}></shad-input>
                </div>`
        )}
            </div>
          </div>
        </shad-popover>`,
        code: [
          `<shad-popover width="w-80">`,
          `  <shad-button variant="outline">Open popover</shad-button>`,
          `  <div slot="content" class="grid gap-4"> … </div>`,
          `</shad-popover>`
        ].join("\n")
      },
      {
        name: "Align",
        render: () => html`<div class="flex gap-3">
          ${map(
          ["start", "center", "end"],
          (a) => html`<shad-popover align=${a}>
              <shad-button variant="outline" size="sm">${a}</shad-button>
              <div slot="content" class="text-sm">Aligned to <b>${a}</b>.</div>
            </shad-popover>`
        )}
        </div>`,
        code: `<shad-popover align="start | center | end"> … </shad-popover>`
      },
      {
        name: "With Form",
        render: () => html`<shad-popover width="w-80">
          <shad-button>Update profile</shad-button>
          <div slot="content" class="grid gap-3">
            <div class="flex flex-col gap-2">
              <shad-label for="pop-name">Name</shad-label>
              <shad-input id="pop-name" value="Pedro Duarte"></shad-input>
            </div>
            <div class="flex flex-col gap-2">
              <shad-label for="pop-user">Username</shad-label>
              <shad-input id="pop-user" value="@peduarte"></shad-input>
            </div>
            <shad-button
              size="sm"
              class="justify-self-end"
              @click=${(e) => e.currentTarget.closest("shad-popover").close()}
              >Save</shad-button
            >
          </div>
        </shad-popover>`
      },
      {
        name: "RTL",
        render: () => html`<div dir="rtl"><shad-popover align="start">
          <shad-button variant="outline">افتح</shad-button>
          <div slot="content" class="text-sm text-muted-foreground">محتوى منبثق بمحاذاة البداية.</div>
        </shad-popover></div>`
      }
    ],
    api: {
      props: [
        { name: "side", type: `"top" | "right" | "bottom" | "left"`, default: `"bottom"`, description: "Which side of the trigger the popover opens on." },
        { name: "align", type: `"start" | "center" | "end"`, default: `"center"`, description: "Alignment along the chosen side." },
        { name: "width", type: "string", default: `"w-72"`, description: "Tailwind width utility for the panel (e.g. w-80)." }
      ],
      slots: [
        { name: "(default)", description: "The trigger — clicking it toggles the popover." },
        { name: "content", description: "The panel body." }
      ],
      extend: [
        `import { ShadPopover } from "@youneed/dom-ui-shad";`,
        ``,
        `// .show() / outside-click + Escape close it.`,
        `const pop = document.querySelector("shad-popover");`,
        `pop.show();`
      ].join("\n")
    }
  },
  dialog: {
    title: "Dialog",
    description: "A window overlaid on the page, disabling the rest until dismissed.",
    examples: [
      { name: "Basic", render: () => dialogDemo() },
      {
        name: "Custom Close Button",
        render: () => dialogDemo({ closeButton: false, custom: true }),
        code: [
          `<shad-dialog close-button="false">`,
          `  <span slot="title">Edit profile</span>`,
          `  …`,
          `  <!-- slot="close" replaces the default X (top-right) -->`,
          `  <shad-button slot="close" variant="outline" size="sm">Close</shad-button>`,
          `</shad-dialog>`
        ].join("\n")
      },
      {
        name: "No Close Button",
        render: () => dialogDemo({ closeButton: false }),
        code: `<shad-dialog close-button="false"> … </shad-dialog>`
      },
      {
        name: "Sticky Footer",
        render: () => dialogDemo({ sticky: true, long: true }),
        code: `<shad-dialog sticky-footer="true"> … </shad-dialog>`
      },
      { name: "Scrollable Content", render: () => dialogDemo({ long: true }) },
      { name: "RTL", render: () => dialogDemo({ rtl: true }) }
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the dialog is shown; mirrored to the attribute." },
        { name: "closeButton", type: "boolean", default: "true", description: `Show the default top-right X (attribute "close-button").` },
        { name: "stickyFooter", type: "boolean", default: "false", description: `Footer gets a top border + muted bg bleeding to the edges (attribute "sticky-footer").` }
      ],
      events: [
        { name: "close", detail: "void", description: "Fires when the dialog closes (Escape, overlay click, or .close())." }
      ],
      slots: [
        { name: "title", description: "The dialog heading (rendered in the header)." },
        { name: "description", description: "Supporting text under the title." },
        { name: "(default)", description: "The body; scrolls when taller than the viewport." },
        { name: "footer", description: "Action buttons; right-aligned on ≥sm screens." },
        { name: "close", description: "Replaces the default close button (top-right). Falls back to the X." }
      ],
      extend: [
        `import { ShadDialog } from "@youneed/dom-ui-shad";`,
        ``,
        `const d = document.querySelector("shad-dialog");`,
        `d.show();                                  // or set the open attribute`,
        `d.addEventListener("close", () => …);`,
        ``,
        `// Subclass for a preset:`,
        `class ProfileDialog extends ShadDialog {`,
        `  stickyFooter = true;`,
        `}`
      ].join("\n")
    }
  },
  drawer: {
    title: "Drawer",
    description: "A panel that slides in from an edge of the screen.",
    examples: [
      { name: "Basic", render: () => drawerDemo() },
      { name: "Scrollable Content", render: () => drawerDemo({ long: true }) },
      {
        name: "Sides",
        render: () => html`<div class="flex flex-wrap gap-3">
          ${map(
          ["top", "right", "bottom", "left"],
          (dir) => html`<div class="inline-block">
              <shad-button
                variant="outline"
                @click=${(e) => e.currentTarget.parentElement.querySelector("shad-drawer").show()}
                >${dir}</shad-button
              >
              <shad-drawer direction=${dir}>
                <span slot="title">${dir[0].toUpperCase() + dir.slice(1)} Drawer</span>
                <span slot="description">This drawer slides in from the ${dir}.</span>
                <p class="text-sm text-muted-foreground">Put any content here.</p>
                <shad-button
                  slot="footer"
                  variant="outline"
                  @click=${(e) => e.currentTarget.closest("shad-drawer").close()}
                  >Close</shad-button
                >
              </shad-drawer>
            </div>`
        )}
        </div>`,
        code: `<shad-drawer direction="top | right | bottom | left"> … </shad-drawer>`
      },
      {
        name: "Responsive Dialog",
        render: () => drawerDemo({ responsive: true }),
        code: [
          `<!-- A centered dialog on ≥md screens, an edge drawer below. -->`,
          `<shad-drawer responsive="true"> … </shad-drawer>`
        ].join("\n")
      },
      { name: "RTL", render: () => drawerDemo({ direction: "right", rtl: true }) }
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the drawer is shown; mirrored to the attribute." },
        { name: "direction", type: `"bottom" | "top" | "left" | "right"`, default: `"bottom"`, description: "Which edge the drawer slides in from." },
        { name: "responsive", type: "boolean", default: "false", description: "Centered dialog on ≥md screens, edge drawer below." }
      ],
      events: [
        { name: "close", detail: "void", description: "Fires when the drawer closes (Escape, overlay click, or .close())." }
      ],
      slots: [
        { name: "title", description: "The drawer heading (centered for top/bottom)." },
        { name: "description", description: "Supporting text under the title." },
        { name: "(default)", description: "The body; scrolls when its content overflows." },
        { name: "footer", description: "Action buttons, stacked at the bottom." }
      ],
      extend: [
        `import { ShadDrawer } from "@youneed/dom-ui-shad";`,
        ``,
        `const d = document.querySelector("shad-drawer");`,
        `d.show();                              // or set the open attribute`,
        `d.addEventListener("close", () => …);`,
        ``,
        `class SideSheet extends ShadDrawer {`,
        `  direction = "right";`,
        `}`
      ].join("\n")
    }
  },
  "alert-dialog": {
    title: "Alert Dialog",
    description: "A modal dialog that interrupts the user with important content and expects a response.",
    examples: [
      { name: "Basic", render: () => alertDialogDemo({}) },
      { name: "Small", render: () => alertDialogDemo({ size: "sm" }) },
      { name: "Media", render: () => alertDialogDemo({ media: true }) },
      { name: "Small with Media", render: () => alertDialogDemo({ size: "sm", media: true }) },
      { name: "Destructive", render: () => alertDialogDemo({ destructive: true }) },
      { name: "RTL", render: () => alertDialogDemo({ rtl: true }) }
    ],
    api: {
      props: [
        { name: "open", type: "boolean", default: "false", description: "Whether the dialog is shown; mirrored to the attribute." },
        { name: "size", type: `"default" | "sm"`, default: `"default"`, description: "Dialog width — default (max-w-lg) or sm (max-w-sm)." }
      ],
      events: [
        { name: "close", detail: "void", description: "Fires when the dialog closes (Escape or a footer action calling .close())." }
      ],
      slots: [
        { name: "media", description: "Optional illustration shown on top; centers the dialog content when present." },
        { name: "title", description: "The dialog heading (announced via aria-labelledby)." },
        { name: "description", description: "Supporting text (announced via aria-describedby)." },
        { name: "footer", description: "Action buttons — typically Cancel + a confirm action." }
      ],
      extend: [
        `import { Component, html } from "@youneed/dom";`,
        `import { ShadAlertDialog } from "@youneed/dom-ui-shad";`,
        ``,
        `// A confirm dialog that resolves a promise on the chosen action.`,
        `@Component.define()`,
        `export class ConfirmDialog extends ShadAlertDialog {`,
        `  static tagName = "confirm-dialog";`,
        ``,
        `  #resolve?: (ok: boolean) => void;`,
        `  ask() { this.show(); return new Promise<boolean>((r) => (this.#resolve = r)); }`,
        `  answer(ok: boolean) { this.#resolve?.(ok); this.close(); }`,
        `}`
      ].join("\n")
    }
  },
  calendar: {
    title: "Calendar",
    description: "A date field component for selecting dates.",
    examples: [
      { name: "Basic", render: () => html`<shad-calendar value="2026-06-19"></shad-calendar>` },
      { name: "Range Calendar", render: () => html`<shad-calendar mode="range" start="2026-06-09" end="2026-06-16"></shad-calendar>` },
      { name: "Month and Year Selector", render: () => html`<shad-calendar dropdown value="2026-06-19"></shad-calendar>` },
      {
        name: "Booked Dates",
        render: () => html`<shad-calendar
          value="2026-06-19"
          .booked=${["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-24", "2026-06-25"]}
        ></shad-calendar>`,
        code: [
          `<shad-calendar value="2026-06-19"></shad-calendar>`,
          ``,
          `calendar.booked = [   // disabled / unavailable dates`,
          `  "2026-06-10", "2026-06-11", "2026-06-12",`,
          `  "2026-06-24", "2026-06-25",`,
          `];`
        ].join("\n")
      },
      { name: "Custom Cell Size", render: () => html`<shad-calendar cellsize="44" value="2026-06-19"></shad-calendar>` },
      { name: "Week Numbers", render: () => html`<shad-calendar weeknumbers value="2026-06-19"></shad-calendar>` },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-calendar value="2026-06-19"></shad-calendar></div>` }
    ],
    api: {
      props: [
        { name: "mode", type: `"single" | "range"`, default: `"single"`, description: "Select one date (value) or a date range (start/end)." },
        { name: "value", type: "string", default: `""`, description: "Selected ISO date (single mode), mirrored to the attribute." },
        { name: "start / end", type: "string", default: `""`, description: "Range endpoints (ISO) in range mode." },
        { name: "booked", type: "string[]", default: "[]", description: "ISO dates that are disabled / unavailable." },
        { name: "weeknumbers", type: "boolean", default: "false", description: "Show an ISO week-number column." },
        { name: "dropdown", type: "boolean", default: "false", description: "Render month/year as <select> jump menus." },
        { name: "cellsize", type: "number", default: "0", description: "Day-cell size in px (0 → default 2rem; sets the --cell var)." }
      ],
      events: [
        { name: "change", detail: "string | { start, end }", description: "Fires on selection; ISO string (single) or a range object." }
      ],
      extend: [
        `import { ShadCalendar } from "@youneed/dom-ui-shad";`,
        ``,
        `const cal = document.querySelector("shad-calendar");`,
        `cal.addEventListener("change", (e) => console.log(e.detail));`,
        `cal.booked = ["2026-06-10", "2026-06-11"];   // disable dates`
      ].join("\n")
    }
  },
  "date-picker": {
    title: "Date Picker",
    description: "A date picker built by composing a trigger with a <shad-calendar> in a popover.",
    examples: [
      { name: "Basic", render: () => html`<shad-date-picker></shad-date-picker>` },
      { name: "Range Picker", render: () => html`<shad-date-picker mode="range" placeholder="Pick a date range"></shad-date-picker>` },
      { name: "Date of Birth", render: () => html`<shad-date-picker dropdown placeholder="Select your birthday"></shad-date-picker>` },
      { name: "Input", render: () => html`<shad-date-picker variant="input" placeholder="June 23, 2026"></shad-date-picker>` },
      {
        name: "Time Picker",
        render: () => html`<div class="flex items-end gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="px-1 text-sm font-medium">Date</label>
            <shad-date-picker></shad-date-picker>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="px-1 text-sm font-medium">Time</label>
            <input type="time" value="10:30" class="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>`,
        code: [
          `<shad-date-picker></shad-date-picker>`,
          `<input type="time" value="10:30" />`
        ].join("\n")
      },
      {
        name: "Natural Language Picker",
        render: () => html`<shad-date-picker variant="input" natural></shad-date-picker>`,
        code: [
          `<shad-date-picker variant="input" natural></shad-date-picker>`,
          ``,
          `// Type "tomorrow", "next monday", "in 3 days", "2 days ago"…`,
          `// or any Date.parse-able string; it resolves + emits change.`
        ].join("\n")
      },
      { name: "RTL", render: () => html`<div dir="rtl"><shad-date-picker placeholder="اختر تاريخًا"></shad-date-picker></div>` }
    ],
    api: {
      props: [
        { name: "mode", type: `"single" | "range"`, default: `"single"`, description: "Pick one date (value) or a range (start/end)." },
        { name: "value", type: "string", default: `""`, description: "Selected ISO date in single mode (reflected)." },
        { name: "start / end", type: "string", default: `""`, description: "Range endpoints (ISO) in range mode." },
        { name: "placeholder", type: "string", default: `"Pick a date"`, description: "Trigger text shown when nothing is selected." },
        { name: "dropdown", type: "boolean", default: "false", description: "Calendar uses month/year <select> menus (good for birthdays)." },
        { name: "variant", type: `"button" | "input"`, default: `"button"`, description: "Trigger style: a button, or a text input with a calendar button." },
        { name: "natural", type: "boolean", default: "false", description: "Input variant: parse free text (today, tomorrow, next monday, in N days…)." }
      ],
      events: [
        { name: "change", detail: "string | { start, end }", description: "Fires on selection; ISO string (single) or a range object." }
      ],
      slots: [],
      extend: [
        `import { ShadDatePicker } from "@youneed/dom-ui-shad";`,
        ``,
        `const dp = document.querySelector("shad-date-picker");`,
        `dp.addEventListener("change", (e) => console.log(e.detail)); // ISO or {start,end}`,
        ``,
        `// Or compose it yourself: a trigger + <shad-calendar> in a popover.`,
        `class BirthdayPicker extends ShadDatePicker {`,
        `  dropdown = true;`,
        `  placeholder = "Select your birthday";`,
        `}`
      ].join("\n")
    }
  }
};
var NAV = [
  {
    group: "Components",
    items: Object.entries(DEMOS).map(([slug, d]) => ({ slug, title: d.title }))
  }
];

// examples/shad/docs-sidebar.ts
var _active_dec4, _a106, _DocsSidebar_decorators, _init106;
_DocsSidebar_decorators = [Component.define()];
var DocsSidebar = class extends (_a106 = Component("docs-sidebar"), _active_dec4 = [Component.prop({ attribute: true })], _a106) {
  constructor() {
    super(...arguments);
    __publicField(this, "active", __runInitializers(_init106, 8, this, "button")), __runInitializers(_init106, 11, this);
  }
  render() {
    return html`
      <nav class="text-sm">
        ${map(
      NAV,
      (g) => html`<div class="mb-5">
            <div class="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ${g.group}
            </div>
            ${map(
        g.items,
        (it) => html`<a
                href=${"/components/" + it.slug}
                class=${classMap({
          "block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground": true,
          "bg-accent font-medium text-accent-foreground": it.slug === this.active
        })}
                >${it.title}</a
              >`
      )}
          </div>`
    )}
      </nav>
    `;
  }
};
_init106 = __decoratorStart(_a106);
__decorateElement(_init106, 5, "active", _active_dec4, DocsSidebar);
DocsSidebar = __decorateElement(_init106, 0, "DocsSidebar", _DocsSidebar_decorators, DocsSidebar);
__publicField(DocsSidebar, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init106, 1, DocsSidebar);

// examples/shad/highlight.ts
var tokenStyles = css`
  code .tok-comment { color: #6e7781; font-style: italic; }
  code .tok-tag { color: #116329; }
  code .tok-attr { color: #0550ae; }
  code .tok-string { color: #0a3069; }
  code .tok-keyword { color: #cf222e; }
  code .tok-number { color: #0550ae; }
  code .tok-punct { color: hsl(var(--muted-foreground)); }
  :host-context(.dark) code .tok-comment { color: #8b949e; }
  :host-context(.dark) code .tok-tag { color: #7ee787; }
  :host-context(.dark) code .tok-attr { color: #79c0ff; }
  :host-context(.dark) code .tok-string { color: #a5d6ff; }
  :host-context(.dark) code .tok-keyword { color: #ff7b72; }
  :host-context(.dark) code .tok-number { color: #79c0ff; }
`;
var JS_KEYWORDS = new Set(
  "import export default from const let var function return if else for while class extends new await async type interface enum implements public private readonly static get set of in typeof instanceof void null undefined true false this".split(" ")
);
function tokenizeHtml(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    if (src[i] === "<") {
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i);
        const j2 = end === -1 ? n : end + 3;
        out.push({ type: "comment", value: src.slice(i, j2) });
        i = j2;
        continue;
      }
      const lead = src.startsWith("</", i) ? "</" : "<";
      out.push({ type: "punct", value: lead });
      i += lead.length;
      const name = /^[a-zA-Z][\w-]*/.exec(src.slice(i));
      if (name) {
        out.push({ type: "tag", value: name[0] });
        i += name[0].length;
      }
      while (i < n && src[i] !== ">") {
        const c = src[i];
        if (/\s/.test(c)) {
          let j2 = i;
          while (j2 < n && /\s/.test(src[j2])) j2++;
          out.push({ type: "", value: src.slice(i, j2) });
          i = j2;
        } else if (c === "/") {
          out.push({ type: "punct", value: "/" });
          i++;
        } else if (c === "=") {
          out.push({ type: "punct", value: "=" });
          i++;
        } else if (c === '"' || c === "'") {
          let j2 = i + 1;
          while (j2 < n && src[j2] !== c) j2++;
          j2 = Math.min(j2 + 1, n);
          out.push({ type: "string", value: src.slice(i, j2) });
          i = j2;
        } else {
          const attr = /^[^\s=>/"']+/.exec(src.slice(i));
          if (attr) {
            out.push({ type: "attr", value: attr[0] });
            i += attr[0].length;
          } else {
            out.push({ type: "", value: c });
            i++;
          }
        }
      }
      if (i < n && src[i] === ">") {
        out.push({ type: "punct", value: ">" });
        i++;
      }
      continue;
    }
    let j = src.indexOf("<", i);
    if (j === -1) j = n;
    out.push({ type: "", value: src.slice(i, j) });
    i = j;
  }
  return out;
}
function tokenizeJs(src) {
  const out = [];
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\w.]*)|([A-Za-z_$][\w$]*)|([{}()[\].,;:=<>+\-*/%!&|?]+)|(\s+)/g;
  let m;
  let last = 0;
  while (m = re.exec(src)) {
    if (m.index > last) out.push({ type: "", value: src.slice(last, m.index) });
    if (m[1]) out.push({ type: "comment", value: m[0] });
    else if (m[2]) out.push({ type: "string", value: m[0] });
    else if (m[3]) out.push({ type: "number", value: m[0] });
    else if (m[4]) out.push({ type: JS_KEYWORDS.has(m[0]) ? "keyword" : "", value: m[0] });
    else if (m[5]) out.push({ type: "punct", value: m[0] });
    else out.push({ type: "", value: m[0] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ type: "", value: src.slice(last) });
  return out;
}
function highlight(code) {
  const tokens = /^\s*</.test(code) ? tokenizeHtml(code) : tokenizeJs(code);
  return tokens.map(
    (tk) => tk.type ? html`<span class=${"tok-" + tk.type}>${tk.value}</span>` : html`${tk.value}`
  );
}

// examples/shad/docs-view.ts
function formatMarkup(raw) {
  const lines = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/\r/g, "").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length === 0) return "";
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length)
  );
  return lines.map((l) => l.slice(indent)).join("\n").trim();
}
var _code_dec, _name_dec, _a107, _DocsView_decorators, _init107, _DocsView_instances, copy_fn;
_DocsView_decorators = [Component.define()];
var DocsView = class extends (_a107 = Component("docs-view"), _name_dec = [Component.prop({ attribute: true })], _code_dec = [Component.prop()], _a107) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _DocsView_instances);
    __publicField(this, "name", __runInitializers(_init107, 8, this, "")), __runInitializers(_init107, 11, this);
    __publicField(this, "code", __runInitializers(_init107, 12, this, "")), __runInitializers(_init107, 15, this);
    __publicField(this, "expanded", this.signal(false));
    __publicField(this, "copied", this.signal(false));
  }
  render() {
    const code = this.code || formatMarkup(this.innerHTML);
    const collapsible = code.split("\n").length > 4;
    const collapsed = collapsible && !this.expanded();
    return html`
      ${when(
      this.name,
      () => html`<h3 class="mb-2 text-sm font-medium text-muted-foreground">${this.name}</h3>`
    )}
      <div class="frame group rounded-xl border">
        <div class=${"preview flex min-h-[280px] items-center justify-center p-10 " + (code ? "rounded-t-xl" : "rounded-xl")}>
          <slot></slot>
        </div>
        ${when(
      code,
      () => html`
            <div class="divider relative overflow-hidden rounded-b-xl border-t bg-muted">
              <button
                class="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                title="Copy code"
                aria-label="Copy code"
                @click=${() => __privateMethod(this, _DocsView_instances, copy_fn).call(this, code)}
              >
                ${this.copied() ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6 9 17l-5-5"></path></svg>` : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`}
              </button>
              <pre
                class=${"overflow-auto p-4 text-sm leading-relaxed " + (collapsed ? "max-h-[104px]" : "")}
              ><code>${highlight(code)}</code></pre>
              ${when(
        collapsible,
        () => html`<div
                  class=${collapsed ? "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3 pt-10" : "divider flex justify-center border-t p-2"}
                  style=${collapsed ? "background:linear-gradient(to top, hsl(var(--muted)) 35%, transparent)" : ""}
                >
                  <button
                    class="pointer-events-auto rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    @click=${() => this.expanded.update((v) => !v)}
                  >
                    ${this.expanded() ? "Hide Code" : "View Code"}
                  </button>
                </div>`
      )}
            </div>
          `
    )}
      </div>
    `;
  }
};
_init107 = __decoratorStart(_a107);
_DocsView_instances = new WeakSet();
// Copy the example source to the clipboard, with a brief "copied" state.
copy_fn = function(text) {
  void navigator.clipboard?.writeText(text);
  this.copied.set(true);
  setTimeout(() => {
    if (!this.abortSignal.aborted) this.copied.set(false);
  }, 1400);
};
__decorateElement(_init107, 5, "name", _name_dec, DocsView);
__decorateElement(_init107, 5, "code", _code_dec, DocsView);
DocsView = __decorateElement(_init107, 0, "DocsView", _DocsView_decorators, DocsView);
__publicField(DocsView, "styles", [
  tw,
  css`
      :host { display: block; --line: hsl(var(--border)); }
      /* In dark mode the default border is nearly invisible against the
         near-black page, so the "view" doesn't read as a separate surface.
         Brighten the frame/divider lines and lift the preview onto its own
         slightly-elevated background. */
      :host-context(.dark) { --line: hsl(240 5% 24%); }
      :host-context(.dark) .preview { background-color: hsl(240 6% 10%); }
      .frame { border-color: var(--line); }
      .divider { border-color: var(--line); }
      /* Faint dotted backdrop on the preview, like shadcn. */
      .preview {
        background-image: radial-gradient(hsl(var(--border)) 1px, transparent 1px);
        background-size: 16px 16px;
      }
    `,
  tokenStyles
]);
__runInitializers(_init107, 1, DocsView);

// examples/shad/docs-page.ts
var _slug_dec, _a108, _DocsPage_decorators, _init108, _DocsPage_instances, renderApi_fn, table_fn, twoCol_fn;
_DocsPage_decorators = [Component.define()];
var DocsPage = class extends (_a108 = Component("docs-page"), _slug_dec = [Component.prop({ attribute: true })], _a108) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _DocsPage_instances);
    __publicField(this, "slug", __runInitializers(_init108, 8, this, "button")), __runInitializers(_init108, 11, this);
  }
  render() {
    const demo = DEMOS[this.slug];
    if (!demo) {
      return html`<div class="text-muted-foreground">Unknown component: ${this.slug}</div>`;
    }
    return html`
      <article class="mx-auto max-w-3xl">
        <h1 class="text-3xl font-bold tracking-tight text-foreground">${demo.title}</h1>
        <p class="mt-2 text-lg text-muted-foreground">${demo.description}</p>
        <div class="mt-6 flex flex-col gap-6">
          ${map(
      demo.examples,
      (ex) => html`<docs-view
              id=${ex.name ? slugify(ex.name) : ""}
              name=${ex.name ?? ""}
              .code=${ex.code ?? ""}
            >${ex.render()}</docs-view>`
    )}
        </div>
        <p class="mt-4 text-sm text-muted-foreground">
          Add it: <code class="rounded bg-muted px-1.5 py-0.5">npx shad add ${this.slug}</code>
        </p>
        ${when(demo.api, () => __privateMethod(this, _DocsPage_instances, renderApi_fn).call(this, demo.api))}
      </article>
    `;
  }
};
_init108 = __decoratorStart(_a108);
_DocsPage_instances = new WeakSet();
renderApi_fn = function(api) {
  return html`
      ${when(
    api.props?.length || api.slots?.length || api.events?.length,
    () => html`
          <section id="api-reference" class="mt-12">
            <h2 class="text-xl font-semibold tracking-tight text-foreground">API Reference</h2>
            ${when(api.props?.length, () => __privateMethod(this, _DocsPage_instances, table_fn).call(this, "Props", ["Prop", "Type", "Default"], api.props))}
            ${when(
      api.events?.length,
      () => html`
                <h3 class="mt-6 mb-2 text-sm font-medium text-muted-foreground">Events</h3>
                ${__privateMethod(this, _DocsPage_instances, twoCol_fn).call(this, "Event", "Detail", "Description", api.events.map((e) => [e.name, e.detail, e.description]))}
              `
    )}
            ${when(
      api.slots?.length,
      () => html`
                <h3 class="mt-6 mb-2 text-sm font-medium text-muted-foreground">Slots</h3>
                ${__privateMethod(this, _DocsPage_instances, twoCol_fn).call(this, "Slot", null, "Description", api.slots.map((s) => [s.name, null, s.description]))}
              `
    )}
          </section>
        `
  )}
      ${when(
    api.extend,
    () => html`
          <section id="extending" class="mt-12">
            <h2 class="text-xl font-semibold tracking-tight text-foreground">Extending</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              Build on the base component with class inheritance — override
              <code class="rounded bg-muted px-1 py-0.5 text-xs">render()</code> and add your own
              <code class="rounded bg-muted px-1 py-0.5 text-xs">@Component.prop</code>s.
            </p>
            <div class="mt-4 overflow-hidden rounded-lg border border-border bg-muted">
              <pre class="overflow-auto p-4 text-sm leading-relaxed"><code>${highlight(api.extend)}</code></pre>
            </div>
          </section>
        `
  )}
    `;
};
// A props reference table (the prop name + a description column at the end).
table_fn = function(_title, cols, props) {
  return html`
      <h3 class="mt-4 mb-2 text-sm font-medium text-muted-foreground">Props</h3>
      <div class="overflow-hidden rounded-lg border border-border">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-muted">
              ${map(cols, (c) => html`<th class="p-3 font-medium">${c}</th>`)}
              <th class="p-3 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            ${map(
    props,
    (p) => html`<tr class="border-b border-border align-top last:border-0">
                <td class="whitespace-nowrap p-3 font-mono text-xs text-foreground">${p.name}</td>
                <td class="p-3 font-mono text-xs text-muted-foreground">${p.type}</td>
                <td class="whitespace-nowrap p-3 font-mono text-xs text-muted-foreground">${p.default ?? "—"}</td>
                <td class="p-3 text-muted-foreground">${p.description}</td>
              </tr>`
  )}
          </tbody>
        </table>
      </div>
    `;
};
// A simple table for Events (3 cols) / Slots (2 cols — pass `c2 = null`).
twoCol_fn = function(c1, c2, c3, rows) {
  return html`
      <div class="overflow-hidden rounded-lg border border-border">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-muted">
              <th class="p-3 font-medium">${c1}</th>
              ${when(c2, () => html`<th class="p-3 font-medium">${c2}</th>`)}
              <th class="p-3 font-medium">${c3}</th>
            </tr>
          </thead>
          <tbody>
            ${map(
    rows,
    (r) => html`<tr class="border-b border-border align-top last:border-0">
                <td class="whitespace-nowrap p-3 font-mono text-xs text-foreground">${r[0]}</td>
                ${when(c2, () => html`<td class="p-3 font-mono text-xs text-muted-foreground">${r[1]}</td>`)}
                <td class="p-3 text-muted-foreground">${r[2]}</td>
              </tr>`
  )}
          </tbody>
        </table>
      </div>
    `;
};
__decorateElement(_init108, 5, "slug", _slug_dec, DocsPage);
DocsPage = __decorateElement(_init108, 0, "DocsPage", _DocsPage_decorators, DocsPage);
// `scroll-mt` keeps "On this page" anchors clear of the sticky header.
__publicField(DocsPage, "styles", [
  tw,
  css`
      :host { display: block; }
      [id] { scroll-margin-top: 80px; }
    `,
  tokenStyles
]);
__runInitializers(_init108, 1, DocsPage);

// examples/shad/docs-toc.ts
var _items_dec6, _a109, _DocsToc_decorators, _init109;
_DocsToc_decorators = [Component.define()];
var DocsToc = class extends (_a109 = Component("docs-toc"), _items_dec6 = [Component.prop()], _a109) {
  constructor() {
    super(...arguments);
    __publicField(this, "items", __runInitializers(_init109, 8, this, [])), __runInitializers(_init109, 11, this);
  }
  render() {
    if (!this.items.length) return html``;
    return html`
      <div class="text-sm">
        <div class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </div>
        ${map(
      this.items,
      (it) => html`<a
            href=${"#" + it.id}
            class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            @click=${(e) => {
        e.preventDefault();
        this.emit("select", it.id);
      }}
            >${it.label}</a
          >`
    )}
      </div>
    `;
  }
};
_init109 = __decoratorStart(_a109);
__decorateElement(_init109, 5, "items", _items_dec6, DocsToc);
DocsToc = __decorateElement(_init109, 0, "DocsToc", _DocsToc_decorators, DocsToc);
__publicField(DocsToc, "styles", [tw, css`:host { display: block }`]);
__runInitializers(_init109, 1, DocsToc);

// examples/shad/docs-app.ts
var _slug_dec2, _a110, _DocsApp_decorators, _init110, _DocsApp_instances, toc_fn, scrollTo_fn;
_DocsApp_decorators = [Component.define()];
var DocsApp = class extends (_a110 = Component("docs-app"), _slug_dec2 = [Component.prop({ attribute: true, reflect: true })], _a110) {
  constructor() {
    super(...arguments);
    __privateAdd(this, _DocsApp_instances);
    __publicField(this, "slug", __runInitializers(_init110, 8, this, "button")), __runInitializers(_init110, 11, this);
  }
  onMount() {
    if (typeof window === "undefined") return;
    document.addEventListener(
      "click",
      (e) => {
        const me = e;
        if (me.metaKey || me.ctrlKey || me.shiftKey || me.button !== 0) return;
        const a = e.composedPath().find((n) => n?.tagName === "A");
        const href = a?.getAttribute("href");
        if (!href || !href.startsWith("/components/")) return;
        e.preventDefault();
        history.pushState({}, "", href);
        this.slug = href.slice("/components/".length);
      },
      { signal: this.abortSignal }
    );
    window.addEventListener(
      "popstate",
      () => this.slug = location.pathname.replace(/^\/components\//, "") || "button",
      { signal: this.abortSignal }
    );
  }
  render() {
    const toc = __privateMethod(this, _DocsApp_instances, toc_fn).call(this);
    return html`
      <header>
        <div class="brand">youneed<span>/shad</span></div>
        <shad-button
          variant="outline"
          size="sm"
          @click=${() => document.documentElement.classList.toggle("dark")}
          >🌓 Theme</shad-button
        >
      </header>
      <div class="layout">
        <aside class="nav"><docs-sidebar active=${this.slug}></docs-sidebar></aside>
        <main><docs-page slug=${this.slug}></docs-page></main>
        ${when(
      toc.length,
      () => html`<aside class="toc">
            <docs-toc
              .items=${toc}
              @select=${(e) => __privateMethod(this, _DocsApp_instances, scrollTo_fn).call(this, e.detail)}
            ></docs-toc>
          </aside>`
    )}
      </div>
    `;
  }
};
_init110 = __decoratorStart(_a110);
_DocsApp_instances = new WeakSet();
// "On this page" entries for the current component: named examples + the
// API/Extending sections when present. Ids match docs-page's anchor ids.
toc_fn = function() {
  const demo = DEMOS[this.slug];
  if (!demo) return [];
  const items = demo.examples.filter((e) => e.name).map((e) => ({ label: e.name, id: slugify(e.name) }));
  if (demo.api?.props?.length || demo.api?.slots?.length || demo.api?.events?.length)
    items.push({ label: "API Reference", id: "api-reference" });
  if (demo.api?.extend) items.push({ label: "Extending", id: "extending" });
  return items;
};
// The anchor target lives inside docs-page's shadow root, so a native #hash
// can't reach it — scroll it into view by hand.
scrollTo_fn = function(id) {
  const page = this.shadowRoot?.querySelector("docs-page");
  const target = page?.shadowRoot?.getElementById(id);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
};
__decorateElement(_init110, 5, "slug", _slug_dec2, DocsApp);
DocsApp = __decorateElement(_init110, 0, "DocsApp", _DocsApp_decorators, DocsApp);
__publicField(DocsApp, "styles", [
  tw,
  css`
      :host { display: block; }
      header {
        position: sticky; top: 0; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        height: 56px; padding: 0 20px;
        border-bottom: 1px solid hsl(var(--border));
        background: hsl(var(--background));
      }
      .brand { font-weight: 700; }
      .brand span { color: hsl(var(--muted-foreground)); font-weight: 400; }
      .layout { display: flex; align-items: flex-start; max-width: 1400px; margin: 0 auto; }
      aside.nav {
        position: sticky; top: 56px; flex: 0 0 240px; height: calc(100vh - 56px);
        overflow-y: auto; padding: 24px 12px;
        border-right: 1px solid hsl(var(--border));
      }
      aside.toc {
        position: sticky; top: 56px; flex: 0 0 200px; height: calc(100vh - 56px);
        overflow-y: auto; padding: 32px 16px;
      }
      main { flex: 1; min-width: 0; padding: 40px 32px; }
      @media (max-width: 1024px) { aside.toc { display: none; } }
    `
]);
__runInitializers(_init110, 1, DocsApp);

// examples/shad/client.ts
registerTailwind(tailwind_gen_default);
mountDevtoolsPanel();
