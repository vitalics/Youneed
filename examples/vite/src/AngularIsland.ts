// 🅰️ Angular island — the Angular twin of ReactIsland / VueIsland / OurIsland.
//
// The integration is the SAME story as React/Vue: <dom-stepper> is a standard
// Custom Element, so Angular embeds and drives it with built-in tools, no glue:
//   • `schemas: [CUSTOM_ELEMENTS_SCHEMA]` tells Angular's template compiler that a
//     dashed tag it doesn't recognise is a Custom Element (not a typo'd component);
//   • `[value]="val()"` is a PROPERTY binding → sets `el.value` (our
//     `@Component.prop() value`), NOT an attribute;
//   • `(change)="onChange($event)"` listens for the bubbling `change` CustomEvent
//     the stepper emits.
//
// Like the Vue card, `[value]` is bound to the reactive mirror `val` (not the
// constant `start`), so re-applying it on each change is a no-op instead of
// fighting the stepper. State is a signal → zoneless change detection (no zone.js,
// like the repo's Angular bench). `start` is read from the host element's
// attribute, so the same component works from SSR-seeded markup.
//
// NOTE on build: Angular uses LEGACY (`experimentalDecorators`) decorators, which
// cannot share an esbuild pass with our TC39 `@Component.prop` — that's why the
// Angular variant compiles through `@analogjs/vite-plugin-angular` (a separate
// compilation), while `<dom-stepper>` keeps going through `domFramework()`. See
// README → "Angular island".
import { Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, inject, signal } from "@angular/core";

@Component({
  selector: "ng-island",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="card">
      <h3>🅰️ Angular island</h3>
      <p>Angular state mirrors the Web Component: <b>{{ val() }}</b></p>
      <dom-stepper [value]="val()" (change)="onChange($event)"></dom-stepper>
    </div>
  `,
})
export class AngularIsland {
  /** Mirror of the stepper's value. A signal → zoneless CD re-renders on set. */
  readonly val = signal(0);

  constructor() {
    const host = inject(ElementRef).nativeElement as HTMLElement;
    this.val.set(Number(host.getAttribute("start") ?? 0)); // seed from SSR markup
  }

  onChange(e: Event) {
    this.val.set((e as CustomEvent<number>).detail); // mirror the stepper's state
  }
}
