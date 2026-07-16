"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
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

  // packages/dom/src/dom.ts
  function html(strings, ...values) {
    return { strings, values };
  }
  var templateCache = /* @__PURE__ */ new WeakMap();
  function compileTemplate(strings) {
    const cached = templateCache.get(strings);
    if (cached) return cached;
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
        if (!inTag) markup += `<!--dh:${i}-->`;
        else if (quote) markup += `dh:${i}`;
        else if (!s.replace(/\s+$/, "").endsWith("=")) markup += ` dh-el-${i}=""`;
        else markup += `"dh:${i}"`;
      }
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = markup;
    const metas = [];
    collectParts(tpl.content, [], metas);
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
  function classMap(map) {
    let out = "";
    for (const k in map) if (map[k]) out += (out ? " " : "") + k;
    return out;
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
  var NodePart = class _NodePart {
    // the anchor appended to the portal target
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
    commit(value) {
      if (isPortalResult(value)) return this.#renderPortal(value);
      if (this.#portalTarget) this.#teardownPortal();
      if (value == null || typeof value === "boolean")
        return this.#renderText("");
      if (isRepeatResult(value)) return this.#renderRepeat(value);
      if (isTemplateResult(value)) return this.#renderTemplate(value);
      if (value instanceof Node) return this.#renderNode(value);
      if (Array.isArray(value)) return this.#renderList(value);
      this.#renderText(String(value));
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
        let map = externalProps.get(this.el);
        if (!map) externalProps.set(this.el, map = /* @__PURE__ */ new Map());
        map.set(this.name, value);
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
  function toStyleSheets(input) {
    const list = Array.isArray(input) ? input : [input];
    return list.map((s) => {
      if (s instanceof CSSStyleSheet) return s;
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(s);
      return sheet;
    });
  }
  function getStyles(ctor) {
    const chain = [];
    let c = ctor;
    while (c && c !== HTMLElement && c !== Object) {
      chain.push(c);
      c = Object.getPrototypeOf(c.prototype)?.constructor ?? null;
    }
    const sheets = [];
    for (const cls of chain.reverse()) {
      const own = Object.getOwnPropertyDescriptor(cls, "styles")?.value;
      if (own)
        for (const sheet of Array.isArray(own) ? own : [own]) sheets.push(sheet);
    }
    return sheets;
  }
  var reactiveProps = /* @__PURE__ */ new WeakMap();
  function registerProp(ctor, name) {
    let set = reactiveProps.get(ctor);
    if (!set) reactiveProps.set(ctor, set = /* @__PURE__ */ new Set());
    set.add(name);
  }
  function getReactiveProps(ctor) {
    const out = /* @__PURE__ */ new Set();
    let c = ctor;
    while (c && c !== HTMLElement && c !== Object) {
      const set = reactiveProps.get(c);
      if (set) for (const n of set) out.add(n);
      c = Object.getPrototypeOf(c.prototype)?.constructor ?? null;
    }
    return [...out];
  }
  Symbol.dispose ??= /* @__PURE__ */ Symbol("Symbol.dispose");
  Symbol.metadata ??= /* @__PURE__ */ Symbol("Symbol.metadata");
  var ATTR_META = "__attrProps__";
  function attrPropMap(target) {
    return target?.[Symbol.metadata]?.[ATTR_META];
  }
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
        for (const host of hosts) host.flush();
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
      }
    };
  }
  var defaultScheduler = createScheduler();
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
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(() => cb(now()), minInterval || 16);
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
      if (pending.size === 0 && frames.size === 0) {
        looping = false;
        return;
      }
      raf(tick);
      if (t - last < minInterval) return;
      const dt = last === -Infinity ? 0 : t - last;
      last = t;
      if (frames.size) for (const cb of [...frames]) cb(dt);
      flush();
    };
    const ensureLoop = () => {
      if (looping) return;
      looping = true;
      raf(tick);
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
        return () => frames.delete(callback);
      },
      flushSync: flush
    };
  }
  var rafScheduler = createFpsScheduler();
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
  var watchRegistry = /* @__PURE__ */ new WeakMap();
  function registerWatch(ctor, prop, method) {
    let map = watchRegistry.get(ctor);
    if (!map) watchRegistry.set(ctor, map = /* @__PURE__ */ new Map());
    let list = map.get(prop);
    if (!list) map.set(prop, list = []);
    list.push(method);
  }
  function getWatchers(ctor, prop) {
    const out = [];
    let c = ctor;
    while (c && c !== HTMLElement && c !== Object) {
      const list = watchRegistry.get(c)?.get(prop);
      if (list) out.push(...list);
      c = Object.getPrototypeOf(c.prototype)?.constructor ?? null;
    }
    return out;
  }
  function reactive(Base) {
    class Reactive extends Base {
      static tagName = "";
      /** Default update priority for this component (override per class). */
      static priority = "render-blocking";
      /** Optional per-component scheduler; falls back to the global default. */
      static scheduler;
      /** Attributes to observe — the ones declared via `@prop({ attribute })`. */
      static get observedAttributes() {
        const map = attrPropMap(this);
        return map ? Object.keys(map) : [];
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
      #root;
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
       *  THIS class (polymorphic `this` works on a static method, unlike the
       *  constructor). Optional `slot` is projected into a `<slot>` (islands/SSR).
       *  Prefer it over `new View({…})` when you want type-safety. */
      static of(props, slot) {
        return new this(props, slot);
      }
      // `new View({ name: "Ada" })` — first arg, if an object, becomes the props
      // bag (applied on connect). Optional, so `createElement` / the parser (which
      // call `new View()`) still work. The `...args` shape is required for mixins.
      constructor(...args) {
        super();
        this.#root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        this.#root.adoptedStyleSheets = getStyles(this.constructor);
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
      /** Aborted on disconnect — pass to addEventListener / fetch / etc. */
      get signal() {
        return this.#controller.signal;
      }
      get #scheduler() {
        return this.#schedulerOverride ?? this.constructor.scheduler ?? defaultScheduler;
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
        }
        this.#render();
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
        this.onUnmount?.();
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
      /** This instance's live scoped stylesheets. Mutate one in place
       *  (`getStyles()[0].replaceSync(…)`) to restyle at runtime — note `css`
       *  sheets shared across components are shared state. Prefer `setStyles()`
       *  for a clean per-instance swap. */
      getStyles() {
        return [...this.#root.adoptedStyleSheets];
      }
      /** Replace this instance's scoped styles at runtime (per-instance — does
       *  not touch sheets shared via `static styles` / Component options). */
      setStyles(input) {
        this.#root.adoptedStyleSheets = toStyleSheets(input);
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
      /** Dispatch a bubbling, composed CustomEvent (Angular @Output / Vue emit). */
      emit(type, detail) {
        this.#devtools("emit", { type, detail });
        this.dispatchEvent(
          new CustomEvent(type, { detail, bubbles: true, composed: true })
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
            this.requestUpdate();
          }
        });
      }
      #render() {
        const prevHost = currentHost;
        currentHost = this;
        try {
          this.#renderInner();
        } finally {
          currentHost = prevHost;
        }
      }
      #renderInner() {
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
        if (!this.#mounted) {
          this.#mounted = true;
          this.onMount?.();
          this.#devtools("mount");
        } else {
          this.onUpdate?.();
          this.#devtools("update");
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
    class Scoped extends reactive(Base) {
      static tagName = tagName;
    }
    if (opts.priority !== void 0) Scoped.priority = opts.priority;
    if (opts.scheduler !== void 0) Scoped.scheduler = opts.scheduler;
    if (opts.styles !== void 0) {
      Scoped.styles = toStyleSheets(
        opts.styles
      );
    }
    return Scoped;
  }
  Component.prop = function(opts) {
    return function(_value, ctx) {
      const name = ctx.name;
      if (opts?.attribute) {
        const attr = opts.attribute === true ? name.toLowerCase() : opts.attribute;
        const meta = ctx.metadata;
        if (!Object.prototype.hasOwnProperty.call(meta, ATTR_META))
          meta[ATTR_META] = { ...meta[ATTR_META] ?? {} };
        meta[ATTR_META][attr] = name;
      }
      ctx.addInitializer(function() {
        registerProp(this.constructor, name);
      });
    };
  };
  Component.event = function() {
    return function(_value, ctx) {
      ctx.addInitializer(function() {
        const self = this;
        const name = ctx.name;
        self[name] = self[name].bind(self);
      });
    };
  };
  Component.watch = function(prop) {
    return function(_value, ctx) {
      ctx.addInitializer(function() {
        registerWatch(this.constructor, prop, ctx.name);
      });
    };
  };
  function defineImmediate(value) {
    const inDom = typeof document !== "undefined" && !!value.tagName && document.getElementsByTagName(value.tagName).length > 0;
    if (inDom && typeof queueMicrotask === "function")
      queueMicrotask(() => define(value));
    else define(value);
    return value;
  }
  var pendingDefines = /* @__PURE__ */ new Set();
  function scheduleDefine(value, when) {
    pendingDefines.add(value);
    if (when === "server" || typeof window === "undefined") return;
    const run = () => {
      pendingDefines.delete(value);
      defineImmediate(value);
    };
    if (typeof when === "number") setTimeout(run, when);
    else if (typeof when === "function") void Promise.resolve(when()).then(run);
    else if (when === "idle")
      (window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1)))(
        run
      );
    else if (when === "load")
      document.readyState === "complete" ? run() : window.addEventListener("load", run, { once: true });
    else if (document.readyState !== "loading") run();
    else document.addEventListener("DOMContentLoaded", run, { once: true });
  }
  Component.define = function(when) {
    return function(value, _ctx) {
      if (when === void 0) return defineImmediate(value);
      scheduleDefine(value, when);
      return value;
    };
  };
  Component.computed = function() {
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
  };
  function task(host, fn, options) {
    const priority = options?.priority;
    let controller;
    const state = {
      pending: false,
      error: void 0,
      value: void 0
    };
    host.onCleanup(() => controller?.abort());
    return {
      get pending() {
        return state.pending;
      },
      get error() {
        return state.error;
      },
      get value() {
        return state.value;
      },
      run(...args) {
        controller?.abort();
        controller = new AbortController();
        state.pending = true;
        state.error = void 0;
        host.requestUpdate(priority);
        return Promise.resolve(fn(...args, controller.signal)).then((value) => state.value = value).catch((err) => {
          if (err?.name !== "AbortError")
            state.error = err;
          return void 0;
        }).finally(() => {
          state.pending = false;
          host.requestUpdate(priority);
        });
      },
      [Symbol.dispose]() {
        controller?.abort();
      }
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
  function installDevtools() {
    globalThis.__DOM_DEVTOOLS__ = { send };
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
    var _ctx_dec, _a2, _b, _init2, _search, _collapsed, _frozen, _cleanup, _ComponentTreeViewImpl_instances, hl_fn, orderedEvents_fn, toggle_fn, rowOf_fn, detail_fn;
    return _b = class extends (_a2 = Component("dt-component-tree"), _ctx_dec = [Component.prop()], _a2) {
      constructor() {
        super(...arguments);
        __privateAdd(this, _ComponentTreeViewImpl_instances);
        __publicField(this, "ctx", __runInitializers(_init2, 8, this)), __runInitializers(_init2, 11, this);
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
    }, _init2 = __decoratorStart(_a2), _search = new WeakMap(), _collapsed = new WeakMap(), _frozen = new WeakMap(), _cleanup = new WeakMap(), _ComponentTreeViewImpl_instances = new WeakSet(), /** Highlight `rec` on the page — gated by this plugin's "highlight" toggle. */
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
    }, __decorateElement(_init2, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init2, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`${TREE_CSS}`), _b;
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
    var _ctx_dec, _a2, _b, _init2, _snap, _highlight, _cleanup, _TimeTravelViewImpl_instances, paintHighlight_fn, toggleHighlight_fn, apply_fn, goTo_fn;
    return _b = class extends (_a2 = Component("dt-time-travel"), _ctx_dec = [Component.prop()], _a2) {
      constructor() {
        super(...arguments);
        __privateAdd(this, _TimeTravelViewImpl_instances);
        __publicField(this, "ctx", __runInitializers(_init2, 8, this)), __runInitializers(_init2, 11, this);
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
    }, _init2 = __decoratorStart(_a2), _snap = new WeakMap(), _highlight = new WeakMap(), _cleanup = new WeakMap(), _TimeTravelViewImpl_instances = new WeakSet(), /** Draw (or clear) the on-page overlay for the current selection. */
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
    }, __decorateElement(_init2, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init2, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`
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
  var StylesView;
  function defineStylesView() {
    var _ctx_dec, _a2, _b, _init2, _highlight, _cleanup, _StylesViewImpl_instances, paintHighlight_fn, toggleHighlight_fn, rule_fn;
    return _b = class extends (_a2 = Component("dt-styles"), _ctx_dec = [Component.prop()], _a2) {
      constructor() {
        super(...arguments);
        __privateAdd(this, _StylesViewImpl_instances);
        __publicField(this, "ctx", __runInitializers(_init2, 8, this)), __runInitializers(_init2, 11, this);
        __privateAdd(this, _highlight, false);
        // keep the selected element outlined on the page
        __privateAdd(this, _cleanup, []);
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
        return html`
      ${toolbar}
      <div class="section">styles (${rules.length} rules)</div>
      ${rules.length === 0 ? html`<div class="muted">—</div>` : rules.map((rule) => __privateMethod(this, _StylesViewImpl_instances, rule_fn).call(this, host, rule))}
    `;
      }
    }, _init2 = __decoratorStart(_a2), _highlight = new WeakMap(), _cleanup = new WeakMap(), _StylesViewImpl_instances = new WeakSet(), /** Draw (or clear) the on-page overlay for the current selection. */
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
    }, rule_fn = function(host, rule) {
      const decls = authoredDecls(rule);
      const dis = disabledOf(rule);
      const matched = selectorApplies(host, rule.selectorText);
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
        <span class="sel">${rule.selectorText} {</span>
        ${matched ? html`` : html`<span class="deadtag">unused</span>`}
      </div>
      ${decls.map((decl) => {
        const on = !dis.has(decl.prop);
        return html`
          <label class=${on ? "decl" : "decl off"}>
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
            <span class="prop">${decl.prop}</span><span class="val">: ${decl.value};</span>
          </label>
        `;
      })}
      <div class="cssfoot">}</div>
    `;
    }, __decorateElement(_init2, 5, "ctx", _ctx_dec, _b), __decoratorMetadata(_init2, _b), __publicField(_b, "devtools", false), __publicField(_b, "styles", css`
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

  // examples/cascade/devtools-setup.ts
  installDevtools();

  // examples/cascade/app.ts
  function request(value, ms, signal) {
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => resolve(value), ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new DOMException("aborted", "AbortError"));
        },
        { once: true }
      );
    });
  }
  var STYLES = css`
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
  var _reload_dec, _a, _CascadeLoader_decorators, _init;
  _CascadeLoader_decorators = [Component.define()];
  var CascadeLoader = class extends (_a = Component("cascade-loader", { styles: STYLES }), _reload_dec = [Component.event()], _a) {
    constructor() {
      super(...arguments);
      __runInitializers(_init, 5, this);
      // Plain fields (NOT reactive): mutating in render would loop; mutating mid-task
      // would force re-renders we explicitly want to avoid.
      __publicField(this, "renders", 0);
      __publicField(this, "log", []);
      // One task wraps the whole 3-request waterfall. Its pending/value changes are
      // the ONLY things that re-render the component.
      __publicField(this, "load", task(this, async (signal) => {
        this.log = [];
        const mark = (s) => this.log.push(s);
        const user = await request("Ada Lovelace", 700, signal);
        mark(`① user → ${user}`);
        const orders = await request("3 orders", 700, signal);
        mark(`② orders(user) → ${orders}`);
        const summary = await request("$1,240 total", 700, signal);
        mark(`③ summary(orders) → ${summary}`);
        return { user, orders, summary, finishedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString() };
      }));
    }
    onMount() {
      this.load.run();
    }
    reload() {
      this.load.run();
    }
    render() {
      this.renders++;
      const { pending, value } = this.load;
      return html`
      <button @click=${this.reload} .disabled=${pending}>
        ${pending ? "Running cascade…" : "Run cascade (3 requests)"}
      </button>
      <span class="stat">renders: ${this.renders}</span>

      <div class="card ${pending ? "stale" : ""}">
        ${pending ? html`<div class="loading">⏳ waiting for the whole cascade…</div>` : ""}
        ${value ? html`
              <div class="row"><span class="k">user</span><span>${value.user}</span></div>
              <div class="row"><span class="k">orders</span><span>${value.orders}</span></div>
              <div class="row"><span class="k">summary</span><span>${value.summary}</span></div>
              <div class="row"><span class="k">finished</span><span>${value.finishedAt}</span></div>
            ` : pending ? "" : html`<div class="empty">no data yet</div>`}
      </div>
    `;
    }
  };
  _init = __decoratorStart(_a);
  __decorateElement(_init, 1, "reload", _reload_dec, CascadeLoader);
  CascadeLoader = __decorateElement(_init, 0, "CascadeLoader", _CascadeLoader_decorators, CascadeLoader);
  __runInitializers(_init, 1, CascadeLoader);

  // examples/cascade/client.ts
  mountDevtoolsPanel();
})();
