# Vite interop playground — one Web Component, every framework

`<dom-stepper>` is a plain **Custom Element** built with `@youneed/dom`. Because it
is a standard Web Component, *any* framework can embed and drive it with its own
built-in tools — no per-framework adapter. This example proves it across four:

| Framework | File | How it drives `<dom-stepper>` |
| --- | --- | --- |
| ⚛️ React | `src/ReactIsland.tsx` | `ref` + `value` attr + `addEventListener("change")` |
| 💚 Vue | `src/VueIsland.vue` | `:value` binding + `@change` (dashed tag → custom element) |
| 🧩 ours | `src/our-island.ts` | `.value=${}` + `this.listen(…, "change")` |
| 🅰️ Angular | `src/AngularIsland.ts` | `[value]` + `(change)` + `CUSTOM_ELEMENTS_SCHEMA` |

The pattern is always the same: **set the component's `value` (a property), listen
for its bubbling `change` CustomEvent, mirror the result into the host framework's
own state.** Each island binds `value` to its *mirror* (not the seed constant), so
re-applying on change is a no-op rather than a fight.

## Run the main demo (React + Vue + ours)

```bash
# from the repo root
npx vite examples/vite            # dev server
npx vite build examples/vite      # → examples/vite/dist
node --import tsx examples/vite/prerender.mjs   # SSG → dist-ssg
```

## Angular island

Angular gets its **own** entry (`angular.html` + `src/angular.ts` +
`vite.angular.config.ts`) for one structural reason:

> Angular components use **legacy** decorators (`experimentalDecorators` +
> `emitDecoratorMetadata`) and an HTML template compiler. Our `@Component.prop`
> uses **TC39 standard** decorators. The two decorator modes **cannot share one
> esbuild/Vite pass** (the same constraint documented in
> `packages/dom/bench/angular.bench.ts`).

So the Angular variant runs two compilers side by side, each scoped to its own files:

- [`@analogjs/vite-plugin-angular`](https://analogjs.org) compiles the Angular
  island (legacy decorators + template);
- our `domFramework()` plugin lowers the TC39 decorators of `<dom-stepper>`.

`vite.angular.config.ts` scopes Analog with `include: ["**/AngularIsland.ts"]` so
the stepper still flows through `domFramework()` — the two never meet in one pass.

The integration code itself is ordinary Angular consuming a Web Component:

```ts
@Component({
  selector: "ng-island",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],            // allow the unknown <dom-stepper> tag
  template: `<dom-stepper [value]="val()" (change)="onChange($event)"></dom-stepper>`,
})
export class AngularIsland {
  readonly val = signal(0);                     // zoneless CD via signals (no zone.js)
  onChange(e: Event) { this.val.set((e as CustomEvent<number>).detail); }
}
```

### Running it

Analog (`2.6.x`) supports Angular `22` + Vite `8`. Its peers must be present:

```bash
# from the repo root (once)
pnpm add -wD @analogjs/vite-plugin-angular @angular/build @angular/compiler-cli

# then
npx vite --config examples/vite/vite.angular.config.ts          # dev server → angular.html
npx vite build --config examples/vite/vite.angular.config.ts    # → examples/vite/dist-angular
```

> Note: Angular's AOT toolchain is heavy; if you only want the integration
> *pattern*, `src/AngularIsland.ts` is the whole story — `CUSTOM_ELEMENTS_SCHEMA`
> + `[value]` / `(change)` + a signal mirror.
