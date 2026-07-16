// ── @youneed/server-plugin-mailer — transactional email with pluggable transports ─
//
// A backend-agnostic mailer contract: a `MailTransport` sends a `MailMessage`.
// The transport is chosen by adapter:
//   • smtpTransport  (built-in)                     → any SMTP server, dependency-free.
//   • sesTransport   (./ses)                        → AWS SES v2 (SigV4-signed HTTP).
//   • sendgridTransport (./sendgrid)                → SendGrid v3 HTTP API.
//   • postmarkTransport (./postmark)                → Postmark HTTP API.
//
// `mailer(transport)` is a ServerPlugin: it wraps the transport to record a ring
// buffer of recent sends (for the devtools tab) and — when
// `@youneed/server-plugin-devtools` is mounted — surfaces a Mailer node on the
// flow graph, its own header tab, and a compose/send panel (via `inspect()` +
// internal routes).
//
//   import { mailer } from "@youneed/server-plugin-mailer";
//   import { smtpTransport } from "@youneed/server-plugin-mailer/smtp";
//
//   const app = Application().plugin(mailer(
//     smtpTransport({ host: "smtp.acme.dev", port: 587, auth: { user, pass }, from: "no-reply@acme.dev" }),
//   ));
//   // send from anywhere — pass the SAME transport (or the plugin's `.transport`) so sends are tracked.

import { Response } from "@youneed/server";
import type { Context, ServerPlugin } from "@youneed/server";

/** A message to send. `to`/`cc`/`bcc` accept a single address or a list. */
export interface MailMessage {
  /** `From` address. If omitted, the transport's default `from` is used. */
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  /** Extra RFC 5322 headers. */
  headers?: Record<string, string>;
}

/** The result of a send — provider message id + the recipients it accepted. */
export interface MailResult {
  id?: string;
  accepted?: string[];
}

/** A pluggable email transport. Build your own, or use the built-in / subpath ones. */
export interface MailTransport {
  /** Transport name (smtp / ses / sendgrid / postmark / …) — shown in devtools. */
  readonly name: string;
  send(msg: MailMessage): Promise<MailResult>;
}

// re-export the built-in SMTP transport so `import { smtpTransport } from "@youneed/server-plugin-mailer"` works too.
export { smtpTransport, buildMime, type SmtpTransportOptions } from "./smtp.ts";

const asList = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** One recorded send, surfaced to devtools. */
export interface SendRecord {
  at: number;
  to: string;
  subject: string;
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Wrap a {@link MailTransport} to record activity (a ring buffer of recent sends
 * + sent/failed counts) for the devtools view. Pass the SAME instance to
 * `mailer(...)` and to your own send sites so all traffic is tracked.
 */
export class TrackedTransport implements MailTransport {
  readonly #backend: MailTransport;
  readonly #recentMax: number;
  readonly #recent: SendRecord[] = [];
  #sent = 0;
  #failed = 0;

  constructor(backend: MailTransport, opts: { recent?: number } = {}) {
    this.#backend = backend;
    this.#recentMax = opts.recent ?? 25;
  }

  get name(): string {
    return this.#backend.name;
  }
  get sent(): number {
    return this.#sent;
  }
  get failed(): number {
    return this.#failed;
  }

  #record(rec: SendRecord): void {
    this.#recent.push(rec);
    if (this.#recent.length > this.#recentMax) this.#recent.shift();
  }

  async send(msg: MailMessage): Promise<MailResult> {
    const to = asList(msg.to).join(", ");
    try {
      const result = await this.#backend.send(msg);
      this.#sent += 1;
      this.#record({ at: Date.now(), to, subject: msg.subject, ok: true, id: result.id });
      return result;
    } catch (err) {
      this.#failed += 1;
      this.#record({ at: Date.now(), to, subject: msg.subject, ok: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  /** Snapshot of the recent-sends ring buffer (newest last). */
  recent(): SendRecord[] {
    return [...this.#recent];
  }
}

export interface MailerPluginOptions {
  /** Internal route prefix (default `"/__mailer"`). */
  basePath?: string;
  /** Mount the devtools introspection + send routes (default true). */
  exposeDevtools?: boolean;
}

/** The `inspect()` payload — devtools detects the mailer by `kind === "mailer"`. */
export interface MailerInspect {
  kind: "mailer";
  backend: string;
  sent: number;
  failed: number;
  recent: SendRecord[];
  endpoints: { recent: string; send: string };
}

/**
 * Mount a mailer as a ServerPlugin. Pass a {@link MailTransport} — it is wrapped
 * in a {@link TrackedTransport} (unless it already is one) so sends are recorded.
 * Exposes `GET {basePath}/recent` and `POST {basePath}/send {to,subject,text?,html?}`,
 * and an `inspect()` so devtools can draw the flow-graph node, header tab and
 * compose form. Reach the tracked transport via the returned `.transport`.
 */
export function mailer(transport: MailTransport, opts: MailerPluginOptions = {}): ServerPlugin & { transport: TrackedTransport } {
  const tracked = transport instanceof TrackedTransport ? transport : new TrackedTransport(transport);
  const basePath = (opts.basePath ?? "/__mailer").replace(/\/$/, "");
  const endpoints = { recent: `${basePath}/recent`, send: `${basePath}/send` };

  return {
    name: "mailer",
    transport: tracked,
    setup(app) {
      if (opts.exposeDevtools === false) return;
      app.get(endpoints.recent, () => Response.json({ sends: tracked.recent() }));
      app.post(endpoints.send, async (ctx: Context) => {
        const body = (ctx.body ?? {}) as { to?: string | string[]; subject?: string; text?: string; html?: string };
        if (!body.to || !body.subject) return Response.json({ error: "to and subject are required" }, { status: 400 });
        try {
          const result = await tracked.send({ to: body.to, subject: body.subject, text: body.text, html: body.html });
          return Response.json({ ok: true, id: result.id });
        } catch (err) {
          return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
        }
      });
    },
    inspect(): MailerInspect {
      return { kind: "mailer", backend: tracked.name, sent: tracked.sent, failed: tracked.failed, recent: tracked.recent(), endpoints };
    },
  };
}

/** Convenience: wrap a {@link MailTransport} in a {@link TrackedTransport}. */
export function createMailer(transport: MailTransport, opts?: { recent?: number }): TrackedTransport {
  return new TrackedTransport(transport, opts);
}
