# @youneed/dom-provider-a11y

Accessibility helpers for [`@youneed/dom`](../dom) components, exposed under a
single namespaced object — **`this.a11y`** — so they read as the provider's
(like `this.i18n`), not as native `HTMLElement` / `Component` members.

```ts
import { Component, html } from "@youneed/dom";
import { a11yProvider } from "@youneed/dom-provider-a11y";

class Dialog extends Component("x-dialog", { providers: [a11yProvider()] }) {
  onMount() {
    this.onCleanup(this.a11y.trapFocus()); // Tab stays inside; focus restored on close
    this.a11y.announce("Dialog opened");   // spoken by screen readers
  }
  render() {
    return html`<button>OK</button><button>Cancel</button>`;
  }
}
```

It plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to the
other providers (`i18nProvider`, `directionProvider`, `colorSchemeProvider`).

## `this.a11y`

| Member | meaning |
| --- | --- |
| `announce(msg, politeness?)` | speak `msg` via a shared ARIA live region (`"polite"` default, `"assertive"` interrupts) |
| `trapFocus()` | trap Tab focus inside the component; returns a release that restores prior focus (auto-released on disconnect) |
| `releaseFocus()` | release the current focus trap |
| `focusFirst()` | focus the first focusable descendant; `false` if none |
| `setTabIndex(value, target?)` | set `tabindex` on `target` (default the host) |
| `makeFocusable(target?)` / `makeUnfocusable(target?)` | `tabindex=0` / `tabindex=-1` |
| `roving(items, options?)` | roving-tabindex keyboard nav: one item tabbable, arrows move focus |
| `prefersReducedMotion` | the OS reduce-motion preference, reactive (reflected as `data-reduced-motion`) |

## Keyboard navigation (roving tabindex)

`roving` makes a widget keyboard-operable without a mouse: only the active item
is in the Tab order (`tabindex=0`), the rest are `-1`, and arrow keys / Home /
End move focus between them.

```ts
class Toolbar extends Component("x-toolbar", { providers: [a11yProvider()] }) {
  onMount() {
    this.a11y.roving("button", { orientation: "horizontal" }); // ←/→ navigate
  }
  render() {
    return html`<button>Bold</button><button>Italic</button><button>Underline</button>`;
  }
}
```

| roving option | default | meaning |
| --- | --- | --- |
| `orientation` | `"both"` | which arrows navigate (`horizontal` ←/→, `vertical` ↑/↓, `both`) |
| `loop` | `true` | wrap around at the ends |
| `initial` | `0` | which item is tabbable initially |

Returns a `RovingController` (`activeIndex`, `setActive(i)`, `destroy()`);
auto-destroyed on disconnect.

## CSS audit (reduced-motion / color-scheme)

Opt in with `{ audit: true }` and the provider checks the component's **scoped
styles** shortly after mount, warning when they aren't adaptive:

- it **animates / transitions** but ships no
  [`@media (prefers-reduced-motion: reduce)`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  variant → add one that disables or tones down the motion;
- it sets **explicit colors** but isn't
  [`color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)-aware
  (no `color-scheme` declaration and no `@media (prefers-color-scheme: …)` rule)
  → add a dark/light variant.

```ts
class Card extends Component("x-card", {
  providers: [a11yProvider({ audit: true })],
  styles: css`
    .card { transition: transform 0.2s; color: #222; }
    @media (prefers-reduced-motion: reduce) { .card { transition: none; } }
    @media (prefers-color-scheme: dark)     { .card { color: #eee; } }
  `,
}) { /* … */ }     // ← no warnings: both variants present
```

| `audit` form | meaning |
| --- | --- |
| `true` | run both checks, log via `console.warn` |
| `{ reducedMotion: false }` / `{ colorScheme: false }` | toggle one check off |
| `{ warn: fn }` | redirect findings to your own sink |

Colors via `var(--token)` or keywords (`transparent`, `currentColor`, `inherit`)
are treated as adaptive and never flagged. It's a **dev-time aid** (it only sees
a connected host's scoped sheets); the pure `auditStyleSheets(sheets, opts)` is
exported too, for tests or a build step.

## Devtools — capture (`plugin`) + display (`panel`)

`@youneed/dom-provider-a11y/devtools` follows the devtools split between
**capture** and **display**, exposing two separate APIs:

- **`a11yPlugin()`** — a `DevtoolsPlugin` (capture). Register it with
  `installDevtools({ plugins })`; it records every `announce()` call.
- **`a11yPanel()`** — a `DevtoolsPanel` (display). Mount it with
  `mountDevtoolsPanel({ panels })`; it tails the captured announcements and runs
  the CSS adaptiveness audit (reduced-motion / color-scheme) over **every**
  mounted component (not only those that opted into `audit`).

```ts
import { installDevtools, mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
import { a11yPlugin, a11yPanel } from "@youneed/dom-provider-a11y/devtools";

installDevtools({ plugins: [a11yPlugin()] });                                  // capture
mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), a11yPanel()] }); // display
```

The display half is free — `a11yPanel()` is one option, but the captured data is
also exposed directly (`a11yAnnouncements()`, `onA11yAnnouncements(fn)`,
`clearA11yAnnouncements()`) to feed any UI. `@youneed/devtools` is an optional
peer dependency (only needed for this import).

## Details

- **Announcements** use one hidden live region per politeness, appended to
  `<body>` once and reused. `announce` / `clearAnnouncer` are also exported
  standalone for use outside a component. `onAnnounce(listener)` observes them
  (the devtools tab uses it).
- **Focus trap** queries the component's render root for focusable elements,
  cycles Tab/Shift+Tab at the edges, and restores `document.activeElement` on
  release.
- **Reduced motion** reflects `data-reduced-motion` and re-renders on OS change;
  opt out with `a11yProvider({ reducedMotion: false })`.
