# @youneed/test-reporter-junit

Writes a JUnit XML report for [`@youneed/test`](../test) — the de-facto CI format
(Jenkins/GitLab/GitHub/…), grouped by suite, with `<failure>`/`<skipped/>`.

```ts
import { JUnitReporter } from "@youneed/test-reporter-junit";
TestApplication().addTests(...).reporter(new JUnitReporter({ output: "junit.xml" })).run();
```

Options: `output` (file; omit to only `render()` the XML string) and `name`
(the `<testsuites>` name). Via the CLI:
`youneed-test --reporter junit --output junit.xml`.
