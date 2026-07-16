// `emit` — the bridge's outward-event primitive, in one call for both worlds.
//
// Angular speaks events through `@Output()` EventEmitters; the DOM (and a
// `@youneed/dom` tree) speaks them through `CustomEvent`. `emit` dispatches to
// whichever the target is:
//
//   import { emit } from "@youneed/dom-adapter-angular";
//
//   emit(this.select, row)                       // an Angular @Output / EventEmitter
//   emit(hostEl, { type: "select", detail: row }) // a fromAngular host element (or any node)
//   emit(hostEl, "close")                          // shorthand: a bare event type, no detail
//
// • Target with an `emit()` method (Angular `EventEmitter`, RxJS `Subject`) → its
//   `.emit(payload)` is called. Inside a `fromAngular`-wrapped component this fires
//   the matching `@Output`, which the host then re-dispatches as a DOM event.
// • Target that is an `EventTarget` (the `fromAngular` host element, or any node) →
//   a bubbling, composed `CustomEvent` is dispatched. Pass a ready `Event`, a
//   `{ type, detail?, bubbles?, composed? }` descriptor, or a bare type string.
//
// Returns `dispatchEvent`'s boolean for the DOM path (false ⇒ a listener called
// `preventDefault`), and `undefined` for the EventEmitter path.

/** Anything with an Angular/RxJS-style `emit` method. */
interface Emitter {
  emit(value?: unknown): void;
}

/** A DOM-event descriptor (or a bare type string) for the `EventTarget` path. */
export type EmitPayload =
  | Event
  | string
  | { type: string; detail?: unknown; bubbles?: boolean; composed?: boolean };

/** Fire a value on an Angular `@Output()`/EventEmitter. */
export function emit(target: Emitter, payload?: unknown): undefined;
/** Dispatch a DOM `CustomEvent` from a host element (or any `EventTarget`). */
export function emit(target: EventTarget, payload: EmitPayload): boolean;
export function emit(target: Emitter | EventTarget, payload?: unknown): boolean | undefined {
  // EventEmitter / Subject first — it's the more specific shape.
  if (isEmitter(target)) {
    target.emit(payload);
    return undefined;
  }
  if (isEventTarget(target)) {
    return target.dispatchEvent(toEvent(payload as EmitPayload));
  }
  throw new TypeError("emit: target is neither an EventEmitter nor an EventTarget");
}

// ── internals ───────────────────────────────────────────────────────────────

function isEmitter(target: unknown): target is Emitter {
  return typeof (target as { emit?: unknown } | null)?.emit === "function";
}

function isEventTarget(target: unknown): target is EventTarget {
  return typeof (target as { dispatchEvent?: unknown } | null)?.dispatchEvent === "function";
}

function toEvent(payload: EmitPayload): Event {
  if (payload instanceof Event) return payload;
  if (typeof payload === "string") {
    return new CustomEvent(payload, { bubbles: true, composed: true });
  }
  const { type, detail, bubbles = true, composed = true } = payload;
  return new CustomEvent(type, { detail, bubbles, composed });
}
