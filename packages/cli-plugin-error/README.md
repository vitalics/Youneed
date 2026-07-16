# @youneed/cli-plugin-error

Error-formatting plugin for [`@youneed/cli`](../cli). Hooks the `onError`
lifecycle to turn an exception thrown by a command into a readable stderr block —
a red header, the message, an optional `hint` / `code` carried on the error, and a
stack trace when debugging.

```ts
import { Application } from "@youneed/cli";
import { errorReporter, CliError } from "@youneed/cli-plugin-error";

Application({
  name: "ops",
  commands: [/* … */],
  plugins: [errorReporter()],
}).run();

// In a command, throw a CliError for richer output:
throw new CliError("config not found", {
  code: "ENOENT",
  hint: "run `ops init` first",
});
// ✖ config not found [ENOENT]
//   hint: run `ops init` first
```

Any thrown value works; an error carrying `.hint` / `.code` (such as `CliError`)
gets the extra lines. The stack trace is shown according to the `stack` option —
by default only when `DEBUG` / `YOUNEED_DEBUG` is set in the environment.

## Exports

- **`errorReporter(options?)`** — the plugin. Formats command errors on stderr.
- **`CliError`** — `Error` subclass that carries `hint` and `code`
  (`new CliError(message, { hint?, code?, cause? })`).
- Type: **`ErrorReporterOptions`**.

## Options

- **`stack`** — show the stack trace: `true` / `false`, or `"auto"` (default —
  shown when `DEBUG` / `YOUNEED_DEBUG` is set).
- **`format(error, info)`** — replace the whole formatter; return the stderr
  string.
