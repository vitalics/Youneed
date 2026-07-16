# @youneed/test-snapshot

Snapshot testing for [`@youneed/test`](../test) as a plugin.

```ts
import { snapshot, toMatchSnapshot } from "@youneed/test-snapshot";

class Render extends Test() {
  @Test.it() tree() { toMatchSnapshot(buildTree()); }
}

TestApplication().addTests(Render).use(snapshot()).run();
```

First run writes `__snapshots__/<Suite>.snap.json`; later runs compare and throw
an `AssertionError` on mismatch. Update with `snapshot({ update: true })` or
`YOUNEED_UPDATE_SNAPSHOTS=1`.

- `snapshot({ dir?, update? })` — the plugin (`.use(...)`); tracks the current
  test so `toMatchSnapshot` knows its key.
- `toMatchSnapshot(value, hint?)` — auto-keyed by `<test name> <n>`; pass `hint`
  to disambiguate multiple snapshots in one test.
