var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
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
function getDefaultScheduler() {
  return defaultScheduler;
}
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
var defaultScheduler, syncScheduler, rafScheduler;
var init_scheduler = __esm({
  "packages/dom-scheduler/src/scheduler.ts"() {
    "use strict";
    defaultScheduler = createScheduler();
    syncScheduler = {
      name: "sync",
      request: (host) => host.flush(),
      flushSync: () => {
      }
    };
    rafScheduler = createFpsScheduler();
  }
});

// packages/dom-scheduler/src/index.ts
var init_src = __esm({
  "packages/dom-scheduler/src/index.ts"() {
    "use strict";
    init_scheduler();
  }
});

// packages/core/src/types.ts
var init_types = __esm({
  "packages/core/src/types.ts"() {
    "use strict";
  }
});

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
var init_registry = __esm({
  "packages/core/src/registry.ts"() {
    "use strict";
  }
});

// packages/core/src/dispose.ts
var init_dispose = __esm({
  "packages/core/src/dispose.ts"() {
    "use strict";
  }
});

// packages/core/src/index.ts
var init_src2 = __esm({
  "packages/core/src/index.ts"() {
    "use strict";
    init_types();
    init_registry();
    init_dispose();
  }
});

// packages/dom/src/task.ts
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
var TASK_BRAND;
var init_task = __esm({
  "packages/dom/src/task.ts"() {
    "use strict";
    TASK_BRAND = /* @__PURE__ */ Symbol("youneed.task");
  }
});

// packages/dom/src/template.ts
function html(strings, ...values) {
  return { strings, values };
}
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
var templateCache, isSpace, isNameChar, HOLE_RE, currentHost, NodePart, AttrPart, AttrAssembler, AttrSlotPart, EventPart, externalProps, PropertyPart, ElementPart, isLazyStyle, stylesCache, lazyStyleCache;
var init_template = __esm({
  "packages/dom/src/template.ts"() {
    "use strict";
    init_src2();
    init_task();
    templateCache = /* @__PURE__ */ new WeakMap();
    isSpace = (ch) => ch === " " || ch === "	" || ch === "\n" || ch === "\r" || ch === "\f";
    isNameChar = (ch) => ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch >= "0" && ch <= "9" || ch === "_" || ch === "-" || ch === ":" || ch === "." || ch === "@";
    HOLE_RE = /dh:(\d+)/g;
    NodePart = class _NodePart {
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
    AttrPart = class {
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
    AttrAssembler = class {
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
    AttrSlotPart = class {
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
    EventPart = class {
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
    externalProps = /* @__PURE__ */ new WeakMap();
    PropertyPart = class {
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
    ElementPart = class {
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
    isLazyStyle = (s) => typeof s === "function";
    stylesCache = /* @__PURE__ */ new WeakMap();
    lazyStyleCache = /* @__PURE__ */ new WeakMap();
  }
});

// packages/dom/src/signals.ts
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
var activeSubscriber, batchDepth, batchQueue;
var init_signals = __esm({
  "packages/dom/src/signals.ts"() {
    "use strict";
    batchDepth = 0;
    batchQueue = /* @__PURE__ */ new Set();
  }
});

// packages/dom/src/decorators.ts
function registerProp(ctor, name) {
  reactiveProps.for(ctor).add(name);
}
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
function attrPropMap(target) {
  return target?.[Symbol.metadata]?.[ATTR_META];
}
function reflectPropMap(target) {
  return target?.[Symbol.metadata]?.[REFLECT_META];
}
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
function scheduleDefine(value, when2) {
  pendingDefines.add(value);
  if (when2 === "server" || typeof window === "undefined") return;
  const run = () => {
    pendingDefines.delete(value);
    defineImmediate(value);
  };
  if (typeof when2 === "number") setTimeout(run, when2);
  else if (typeof when2 === "function") void Promise.resolve(when2()).then(run);
  else if (when2 === "idle")
    (window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1)))(
      run
    );
  else if (when2 === "load")
    document.readyState === "complete" ? run() : window.addEventListener("load", run, { once: true });
  else if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run, { once: true });
}
function defineDecorator(when2) {
  return function(value, ctx) {
    if (ctx.metadata && !Object.prototype.hasOwnProperty.call(value, Symbol.metadata)) {
      Object.defineProperty(value, Symbol.metadata, {
        value: ctx.metadata,
        configurable: true,
        writable: true
      });
    }
    if (when2 === void 0) return defineImmediate(value);
    scheduleDefine(value, when2);
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
var reactiveProps, reactivePropsCache, exposedEvents, ATTR_META, REFLECT_META, watchRegistry, compiledRenderCtors, compiledRenderCache, pendingDefines;
var init_decorators = __esm({
  "packages/dom/src/decorators.ts"() {
    "use strict";
    init_src2();
    reactiveProps = createRegistry(() => /* @__PURE__ */ new Set());
    reactivePropsCache = /* @__PURE__ */ new WeakMap();
    exposedEvents = createRegistry(() => /* @__PURE__ */ new Set());
    Symbol.dispose ??= /* @__PURE__ */ Symbol("Symbol.dispose");
    Symbol.metadata ??= /* @__PURE__ */ Symbol("Symbol.metadata");
    ATTR_META = "__attrProps__";
    REFLECT_META = "__reflectProps__";
    watchRegistry = createRegistry(() => /* @__PURE__ */ new Map());
    compiledRenderCtors = /* @__PURE__ */ new WeakSet();
    compiledRenderCache = /* @__PURE__ */ new WeakMap();
    pendingDefines = /* @__PURE__ */ new Set();
  }
});

// packages/dom/src/component.ts
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
    #devtools(kind, emit) {
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
        emit,
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
var instanceCounter, devtoolsIds, hydrationData, errorHandler, anonTagSeq;
var init_component = __esm({
  "packages/dom/src/component.ts"() {
    "use strict";
    init_src();
    init_template();
    init_signals();
    init_task();
    init_decorators();
    instanceCounter = 0;
    devtoolsIds = /* @__PURE__ */ new WeakMap();
    hydrationData = /* @__PURE__ */ new WeakMap();
    errorHandler = (error, info) => {
      console.error(`[${info.tag}] uncaught error during ${info.phase}:`, error);
    };
    anonTagSeq = 0;
    Component.prop = propDecorator;
    Component.event = eventDecorator;
    Component.watch = watchDecorator;
    Component.define = defineDecorator;
    Component.compile = compileDecorator;
    Component.computed = computedDecorator;
  }
});

// packages/dom/src/dom.ts
var init_dom = __esm({
  "packages/dom/src/dom.ts"() {
    "use strict";
    init_src();
    init_template();
    init_decorators();
    init_component();
  }
});

// packages/dom/src/index.ts
var init_src3 = __esm({
  "packages/dom/src/index.ts"() {
    "use strict";
    init_dom();
  }
});

// examples/pages/components.ts
var components_exports = {};
__export(components_exports, {
  AboutApp: () => AboutApp,
  BlogApp: () => BlogApp,
  ErrorApp: () => ErrorApp,
  HomeApp: () => HomeApp,
  NotFoundApp: () => NotFoundApp
});
var _HomeApp_decorators, _init, _a, HomeApp, _AboutApp_decorators, _init2, _a2, AboutApp, _BlogApp_decorators, _init3, _a3, BlogApp, _NotFoundApp_decorators, _init4, _a4, NotFoundApp, _ErrorApp_decorators, _init5, _a5, ErrorApp;
var init_components = __esm({
  "examples/pages/components.ts"() {
    "use strict";
    init_src3();
    _HomeApp_decorators = [Component.define()];
    HomeApp = class extends (_a = Component("home-app")) {
      static styles = css`
    a {
      font: 600 18px system-ui, sans-serif;
    }
  `;
      render() {
        return html`<main>
      <h1>Home</h1>
      <nav><a href="/about">About →</a> · <a href="/blog">Blog</a></nav>
    </main>`;
      }
    };
    _init = __decoratorStart(_a);
    HomeApp = __decorateElement(_init, 0, "HomeApp", _HomeApp_decorators, HomeApp);
    __runInitializers(_init, 1, HomeApp);
    _AboutApp_decorators = [Component.define()];
    AboutApp = class extends (_a2 = Component("about-app")) {
      render() {
        return html`<main><h1>About</h1><a href="/">← Home</a></main>`;
      }
    };
    _init2 = __decoratorStart(_a2);
    AboutApp = __decorateElement(_init2, 0, "AboutApp", _AboutApp_decorators, AboutApp);
    __runInitializers(_init2, 1, AboutApp);
    _BlogApp_decorators = [Component.define()];
    BlogApp = class extends (_a3 = Component("blog-app")) {
      render() {
        return html`<main>
      <h1>Blog</h1>
      <ul>
        <li>Launching youneed SSR</li>
        <li>Streaming with renderToStream</li>
      </ul>
      <a href="/">← Home</a>
    </main>`;
      }
    };
    _init3 = __decoratorStart(_a3);
    BlogApp = __decorateElement(_init3, 0, "BlogApp", _BlogApp_decorators, BlogApp);
    __runInitializers(_init3, 1, BlogApp);
    _NotFoundApp_decorators = [Component.define()];
    NotFoundApp = class extends (_a4 = Component("not-found-app")) {
      render() {
        return html`<main><h1>404 — Not Found</h1><a href="/">← Home</a></main>`;
      }
    };
    _init4 = __decoratorStart(_a4);
    NotFoundApp = __decorateElement(_init4, 0, "NotFoundApp", _NotFoundApp_decorators, NotFoundApp);
    __runInitializers(_init4, 1, NotFoundApp);
    _ErrorApp_decorators = [Component.define()];
    ErrorApp = class extends (_a5 = Component("error-app")) {
      render() {
        return html`<main><h1>500 — Something broke</h1><a href="/">← Home</a></main>`;
      }
    };
    _init5 = __decoratorStart(_a5);
    ErrorApp = __decorateElement(_init5, 0, "ErrorApp", _ErrorApp_decorators, ErrorApp);
    __runInitializers(_init5, 1, ErrorApp);
  }
});

// packages/devtools/src/core.ts
init_src3();
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
init_src3();
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
  var _ctx_dec, _a6, _b, _init6, _search, _collapsed, _frozen, _cleanup, _ComponentTreeViewImpl_instances, hl_fn, orderedEvents_fn, toggle_fn, rowOf_fn, detail_fn;
  return _b = class extends (_a6 = Component("dt-component-tree"), _ctx_dec = [Component.prop()], _a6) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _ComponentTreeViewImpl_instances);
      __publicField(this, "ctx", __runInitializers(_init6, 8, this)), __runInitializers(_init6, 11, this);
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
  }, _init6 = __decoratorStart(_a6), _search = new WeakMap(), _collapsed = new WeakMap(), _frozen = new WeakMap(), _cleanup = new WeakMap(), _ComponentTreeViewImpl_instances = new WeakSet(), /** Highlight `rec` on the page — gated by this plugin's "highlight" toggle. */
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
  }, toggle_fn = function(id) {
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
        __privateMethod(this, _ComponentTreeViewImpl_instances, toggle_fn).call(this, rec.id);
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
  }, __decorateElement(_init6, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init6, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`${TREE_CSS}`), _b;
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
init_src3();
var TimeTravelView;
function defineTimeTravelView() {
  var _ctx_dec, _a6, _b, _init6, _snap, _highlight, _cleanup, _TimeTravelViewImpl_instances, paintHighlight_fn, toggleHighlight_fn, apply_fn, goTo_fn;
  return _b = class extends (_a6 = Component("dt-time-travel"), _ctx_dec = [Component.prop()], _a6) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _TimeTravelViewImpl_instances);
      __publicField(this, "ctx", __runInitializers(_init6, 8, this)), __runInitializers(_init6, 11, this);
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
  }, _init6 = __decoratorStart(_a6), _snap = new WeakMap(), _highlight = new WeakMap(), _cleanup = new WeakMap(), _TimeTravelViewImpl_instances = new WeakSet(), /** Draw (or clear) the on-page overlay for the current selection. */
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
  }, apply_fn = function(rec, snap) {
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
    if (elementLive) __privateMethod(this, _TimeTravelViewImpl_instances, apply_fn).call(this, rec, rec.history[clamped]);
    this.requestUpdate();
    __privateMethod(this, _TimeTravelViewImpl_instances, paintHighlight_fn).call(this);
  }, __decorateElement(_init6, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init6, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`
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
init_src3();
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
  var _ctx_dec, _a6, _b, _init6, _highlight, _cleanup, _editing, _editingSel, _StylesViewImpl_instances, paintHighlight_fn, toggleHighlight_fn, isEditing_fn, startEdit_fn, commitEdit_fn, commitRename_fn, startSelEdit_fn, commitSelector_fn, addRule_fn, addDecl_fn, rule_fn;
  return _b = class extends (_a6 = Component("dt-styles"), _ctx_dec = [Component.prop()], _a6) {
    constructor() {
      super(...arguments);
      __privateAdd(this, _StylesViewImpl_instances);
      __publicField(this, "ctx", __runInitializers(_init6, 8, this)), __runInitializers(_init6, 11, this);
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
  }, _init6 = __decoratorStart(_a6), _highlight = new WeakMap(), _cleanup = new WeakMap(), _editing = new WeakMap(), _editingSel = new WeakMap(), _StylesViewImpl_instances = new WeakSet(), /** Draw (or clear) the on-page overlay for the current selection. */
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
  }, __decorateElement(_init6, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init6, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`
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
  function highlight(rec) {
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
    highlight,
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

// packages/devtools/src/page-devtools.ts
init_src3();
var DEVTOOLS_MARKER = "data-page-devtools";
function readPayload() {
  const node = document.querySelector(`script[${DEVTOOLS_MARKER}]`);
  if (!node?.textContent) return void 0;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return void 0;
  }
}
var PAGE_CSS = `
  :host { display: block; padding: 6px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .section { margin: 8px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  .kv { display: flex; gap: 6px; padding: 1px 0; }
  .kv .k { color: #fbbf24; }
  .kv .v { color: #d4d4d8; word-break: break-all; }
  .muted { color: #71717a; }
  pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; color: #d4d4d8; }
  a.route { display: block; padding: 2px 0; text-decoration: none; color: #93c5fd; }
  a.route.current { color: #4ade80; font-weight: 700; }
  .legend { display: flex; gap: 12px; margin: 2px 0 6px; font-size: 11px; color: #a1a1aa; }
  .leg { display: inline-flex; align-items: center; gap: 5px; }
  .sw { width: 14px; height: 0; display: inline-block; }
  .graph svg { max-height: 340px; display: block; }
`;
var PageView;
function definePageView() {
  return class PageViewImpl extends Component("dt-page") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    render() {
      const payload = readPayload();
      if (!payload) return html`<div class="muted">no page payload — enablePageDevtools() on the server?</div>`;
      const p = payload.page;
      return html`
        <div class="section">page</div>
        <div class="kv"><span class="k">url</span><span class="v">${p.url}</span></div>
        ${p.title ? html`<div class="kv"><span class="k">title</span><span class="v">${p.title}</span></div>` : html``}
        ${p.lang ? html`<div class="kv"><span class="k">lang</span><span class="v">${p.lang}</span></div>` : html``}
        ${p.clientScript ? html`<div class="kv"><span class="k">clientScript</span><span class="v">${p.clientScript}</span></div>` : html``}
        <div class="section">speculation rules</div>
        ${p.speculation ? html`<pre>${JSON.stringify(p.speculation, null, 2)}</pre>` : html`<div class="muted">none for this page</div>`}
      `;
    }
  };
}
var RoutesView;
function defineRoutesView() {
  return class RoutesViewImpl extends Component("dt-routes") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    render() {
      const routes = readPayload()?.routes ?? [];
      const here = globalThis.location?.pathname ?? "";
      return html`
        <div class="section">routes (${routes.length})</div>
        ${routes.length === 0 ? html`<div class="muted">no routes in payload</div>` : routes.map((r) => {
        const current = r.url === here;
        const text = (current ? "→ " : "") + (r.title ? `${r.url}  ·  ${r.title}` : r.url);
        return html`<a class=${current ? "route current" : "route"} href=${r.url} target="_blank" rel="noopener">${text}</a>`;
      })}
      `;
    }
  };
}
var SVGNS = "http://www.w3.org/2000/svg";
var EDGE_COLOR = { prerender: "#4ade80", prefetch: "#7dd3fc" };
var shortLabel = (url) => url.length > 14 ? url.slice(0, 13) + "…" : url;
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
function drawGraph(host, routes, here) {
  const W = 320;
  const cx = W / 2;
  const cy = W / 2;
  const R = routes.length <= 1 ? 0 : 116;
  const nodeR = 22;
  const at = (i) => {
    if (routes.length === 1) return [cx, cy];
    const a = i / routes.length * 2 * Math.PI - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const index = new Map(routes.map((r, i) => [r.url, i]));
  const root = svgEl("svg", { viewBox: `0 0 ${W} ${W}`, width: "100%" });
  const defs = svgEl("defs", {});
  for (const [kind, color] of Object.entries(EDGE_COLOR)) {
    const marker = svgEl("marker", {
      id: `arrow-${kind}`,
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto-start-reverse"
    });
    marker.append(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: color }));
    defs.append(marker);
  }
  root.append(defs);
  for (const r of routes) {
    const si = index.get(r.url);
    if (si === void 0) continue;
    const [sx, sy] = at(si);
    for (const link of r.links ?? []) {
      const ti = index.get(link.url);
      if (ti === void 0) continue;
      const [tx, ty] = at(ti);
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      root.append(
        svgEl("line", {
          x1: sx + ux * nodeR,
          y1: sy + uy * nodeR,
          x2: tx - ux * (nodeR + 6),
          y2: ty - uy * (nodeR + 6),
          stroke: EDGE_COLOR[link.kind],
          "stroke-width": 1.5,
          "marker-end": `url(#arrow-${link.kind})`
        })
      );
    }
  }
  routes.forEach((r, i) => {
    const [x, y] = at(i);
    const current = r.url === here;
    const g = svgEl("a", { href: r.url, target: "_blank", rel: "noopener" });
    g.style.cursor = "pointer";
    const circle = svgEl("circle", {
      cx: x,
      cy: y,
      r: nodeR,
      fill: current ? "#3730a3" : "#26262b",
      stroke: current ? "#818cf8" : "#3a3a40",
      "stroke-width": current ? 2 : 1
    });
    const title = svgEl("title", {});
    title.textContent = r.title ? `${r.url} — ${r.title}` : r.url;
    circle.append(title);
    const label = svgEl("text", {
      x,
      y: y + nodeR + 13,
      "text-anchor": "middle",
      fill: current ? "#c7d2fe" : "#93c5fd",
      "font-size": 11,
      "font-family": "ui-monospace, monospace"
    });
    label.textContent = shortLabel(r.url);
    g.append(circle, label);
    root.append(g);
  });
  host.replaceChildren(root);
}
var MapView;
function defineMapView() {
  return class MapViewImpl extends Component("dt-map") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    render() {
      const routes = readPayload()?.routes ?? [];
      if (routes.length === 0) {
        return html`<div class="section">page graph</div><div class="muted">no routes in payload</div>`;
      }
      return html`
        <div class="section">page graph</div>
        <div class="legend">
          ${Object.entries(EDGE_COLOR).map(
        ([kind, color]) => html`<span class="leg"><span class="sw" style=${`border-top:2px solid ${color}`}></span>${kind}</span>`
      )}
        </div>
        <div class="graph"></div>
      `;
    }
    onMount() {
      const host = this.shadowRoot?.querySelector(".graph");
      const routes = readPayload()?.routes ?? [];
      if (host && routes.length) drawGraph(host, routes, globalThis.location?.pathname ?? "");
    }
  };
}
var ENDPOINT_KINDS = /* @__PURE__ */ new Set(["robots", "sitemap", "rss", "llms"]);
function moduleDetail(info) {
  return Object.entries(info).filter(([k]) => k !== "kind" && k !== "path").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length ? v.join(", ") : "—" : String(v)}`).join(" · ");
}
var PluginsView;
function definePluginsView() {
  return class PluginsViewImpl extends Component("dt-plugins") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    render() {
      const modules = readPayload()?.modules ?? [];
      if (modules.length === 0) {
        return html`<div class="section">ssr modules</div><div class="muted">none — mount server-plugin-ssr with devtools:true</div>`;
      }
      return html`
        <div class="section">ssr modules (${modules.length})</div>
        ${modules.map((m) => {
        const info = m.info ?? {};
        const kind = typeof info.kind === "string" ? info.kind : void 0;
        const path = typeof info.path === "string" ? info.path : void 0;
        const detail = moduleDetail(info);
        const isEndpoint = !!path && !!kind && ENDPOINT_KINDS.has(kind);
        return html`
            <div class="kv">
              <span class="k">${m.name}</span>
              ${isEndpoint ? html`<a class="route" href=${path} target="_blank" rel="noopener">${path}</a>` : html`<span class="v muted">${detail || kind || ""}</span>`}
            </div>
            ${isEndpoint && detail ? html`<div class="kv"><span class="v muted">${detail}</span></div>` : html``}
          `;
      })}
      `;
    }
  };
}
function pagePanel() {
  PageView ??= definePageView();
  return componentPlugin("page", "Page", PageView);
}
function routesPanel() {
  RoutesView ??= defineRoutesView();
  return componentPlugin("routes", "Routes", RoutesView);
}
function mapPanel() {
  MapView ??= defineMapView();
  return componentPlugin("map", "Map", MapView);
}
function pluginsPanel() {
  PluginsView ??= definePluginsView();
  return componentPlugin("plugins", "Plugins", PluginsView);
}
function pageDevtoolsPanels() {
  return [pagePanel(), routesPanel(), mapPanel(), pluginsPanel()];
}
function installPageDevtools(target = document.body, options = {}) {
  return mountDevtoolsPanel(target, {
    ...options,
    panels: options.panels ?? [...defaultPanels(), ...pageDevtoolsPanels()]
  });
}

// packages/dom-router/src/dom-router.ts
var OUTLET_SELECTOR = "[data-router-outlet]";
function tagOf(component) {
  const tag = typeof component === "string" ? component : component.tagName;
  if (!tag) throw new Error("router: a route's component class has no static tagName");
  return tag;
}
function ensureDefined(component) {
  if (typeof component === "string" || typeof customElements === "undefined") return;
  const tag = component.tagName;
  if (tag && !customElements.get(tag)) customElements.define(tag, component);
}
function compile(path) {
  const paramNames = [];
  if (path === "*") {
    paramNames.push("*");
    return Object.assign(/^.*$/, { paramNames });
  }
  let source = "^";
  for (const seg of path.split("/").filter(Boolean)) {
    if (seg === "*") {
      paramNames.push("*");
      source += "/(.*)";
    } else if (seg.startsWith(":")) {
      paramNames.push(seg.slice(1));
      source += "/([^/]+)";
    } else {
      source += "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  source += "/?$";
  return Object.assign(new RegExp(source), { paramNames });
}
function parseQuery(search) {
  const out = {};
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of sp) out[k] = v;
  return out;
}
function createRouter(options) {
  const mode = options.mode ?? "hash";
  const base = options.base ?? "";
  const queryKey = options.queryKey ?? "page";
  const compiled = options.routes.map((r) => {
    ensureDefined(r.component);
    const rx = compile(r.path);
    return { ...r, regex: rx, paramNames: rx.paramNames, tag: tagOf(r.component) };
  });
  const outletEl = typeof options.outlet === "string" ? document.querySelector(options.outlet) : options.outlet;
  if (!outletEl) throw new Error(`router: outlet not found (${String(options.outlet)})`);
  let current;
  let mounted;
  function readLocation() {
    if (mode === "hash") {
      const raw = location.hash.slice(1) || "/";
      const q = raw.indexOf("?");
      return q === -1 ? { path: raw, query: {} } : { path: raw.slice(0, q), query: parseQuery(raw.slice(q)) };
    }
    if (mode === "query") {
      const sp = new URLSearchParams(location.search);
      const path2 = sp.get(queryKey) || "/";
      sp.delete(queryKey);
      const query = {};
      for (const [k, v] of sp) query[k] = v;
      return { path: path2, query };
    }
    let path = location.pathname;
    if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
    return { path, query: parseQuery(location.search) };
  }
  function writeLocation(path, replace) {
    if (mode === "hash") {
      const url = "#" + path;
      if (replace) location.replace(url);
      else location.hash = path;
      return;
    }
    if (mode === "query") {
      const sp = new URLSearchParams(location.search);
      sp.set(queryKey, path);
      const url = `${location.pathname}?${sp}`;
      history[replace ? "replaceState" : "pushState"]({}, "", url);
      render();
      return;
    }
    history[replace ? "replaceState" : "pushState"]({}, "", base + path);
    render();
  }
  function match(path) {
    for (const route of compiled) {
      const m = route.regex.exec(path);
      if (m) {
        const params = {};
        route.paramNames.forEach((name, i) => params[name] = decodeURIComponent(m[i + 1] ?? ""));
        return { route, params };
      }
    }
    return void 0;
  }
  function render() {
    const { path, query } = readLocation();
    const found = match(path);
    if (!found) {
      if (mounted) {
        mounted.el.remove();
        mounted = void 0;
      }
      current = void 0;
      return;
    }
    const { route, params } = found;
    current = { path, params, query, route };
    if (!mounted || mounted.tag !== route.tag) {
      mounted?.el.remove();
      const el2 = document.createElement(route.tag);
      el2.params = params;
      el2.query = query;
      outletEl.replaceChildren(el2);
      mounted = { tag: route.tag, el: el2 };
    } else {
      const el2 = mounted.el;
      el2.params = params;
      el2.query = query;
    }
  }
  const go = (path, replace = false) => writeLocation(path, replace);
  const onPopState = () => render();
  const onHashChange = () => render();
  const onClick = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.composedPath().find((n) => n?.tagName?.toUpperCase?.() === "A");
    if (!a || a.getAttribute("target") || a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("//") || /^[a-z]+:/i.test(href)) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    let path = url.pathname;
    if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
    go(path + url.search, false);
  };
  if (mode === "hash") {
    window.addEventListener("hashchange", onHashChange);
  } else {
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick);
  }
  render();
  return {
    navigate(path, opts) {
      go(path, opts?.replace ?? false);
    },
    get current() {
      return current;
    },
    refresh: render,
    destroy() {
      if (mode === "hash") {
        window.removeEventListener("hashchange", onHashChange);
      } else {
        window.removeEventListener("popstate", onPopState);
        document.removeEventListener("click", onClick);
      }
      mounted?.el.remove();
      mounted = void 0;
    }
  };
}

// examples/pages/client.ts
installDevtools();
installPageDevtools();
var { HomeApp: HomeApp2, AboutApp: AboutApp2, BlogApp: BlogApp2 } = await Promise.resolve().then(() => (init_components(), components_exports));
if (document.querySelector(OUTLET_SELECTOR)) {
  createRouter({
    outlet: OUTLET_SELECTOR,
    mode: "history",
    routes: [
      { path: "/", component: HomeApp2 },
      { path: "/about", component: AboutApp2 },
      { path: "/blog", component: BlogApp2 }
    ]
  });
}
