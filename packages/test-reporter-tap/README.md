# @youneed/test-reporter-tap

A TAP version 13 reporter for [`@youneed/test`](../test) — the format `node:test`
speaks, readable by any TAP consumer / CI formatter.

```ts
import { TapReporter } from "@youneed/test-reporter-tap";
TestApplication().addTests(...).reporter(new TapReporter()).run();
```

```
TAP version 13
ok 1 - Math > adds
not ok 2 - Math > divides
  ---
  message: "expected 2 to be 3"
  ...
1..2
```

Via the CLI: `youneed-test --reporter tap`. The default export is the reporter
class (so the CLI can load it by name).
