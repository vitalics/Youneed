# @youneed/dom-ui-shad

A shadcn/ui-style component library built on [`@youneed/dom`](../dom) — Custom
Elements + Shadow DOM, styled with **Tailwind**. Like shadcn, the components
aren't a black box: a CLI **copies the source into your project** so you own and
customize them. (Named `shad` to steer clear of the shadcn trademark.)

## Two ways to use it

**1. Own the source (the shadcn way) — seamless CLI:**

```bash
npx shad init                 # create shad.json + copy the shared lib
npx shad add button badge     # copy components into your project
npx shad list                 # see what's available
```

Files land under your configured `dir` (default `src/components`), preserving the
`ui/` + `lib/` layout:

```
src/components/
  lib/shad.ts        # cn(), tw, variants(), registerTailwind()
  ui/button.ts       # <shad-button> — yours to edit
  ui/badge.ts
```

**2. Import directly (quick start):**

```ts
import { ShadButton, registerTailwind } from "@youneed/dom-ui-shad";
```

## Setup: Tailwind in Shadow DOM

Global Tailwind CSS can't cross a shadow boundary, so each component **adopts** a
compiled Tailwind stylesheet. Compile Tailwind, import it as text, and register
it once at startup:

```ts
import { registerTailwind } from "@youneed/dom-ui-shad";   // or "./components/lib/shad.ts"
import tailwind from "./tailwind.gen.css";          // esbuild: loader {".css":"text"} · Vite: ?raw
registerTailwind(tailwind);
```

Make sure your Tailwind build scans the component files for the utility classes
they use (esbuild `@source`, or Tailwind v4's content detection). See
[`examples/tailwind`](../../examples/tailwind) for the full pattern.

## Theming (shadcn-style)

Colors are **CSS-variable tokens**, so one set of variables themes everything and
supports light/dark. The trick with Shadow DOM: custom properties **inherit
through shadow boundaries**, so tokens defined on `:root` reach inside every
component.

1. Load `theme.css` (the `:root` / `.dark` tokens) at the **document level**
   (a `<link>`/`<style>` in `<head>` — not adopted into a shadow root):

   ```html
   <link rel="stylesheet" href="./theme.css" />
   ```

2. Map the semantic utilities to those vars in your Tailwind entry, so
   `bg-primary`, `text-foreground`, `border-border`, … exist (full block in
   `theme.css`'s header):

   ```css
   @theme inline {
     --color-background: hsl(var(--background));
     --color-primary: hsl(var(--primary));
     --color-primary-foreground: hsl(var(--primary-foreground));
     /* …secondary, muted, accent, destructive, border, input, ring… */
   }
   ```

3. Toggle dark mode by adding `class="dark"` to `<html>`:

   ```js
   document.documentElement.classList.toggle("dark");
   ```

The components are written with semantic utilities (`bg-primary`,
`text-muted-foreground`, `border-border`, …), so editing the tokens — or shipping
your own brand palette — restyles them everywhere. `shad init` copies `theme.css`
for you.

## Use the components

They're custom elements — drop them in any HTML, or inside React/Vue:

```html
<shad-button variant="outline" size="sm">Click me</shad-button>
<shad-badge variant="destructive">Beta</shad-badge>
<shad-input placeholder="Email" />
<shad-card>
  <span slot="title">Title</span>
  Body content…
  <shad-button slot="footer">Save</shad-button>
</shad-card>
```

`variant` / `size` etc. are reflected attributes (`@Component.prop({ attribute: true })`),
so they work from markup, React or Vue with no glue.

## Components

| Component | Tag | Props |
| --- | --- | --- |
| Button | `<shad-button>` | `variant` (default·secondary·destructive·outline·ghost·link), `size` (default·sm·lg·icon), `disabled` |
| Badge | `<shad-badge>` | `variant` (default·secondary·destructive·outline) |
| Card | `<shad-card>` | slots: `title`, `description`, default, `footer` |
| Input | `<shad-input>` | `type`, `placeholder`, `value`, `disabled`; emits `input` |
| Label | `<shad-label>` | slot |
| Separator | `<shad-separator>` | `orientation` (horizontal·vertical) |
| Skeleton | `<shad-skeleton>` | sized on the host |
| Avatar | `<shad-avatar>` | `src`, `alt`; slot = fallback |
| Alert | `<shad-alert>` | `variant` (default·destructive); slots: `icon`, `title`, default |
| Switch | `<shad-switch>` | `checked`, `disabled`; emits `change` |
| Checkbox | `<shad-checkbox>` | `checked`, `disabled`; emits `change` |
| Textarea | `<shad-textarea>` | `placeholder`, `value`, `rows`, `disabled`; emits `input` |
| Progress | `<shad-progress>` | `value` (0–100) |
| Toggle | `<shad-toggle>` | `pressed`, `variant` (default·outline), `size`, `disabled`; emits `change` |
| Tabs | `<shad-tabs>` + `<shad-tab>` | `value`; tab `value`/`title` |
| Accordion | `<shad-accordion>` + `<shad-accordion-item>` | `type` (single·multiple); item `title`/`open` |
| Select | `<shad-select>` + `<shad-option>` | `value`, `placeholder`; emits `change` |
| Dialog | `<shad-dialog>` | `open`, `.show()`/`.close()`; emits `close`; slots: `title`, `description`, default, `footer` |
| Tooltip | `<shad-tooltip>` | `text`; slot = trigger |
| Calendar | `<shad-calendar>` | `value` (ISO date); emits `change` |

## Helpers (`lib/shad.ts`)

- `cn(...inputs)` — clsx-lite class merge (strings, arrays, `{ class: cond }`).
- `variants(base, groups, defaults)` — cva-lite variant resolver.
- `tw` + `registerTailwind(css, { strategy }?)` — the shared adopted Tailwind
  sheet. For SSR, `strategy` picks how each shadow root is styled — a trade-off
  of HTML size vs. when styles paint (FOUC) vs. network:

  | `strategy` | output | FOUC | network |
  | --- | --- | --- | --- |
  | `"critical"` *(default)* | only the utilities each root uses + prerequisites | none | none |
  | `"fouc"` | CSS once per document, every root references it (`shadowrootadoptedstylesheets`) | until hydration¹ | none |
  | `"lazy"` | shadow-scoped `<link href>` (needs `href`) | until fetched (cold) | one cached request |
  | `"inline"` | full sheet verbatim into every root | none | none |

  ¹ and pre-paint once browsers ship the attribute. `"fouc"` accepts that flash
  in exchange for zero duplication and the smallest HTML — hence the name.
  After hydration every component shares one constructable sheet regardless.

> `cn` doesn't de-dupe conflicting utilities like `tailwind-merge`; swap it in
> inside `lib/shad.ts` if you need that — it's your file now.

## CLI reference

```
shad init [dir]        create shad.json (dir, default src/components) + copy lib
shad add <name...>     copy components and their registry dependencies
shad list              list available components
```
