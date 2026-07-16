# Frontend → @youneed/dom (React / Vue / Angular / Lit / Preact / Svelte)

@youneed/dom = Custom Elements + Shadow DOM, `html``/`css`` templates, field-level
reactivity via `@Component.prop`. Mental model closest to **Angular** (class + decorators)
with **Lit**-style templates and fine-grained updates. Full API in the `youneed` skill's
`references/dom.md`.

Migrate **leaves first**, mount them in the old tree via an adapter, work up to containers.

## React → @youneed/dom

| React | @youneed/dom |
|-------|--------------|
| `const [c,setC]=useState(0)` | `@Component.prop() c = 0;` (assign to update) — or signal `c = this.signal(0)` (read `c()`, write `c.set(1)`) |
| `<Counter count={5}/>` | `html\`<x-counter .data=${{count:5}}>\`` (camelCase via grouped `.data` or attr) |
| child `onAdd` callback prop | `@Component.event("onAdd") add!: EventEmitter<T>` → parent `@onAdd=${fn}` |
| `useEffect(setup, [])` | `onMount()` + `onCleanup(...)`/`this.abortSignal` |
| `useEffect(fn,[dep])` | `@Component.watch("dep") onDep(next,prev){}` — or `this.effect(() => …)` (auto-tracks signals) |
| `useMemo(()=>x,[d])` | `@Component.computed() get x(){}` — or `this.computed(() => x)` |
| `useRef` + `<input ref>` | `#r = createRef(); html\`<input ${ref(this.#r)}>\`` |
| `memo()` / `PureComponent` | not needed — only the component whose prop changed re-renders |
| JSX `<b>{c}</b>` | `html\`<b>${this.c}</b>\`` |
| `cond ? <A/> : <B/>` | `when(cond, ()=>html\`<a/>\`, ()=>html\`<b/>\`)` |
| `items.map(x=><Item key={x.id}/>)` | `repeat(items, x=>x.id, x=>html\`<item/>\`)` |
| inline `style={{color}}` | `style=${styleMap({color})}` |
| `<ErrorBoundary>` | `onError(err,info)` + global `setErrorHandler` |
| Context | no built-in; pass props or `this.listen(...)` on a shared bus |

Interop both directions: `toReact(Comp)` renders a youneed component inside React (events
as `onX` props); `fromReact(Comp)` wraps a React component as a custom element for a
migrated youneed screen — both from `@youneed/dom-adapter-react`. Incremental strangler.

## Vue → @youneed/dom

| Vue | @youneed/dom |
|-----|--------------|
| `ref(0)` / `reactive({})` | `@Component.prop() x = 0;` — or signal `x = this.signal(0)` (`.value` like a Vue ref) |
| `computed(()=>...)` | `@Component.computed() get y(){}` — or `this.computed(() => …)` |
| `watch(src,(n,o)=>...)` | `@Component.watch("src") onSrc(n,o){}` |
| `defineProps({name:String})` | `@Component.prop({attribute:true}) name="";` |
| `emits` / `$emit('add',v)` | `@Component.event("onAdd") add!:EventEmitter<T>` or `this.emit("add",v)` |
| `v-if` | `when(cond, ...)` |
| `v-for` `:key` | `repeat(items, keyFn, tplFn)` |
| `<slot>` / `#default` | `<slot></slot>` in template; `this.slotted()` imperatively |
| `onMounted/onUnmounted` | `onMount()/onUnmount()` |
| `:class="{active}"` | `class=${classMap({active})}` |
| `:style="{color}"` | `style=${styleMap({color})}` |
| `<style scoped>` | `static styles = css\`...\`` (Shadow DOM scoping) |

Interop via `@youneed/dom-adapter-vue`.

## Angular → @youneed/dom (closest fit — same class+decorator shape)

| Angular | @youneed/dom |
|---------|--------------|
| `@Component({selector,template})` | `@Component.define() class X extends Component("x"){ render(){} }` |
| `@Input() name` | `@Component.prop({attribute:true}) name="";` |
| `@Output() ev = new EventEmitter` | `@Component.event() ev!: EventEmitter<T>;` |
| `signal(0)` / `set`/`update` | `this.signal(0)` — same API: read `s()`, write `s.set/.update` |
| `computed(() => …)` | `this.computed(() => …)` (memoized, tracks signal reads) |
| `effect(() => …)` | `this.effect(() => …)` (auto-stops on disconnect) |
| `ngOnInit/ngOnDestroy` | `onMount()/onUnmount()` |
| `ngOnChanges` | `@Component.watch("prop") ...` |
| `*ngIf` | `when(cond, ...)` |
| `*ngFor; trackBy` | `repeat(items, keyFn, tplFn)` |
| `@ViewChild` | `createRef()` + `ref(...)` |
| `[(ngModel)]` two-way | one-way prop down + event up (`.value` + `@onValueChange`) |
| `ViewEncapsulation.ShadowDom` | default (`shadow:true`); opt out with `{shadow:false}` |
| `styles:[...]` | `static styles = css\`...\`` |
| Services / DI | no built-in frontend DI — inject via constructor or a shared module |

Angular's legacy decorators and youneed's TC39 decorators **cannot compile in one pass** —
scope them separately at build time (see `references/tooling.md`; `examples/vite` uses
`@analogjs/vite-plugin-angular` with a scoped `include` beside the youneed plugin).
Interop via `@youneed/dom-adapter-angular`.

## Lit → @youneed/dom (very close — both are Custom Elements + tagged templates)

| Lit | @youneed/dom |
|-----|--------------|
| `@customElement("x")` | `@Component.define() class X extends Component("x")` |
| `@property()` | `@Component.prop({attribute:true})` |
| `@state()` | `@Component.prop()` (no attribute) or `this.signal()` |
| `render(){ return html\`\` }` | same `render()` returning `html\`\`` |
| `static styles = css\`\`` | same (`static styles = css\`\``) |
| `@query(...)` | `createRef()` + `ref(...)` |
| reactive update on property set | same — assign the field, fine-grained update |
| `@eventOptions` / `dispatchEvent` | `@Component.event()` + `EventEmitter` |

Lit → youneed is the smallest jump: keep the templates, swap decorators, replace manual
`dispatchEvent` with `@Component.event`.

## Preact / Svelte → @youneed/dom

- **Preact** maps like React (hooks → props/signals/`onMount`). Interop: `@youneed/dom-adapter-preact`
  (a port of the react adapter).
- **Svelte:** `$: reactive` → `computed`/`effect`; `export let prop` → `@Component.prop`;
  `createEventDispatcher` → `@Component.event`; `on:mount`/`onDestroy` → `onMount`/`onUnmount`;
  scoped `<style>` → `static styles = css\`\``. Interop: `@youneed/dom-adapter-svelte`
  (`action` + `mount`, remounts on prop change).

## Migration tactics

1. **Strangler.** Migrate leaf components first; keep them mountable inside the old app
   (React via `toReact`; any framework can mount a Custom Element directly).
2. **Watch the camelCase gotcha.** `.camelProp=${x}` in `html`` won't bind through HTML
   parsing — group into one `.data=${obj}`, or use events for camelCase names.
3. **Replace effect cleanup** with `this.abortSignal` / `onCleanup` — no dependency arrays.
4. **Drop `memo`/`OnPush` tuning** — updates are already fine-grained per reactive field.
5. **Validate visually** against `examples/dom`, `examples/dom-vs-react`, `examples/vite`.
