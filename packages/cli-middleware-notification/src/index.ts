// @youneed/cli-middleware-notification — desktop notifications for @youneed/cli.
//
//   class Build extends Command("build", { middleware: [notifications()] }) {
//     async execute() {
//       await doWork();
//       await this.notify.success("Build complete");   // OS notification
//     }
//   }
//
// `this.notify` sends OS-level desktop notifications via `node-notifier`. That
// dependency is an OPTIONAL peer — it's loaded lazily, so a CLI that uses this
// middleware still works without it: notifications degrade to a terminal bell.
// The backend is injectable (`notifications({ notifier })`) so tests, and any
// alternative transport, can replace node-notifier entirely.

import { contribute, type CliMiddleware } from "@youneed/cli";

/** A single notification. */
export interface NotificationSpec {
  /** Bold heading (defaults to the program name). */
  title?: string;
  /** Body text. */
  message: string;
  /** macOS subtitle. */
  subtitle?: string;
  /** Play a sound (true = default sound, or a named sound). */
  sound?: boolean | string;
  /** Path/URL to an icon image. */
  icon?: string;
  /** Wait for the user to act on / dismiss the notification. */
  wait?: boolean;
  /** Auto-dismiss timeout in seconds. */
  timeout?: number;
}

/** The pluggable delivery backend. */
export interface Notifier {
  notify(spec: NotificationSpec): Promise<void>;
}

// Lazily loaded `node-notifier.notify`, or null if the package isn't installed.
// A non-literal specifier keeps TypeScript from requiring the module at build.
let loaded: Promise<((spec: NotificationSpec) => Promise<void>) | null> | undefined;
function loadNodeNotifier(): Promise<((spec: NotificationSpec) => Promise<void>) | null> {
  if (loaded) return loaded;
  const specifier = "node-notifier";
  loaded = import(specifier)
    .then((mod: { default?: unknown } & Record<string, unknown>) => {
      const nn = (mod.default ?? mod) as { notify: (opts: unknown, cb?: () => void) => void };
      if (typeof nn?.notify !== "function") return null;
      return (spec: NotificationSpec) =>
        new Promise<void>((resolve) => {
          nn.notify(
            {
              title: spec.title,
              message: spec.message,
              subtitle: spec.subtitle,
              sound: spec.sound,
              icon: spec.icon,
              wait: spec.wait,
              timeout: spec.timeout,
            },
            () => resolve(),
          );
        });
    })
    .catch(() => null);
  return loaded;
}

/** A {@link Notifier} that just rings the terminal bell — the no-dependency fallback. */
export function bellNotifier(): Notifier {
  return {
    async notify() {
      if (typeof process !== "undefined") process.stderr.write("\x07");
    },
  };
}

/**
 * The default {@link Notifier}: delivers via `node-notifier` if it's installed,
 * otherwise rings the terminal bell (so the CLI works either way).
 */
export function nodeNotifier(): Notifier {
  const bell = bellNotifier();
  return {
    async notify(spec) {
      const send = await loadNodeNotifier();
      if (send) return send(spec);
      return bell.notify(spec);
    },
  };
}

/** The `this.notify` surface contributed by {@link notifications}. */
export interface NotifyApi {
  /** Send a fully-specified notification. */
  send(spec: NotificationSpec): Promise<void>;
  /** Informational notification (no sound). */
  info(message: string, title?: string): Promise<void>;
  /** Success notification (no sound). */
  success(message: string, title?: string): Promise<void>;
  /** Warning notification (sound). */
  warn(message: string, title?: string): Promise<void>;
  /** Error notification (sound). */
  error(message: string, title?: string): Promise<void>;
}

/** Options for {@link notifications}. */
export interface NotificationOptions {
  /** Delivery backend. Defaults to {@link nodeNotifier}. */
  notifier?: Notifier;
  /** Default title for every notification. Defaults to the program name. */
  title?: string;
  /** Default icon for every notification. */
  icon?: string;
}

/**
 * Notification middleware. Adds `this.notify` — `send` for the full spec, plus
 * `info`/`success`/`warn`/`error` shortcuts (warn/error play a sound). Titles
 * default to the program name; the backend defaults to node-notifier.
 */
export function notifications(
  options: NotificationOptions = {},
): CliMiddleware<{ readonly notify: NotifyApi }> {
  return {
    name: "notification",
    install(ctx) {
      const notifier = options.notifier ?? nodeNotifier();
      const baseTitle = options.title ?? ctx.program.name;
      const send = (spec: NotificationSpec): Promise<void> => {
        const full: NotificationSpec = { ...spec, title: spec.title ?? baseTitle };
        if (full.icon === undefined && options.icon !== undefined) full.icon = options.icon;
        return notifier.notify(full);
      };
      const level =
        (sound: boolean) =>
        (message: string, title?: string): Promise<void> =>
          send({ message, title, sound });
      const api: NotifyApi = {
        send,
        info: level(false),
        success: level(false),
        warn: level(true),
        error: level(true),
      };
      contribute(ctx.command, "notify", api);
    },
  };
}
