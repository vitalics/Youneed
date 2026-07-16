// @youneed/cli — the render context.
//
// While the runner is rendering a command, it makes that command (a
// ReactiveHost) the "current host". Stateful directives like `flow.await` read
// it to register their promise against the host — so they can trigger a repaint
// when the promise settles and keep the run alive until it does. The dom
// equivalent is the reactive base a directive's Part is attached to; here a
// terminal render is a flat call, so we thread the host through a module global
// that's set only for the synchronous span of a `render()` call.

import type { ReactiveHost } from "./task.ts";

let current: ReactiveHost | undefined;

/** The host being rendered right now, or `undefined` outside a render. */
export function currentHost(): ReactiveHost | undefined {
  return current;
}

/** Run `fn` with `host` as the current render host, restoring the previous one. */
export function withHost<T>(host: ReactiveHost, fn: () => T): T {
  const previous = current;
  current = host;
  try {
    return fn();
  } finally {
    current = previous;
  }
}
