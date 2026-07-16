# @youneed/cli-middleware-notification

Desktop notifications for [`@youneed/cli`](../cli) commands. Install the
middleware and your command gains **`this.notify`** — send OS-level notifications
with a full spec via `send`, or use the `info`/`success`/`warn`/`error`
shortcuts. Delivery goes through [`node-notifier`](https://www.npmjs.com/package/node-notifier),
which is an **optional** peer dependency: it's loaded lazily, so a CLI that uses
this middleware still works without it — notifications degrade to a terminal bell.
The backend is injectable, so tests (and any alternative transport) can replace
node-notifier entirely.

```ts
import { Application, Command } from "@youneed/cli";
import { notifications } from "@youneed/cli-middleware-notification";

class Build extends Command("build", { middleware: [notifications()] }) {
  async execute() {
    await doWork();
    await this.notify.success("Build complete");          // OS notification, no sound
    // or, fully specified:
    await this.notify.send({ message: "Deployed", subtitle: "prod", sound: true });
  }
}

Application({ name: "ci", commands: [Build] });
```

## `this.notify`

- **`send(spec)`** — send a fully-specified `NotificationSpec`. Title defaults to
  the program name; the configured default icon is applied when none is given.
- **`info(message, title?)`** / **`success(message, title?)`** — informational
  notifications (no sound).
- **`warn(message, title?)`** / **`error(message, title?)`** — notifications that
  play a sound.

### `NotificationSpec`

`{ title?, message, subtitle?, sound?, icon?, wait?, timeout? }` — `subtitle` is
macOS-only, `sound` is `true`/a named sound, `wait` blocks until the user acts,
`timeout` auto-dismisses after N seconds.

## Options

`notifications(options?)`:

- **`notifier`** — the delivery `Notifier` backend. Defaults to `nodeNotifier()`.
- **`title`** — default title for every notification. Defaults to the program name.
- **`icon`** — default icon for every notification.

## Exports

- **`notifications(options?)`** — the middleware factory. Contributes `this.notify`.
- **`nodeNotifier()`** — the default `Notifier`: delivers via node-notifier when
  installed, otherwise rings the terminal bell.
- **`bellNotifier()`** — a `Notifier` that only rings the terminal bell (the
  no-dependency fallback; handy for tests).
- **`NotifyApi`**, **`Notifier`**, **`NotificationSpec`**, **`NotificationOptions`**
  — types.
