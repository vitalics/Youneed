# @youneed/dom-adapter-angular

Bridge [`@youneed/dom`](../dom) and Angular, both directions:

- **`toAngular`** — build a `@youneed/dom` component for use inside an Angular app.
- **`fromAngular`** — wrap an existing Angular component as a custom element so it
  drops into a `@youneed/dom` tree (no rewrite, no porting).
- **`emit`** — fire an event either way: an Angular `@Output()`/`EventEmitter`, or a
  DOM `CustomEvent` from a host element.

Part of the host-framework adapter family (`@youneed/dom-adapter-react`,
`@youneed/dom-adapter-vue`, …).

```ts
import { toAngular } from "@youneed/dom-adapter-angular";
import { UserCard } from "./user-card";

// In an Angular component, append the element where you need it:
@Component({ selector: "app-profile", template: `<section #host></section>` })
class Profile {
  @ViewChild("host") host!: ElementRef<HTMLElement>;
  @Input() user!: User;
  ngAfterViewInit() {
    this.host.nativeElement.append(toAngular(UserCard, { user: this.user }));
  }
}
```

Why not just write `<user-card>` (with `CUSTOM_ELEMENTS_SCHEMA`)? You can — and for
a pure template that's fine. But a bare tag string is invisible to "find references"
and survives a rename silently. Passing the **class** keeps the usage greppable and
refactor-safe, and the props you pass are type-checked against the component's own
`@prop` fields.

## `toAngular(target, props?)`

Three forms, in order of preference:

| call | when |
| --- | --- |
| `toAngular(UserCard, { user })` | **preferred** — class reference, typed props |
| `toAngular(new UserCard({ user }))` | a pre-built instance (props baked into the constructor) |
| `toAngular(UserCard.tagName, { user })` | raw tag string — escape hatch, no prop typing |

- Returns a **live custom element** (`HTMLElement`). Angular has no runtime
  "element descriptor" to hand back, and a dom component already *is* a custom
  element — so you get the node itself. Mount it via `ElementRef`,
  `ViewContainerRef`, or `Renderer2`.
- **Props are assigned as JS *properties*** (not attributes), so a reactive `@prop`
  setter fires with the real value — objects, arrays and functions pass through
  intact. Reassign on the returned element (or call again) to update.

## `fromAngular(Comp, props?)`

The other direction: take an Angular component you already have and use it as a
custom element inside `@youneed/dom`. The wrapper owns a tiny zoneless Angular
application, renders the component into itself, syncs its `@Input()`s, and
re-dispatches each `@Output()` as a DOM `CustomEvent`.

```ts
import { fromAngular } from "@youneed/dom-adapter-angular";
import { ChartComponent } from "some-angular-charts";

const NgChart = fromAngular(ChartComponent); // ← a custom-element class
```

Two forms, mirroring `toAngular`:

| call | when |
| --- | --- |
| `fromAngular(Comp)` | **preferred** — a reusable custom-element class (auto-registered, carries `.tagName`). Update `.props` to re-render in place. |
| `fromAngular(Comp, props)` | a configured instance (a live `Node`) you embed directly. |

```ts
// Reusable class — bind inputs via ONE lowercase `.props` binding (HTML lowercases
// attribute names, so a camelCase `.someInput=` never reaches the element), and
// listen to @Output()s by their public name with `@event`:
html`<${NgChart.tagName} .props=${{ data }} @select=${onSelect}></${NgChart.tagName}>`;

// Or drop a ready instance straight into a slot:
html`<section>${fromAngular(ChartComponent, { data })}</section>`;
```

- **`@Input()`s** come from `props` (applied through `setInput`, so change
  detection runs). Keys that aren't declared inputs are set as plain properties.
- **`@Output()`s** surface as bubbling, composed `CustomEvent`s named after the
  output's public name, with `event.detail` set to the emitted value.
- Pass `{ tagName }` for a stable, predictable tag, or `{ shadow: true }` to render
  into a shadow root instead of light DOM.
- On disconnect the Angular view is detached and destroyed.

> Angular (`@angular/core`, `@angular/platform-browser`) is a **peer dependency**
> and is imported *dynamically* on the first `fromAngular` mount — apps that only
> use `toAngular`/`emit` never pull Angular into their bundle. The host runs
> **zoneless** (no `zone.js`); change detection is flushed on each input change.

## `emit(target, payload)`

The bridge's outward-event primitive — one call, both worlds:

```ts
emit(this.select, row);                          // Angular @Output / EventEmitter → .emit(row)
emit(hostEl, { type: "select", detail: row });   // a fromAngular host (or any node) → CustomEvent
emit(hostEl, "close");                            // shorthand: a bare event type, no detail
```

- A target with an **`.emit()` method** (Angular `EventEmitter`, RxJS `Subject`) →
  its `.emit(payload)` is called.
- An **`EventTarget`** (the host element, or any node) → a bubbling, composed
  `CustomEvent` is dispatched. Pass a ready `Event`, a
  `{ type, detail?, bubbles?, composed? }` descriptor, or a bare type string.

This package's `toAngular`/`emit` depend only on the DOM. `fromAngular` adds
`@angular/core` and `@angular/platform-browser` (peers), loaded lazily.
