# shad — @youneed/dom-ui-shad (shadcn-style component library)

A shadcn/ui-style library on `@youneed/dom` — Custom Elements + Shadow DOM styled with
**Tailwind**. Like shadcn, components aren't a black box: a CLI **copies the source into your
project** so you own and customize them. (Named `shad` to avoid the shadcn trademark.)

## Two ways to use it

**1. Own the source (the shadcn way) — the `shad` CLI:**
```bash
npx shad init                 # create shad.json + copy the shared lib
npx shad add button badge     # copy components into your project
npx shad list                 # see what's available
```
Files land under your configured `dir` (default `src/components`), preserving `ui/` + `lib/`:
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

## Tailwind in Shadow DOM (required setup)

Global Tailwind can't cross a shadow boundary, so each component **adopts** a compiled Tailwind
stylesheet. Compile Tailwind, import it as text, register once at startup:
```ts
import { registerTailwind } from "@youneed/dom-ui-shad";      // or "./components/lib/shad.ts"
import tailwind from "./tailwind.gen.css";                    // esbuild: loader {".css":"text"} · Vite: ?raw
registerTailwind(tailwind);
```
Make sure the Tailwind build scans the component files for the utilities they use (esbuild
`@source`, or Tailwind v4 content detection). Full pattern: `examples/tailwind`.

**Gotchas (from hard-won experience):**
- Tailwind v4 `@property` must be registered at the **document** level or `border`/utilities
  break inside Shadow DOM (Chromium).
- `::slotted` margin/padding loses to the slotted element's preflight → needs `!important`.
- Slotted-icon sizing only via `::slotted(svg)`, not `[&>svg]`.

## Theming (shadcn-style tokens)

Colors are **CSS-variable tokens**; custom properties inherit *through* shadow boundaries, so
`:root` tokens reach inside every component.
1. Load `theme.css` (the `:root` / `.dark` tokens) at the **document level** (`<link>`/`<style>`
   in `<head>` — not adopted into a shadow root). `shad init` copies it for you.
2. Map semantic utilities to the vars in your Tailwind entry so `bg-primary`, `text-foreground`,
   `border-border`, … exist:
   ```css
   @theme inline {
     --color-background: hsl(var(--background));
     --color-primary: hsl(var(--primary));
     --color-primary-foreground: hsl(var(--primary-foreground));
     /* …secondary, muted, accent, destructive, border, input, ring… */
   }
   ```
3. Toggle dark mode: `document.documentElement.classList.toggle("dark")` — or drive it with
   `@youneed/dom-provider-color-scheme` (see `references/providers.md`).

Components use semantic utilities (`bg-primary`, `text-muted-foreground`, …), so editing tokens
restyles them everywhere.

## Using the components

Custom elements — drop into any HTML, React or Vue:
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
`variant` / `size` etc. are reflected attributes (`@Component.prop({ attribute: true })`), so
they work from markup, React or Vue with no glue. See the package README's table for the full
component + prop list (button, badge, input, card, and more). There is also a `shad-data-table`
primitive; table primitives in Shadow DOM use CSS `table-display` + `slot{display:contents}`.
