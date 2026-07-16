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
    for (let i = 0; i < strings.length; i++) {
      const s = strings[i];
      markup += s;
      const lastOpen = s.lastIndexOf("<");
      const lastClose = s.lastIndexOf(">");
      if (lastOpen > lastClose) inTag = true;
      else if (lastClose > lastOpen) inTag = false;
      if (i < strings.length - 1) {
        markup += inTag ? `"dh:${i}"` : `<!--dh:${i}-->`;
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
      const el = node;
      for (const attr of Array.from(el.attributes)) {
        if (!attr.value.startsWith("dh:")) continue;
        const holeIndex = Number(attr.value.slice(3));
        let kind = "attr";
        let name = attr.name;
        if (name.startsWith("@")) {
          kind = "event";
          name = name.slice(1);
        } else if (name.startsWith(".")) {
          kind = "property";
          name = name.slice(1);
        }
        metas.push({ kind, path, holeIndex, name });
        el.removeAttribute(attr.name);
      }
    }
    const kids = node.childNodes;
    for (let i = 0; i < kids.length; i++) {
      collectParts(kids[i], [...path, i], metas);
    }
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
  var NodePart = class {
    // current key order, to detect structural changes
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
    commit(value) {
      if (value == null || typeof value === "boolean")
        return this.#renderText("");
      if (isRepeatResult(value)) return this.#renderRepeat(value);
      if (isTemplateResult(value)) return this.#renderTemplate(value);
      if (value instanceof Node) return this.#renderNode(value);
      if (Array.isArray(value)) return this.#renderList(value);
      this.#renderText(String(value));
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
    constructor(el, name, holeIndex) {
      this.el = el;
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
  var EventPart = class {
    constructor(el, name, holeIndex) {
      this.el = el;
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
    constructor(el, name, holeIndex) {
      this.el = el;
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
  function bindParts(frag, metas) {
    return metas.map((m) => {
      const node = resolvePath(frag, m.path);
      if (m.kind === "node") return new NodePart(node, m.holeIndex);
      if (m.kind === "event")
        return new EventPart(node, m.name, m.holeIndex);
      if (m.kind === "property")
        return new PropertyPart(node, m.name, m.holeIndex);
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
        let store = this[name];
        const external = externalProps.get(this);
        if (external?.has(name)) {
          store = external.get(name);
          external.delete(name);
        }
        delete this[name];
        const watchers = getWatchers(this.constructor, name);
        Object.defineProperty(this, name, {
          configurable: true,
          enumerable: true,
          get: () => store,
          set: (value) => {
            if (value === store) return;
            const previous = store;
            store = value;
            for (const m of watchers) {
              this[m](value, previous);
            }
            this.requestUpdate();
          }
        });
      }
      #render() {
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
  function define(...components) {
    for (const C of components) {
      if (C.tagName && !customElements.get(C.tagName)) {
        customElements.define(
          C.tagName,
          C
        );
      }
    }
  }

  // examples/ssg/app.ts
  var _inc_dec, _count_dec, _a, _CounterApp_decorators, _init;
  _CounterApp_decorators = [Component.define()];
  var CounterApp = class extends (_a = Component("counter-app"), _count_dec = [Component.prop()], _inc_dec = [Component.event()], _a) {
    constructor() {
      super(...arguments);
      __runInitializers(_init, 5, this);
      __publicField(this, "count", __runInitializers(_init, 8, this, 0)), __runInitializers(_init, 11, this);
    }
    inc() {
      this.count++;
    }
    render() {
      return html`
      <h1>SSG + hydration demo</h1>
      <p>
        This markup was server-rendered (Declarative Shadow DOM); the client
        bundle hydrated it so the button works.
      </p>
      <p>count: <span class="count">${this.count}</span></p>
      <button @click=${this.inc}>increment</button>
    `;
    }
  };
  _init = __decoratorStart(_a);
  __decorateElement(_init, 1, "inc", _inc_dec, CounterApp);
  __decorateElement(_init, 5, "count", _count_dec, CounterApp);
  CounterApp = __decorateElement(_init, 0, "CounterApp", _CounterApp_decorators, CounterApp);
  __publicField(CounterApp, "styles", css`
    :host {
      display: block;
      max-width: 28rem;
      margin: 3rem auto;
      padding: 1.5rem 2rem;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
      font-family: system-ui, -apple-system, sans-serif;
      color: #1b1b1f;
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.4rem;
    }
    p {
      color: #555;
    }
    button {
      font-size: 1rem;
      padding: 0.5rem 1rem;
      border: 0;
      border-radius: 8px;
      background: #6750a4;
      color: #fff;
      cursor: pointer;
    }
    .count {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
  `);
  __runInitializers(_init, 1, CounterApp);
})();
