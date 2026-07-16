# @youneed/dom vs React — fine-grained updates

The axis where `@youneed/dom` beats idiomatic React: updating **one** cell of a
grid. Same data, three renderers, total renders counted live.

Measured over ~2.5s of one-cell-at-a-time updates (40-cell grid):

| panel | total renders | why |
| --- | --- | --- |
| **React (state up)** | **~19,900** | array in a parent → `setState` re-renders the whole subtree, so every cell re-renders for a 1-cell change |
| React (memo) | ~540 | the fix: `React.memo` + stable props on every cell → only the changed cell re-renders (manual, easy to break) |
| **@youneed/dom** | **~540** | each cell is its own component subscribed to its slot → only the changed cell re-renders, **by default — no memo** |

Takeaway: plain React does **~37× the work**; `@youneed/dom` equals hand-optimized
React for free. Web-component isolation (each custom element renders
independently) means an update never cascades into siblings — there's no whole-
subtree re-render to memo away in the first place.

```sh
pnpm examples:serve:dom-vs-react   # → http://localhost:8080
```
