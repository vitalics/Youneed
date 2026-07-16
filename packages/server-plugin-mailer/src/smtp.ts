// ── @youneed/server-plugin-mailer/smtp — a dependency-free SMTP transport ─────
//
// A minimal SMTP client (node:net + node:tls) exposed as a `MailTransport`.
// Supports implicit TLS (`secure: true`, port 465), STARTTLS upgrade (port 587),
// AUTH LOGIN, and a MIME builder covering to/cc/bcc/subject/text/html.
// Adapted from `@youneed/server-plugin-otp/email`.

import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import type { MailMessage, MailResult, MailTransport } from "./index.ts";

export interface SmtpTransportOptions {
  host: string;
  /** Default 465 when `secure`, else 587. */
  port?: number;
  /** Implicit TLS (port 465). Otherwise plaintext + opportunistic STARTTLS. */
  secure?: boolean;
  /** SMTP AUTH LOGIN credentials. */
  auth?: { user: string; pass: string };
  /** Default `From` address (e.g. `"Acme <no-reply@acme.dev>"`) when a message omits one. */
  from?: string;
  /** Require STARTTLS when not `secure` (default: upgrade only if advertised). */
  requireTls?: boolean;
  /** EHLO name (default "localhost"). */
  clientName?: string;
  /** Socket timeout ms (default 10000). */
  timeoutMs?: number;
}

const addr = (s: string): string => /<([^>]+)>/.exec(s)?.[1] ?? s.trim();
const list = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Build a MIME message (RFC 5322) for a {@link MailMessage}. Emits
 * `From`/`To`/`Cc`/`Subject`, custom headers, and either a text or an html body
 * (multipart/alternative when both are present). `Bcc` is intentionally NOT
 * written to the headers (it is envelope-only). Exported for testing.
 */
export function buildMime(msg: MailMessage, from: string): string {
  const headers: string[] = [
    `From: ${from}`,
    `To: ${list(msg.to).join(", ")}`,
  ];
  if (msg.cc && list(msg.cc).length) headers.push(`Cc: ${list(msg.cc).join(", ")}`);
  if (msg.replyTo) headers.push(`Reply-To: ${msg.replyTo}`);
  headers.push(`Subject: ${msg.subject}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push("MIME-Version: 1.0");
  for (const [k, v] of Object.entries(msg.headers ?? {})) headers.push(`${k}: ${v}`);

  const stuff = (body: string): string =>
    body
      .replace(/\r?\n/g, "\r\n")
      .split("\r\n")
      .map((l) => (l.startsWith(".") ? "." + l : l))
      .join("\r\n");

  if (msg.text != null && msg.html != null) {
    const boundary = `=_yn_${Math.random().toString(36).slice(2)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      stuff(msg.text),
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      stuff(msg.html),
      `--${boundary}--`,
    ];
    return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  const html = msg.html != null;
  headers.push(`Content-Type: text/${html ? "html" : "plain"}; charset=utf-8`);
  return headers.join("\r\n") + "\r\n\r\n" + stuff(msg.html ?? msg.text ?? "");
}

interface SmtpResponse {
  code: number;
  text: string;
}

/** Send one message over SMTP. Resolves with the accepted recipients; throws on any non-OK reply. */
function send(opts: SmtpTransportOptions, msg: MailMessage): Promise<MailResult> {
  const from = msg.from ?? opts.from;
  if (!from) return Promise.reject(new Error("mailer/smtp: no `from` (set transport `from` or message `from`)"));
  const recipients = [...list(msg.to), ...list(msg.cc), ...list(msg.bcc)];
  if (recipients.length === 0) return Promise.reject(new Error("mailer/smtp: no recipients"));
  const data = buildMime(msg, from);

  return new Promise<MailResult>((resolve, reject) => {
    let socket: Socket | TLSSocket = opts.secure
      ? tlsConnect({ host: opts.host, port: opts.port ?? 465, servername: opts.host })
      : createConnection({ host: opts.host, port: opts.port ?? 587 });

    let buf = "";
    const responses: SmtpResponse[] = [];
    const waiters: Array<(r: SmtpResponse) => void> = [];
    let settled = false;

    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      reject(e instanceof Error ? e : new Error(String(e)));
    };

    const deliver = (r: SmtpResponse) => {
      const w = waiters.shift();
      if (w) w(r);
      else responses.push(r);
    };

    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      for (;;) {
        const lines = buf.split("\r\n");
        let end = -1;
        for (let i = 0; i < lines.length - 1; i++)
          if (/^\d{3} /.test(lines[i])) {
            end = i;
            break;
          }
        if (end === -1) break;
        deliver({ code: Number(lines[end].slice(0, 3)), text: lines.slice(0, end + 1).join("\n") });
        buf = lines.slice(end + 1).join("\r\n");
      }
    };

    const attach = (s: Socket | TLSSocket) => {
      s.on("data", onData);
      s.on("error", fail);
      s.setTimeout(opts.timeoutMs ?? 10_000, () => fail(new Error("SMTP timeout")));
    };

    const expect = (): Promise<SmtpResponse> => {
      const queued = responses.shift();
      return queued ? Promise.resolve(queued) : new Promise((res) => waiters.push(res));
    };

    const cmd = async (line: string, ok: number[]): Promise<SmtpResponse> => {
      socket.write(line + "\r\n");
      const r = await expect();
      if (!ok.includes(r.code)) throw new Error(`SMTP "${line.split(" ")[0]}" → ${r.text}`);
      return r;
    };

    const run = async () => {
      attach(socket);
      const greeting = await expect();
      if (greeting.code !== 220) throw new Error(`SMTP greeting → ${greeting.text}`);

      const ehlo = `EHLO ${opts.clientName ?? "localhost"}`;
      let r = await cmd(ehlo, [250]);

      if (!opts.secure && /STARTTLS/i.test(r.text)) {
        await cmd("STARTTLS", [220]);
        socket.removeListener("data", onData);
        const raw = socket;
        socket = tlsConnect({ socket: raw, servername: opts.host });
        attach(socket);
        await new Promise<void>((res, rej) => {
          socket.once("secureConnect", () => res());
          socket.once("error", rej);
        });
        r = await cmd(ehlo, [250]);
      } else if (!opts.secure && opts.requireTls) {
        throw new Error("SMTP server does not advertise STARTTLS");
      }

      if (opts.auth) {
        await cmd("AUTH LOGIN", [334]);
        await cmd(Buffer.from(opts.auth.user).toString("base64"), [334]);
        await cmd(Buffer.from(opts.auth.pass).toString("base64"), [235]);
      }

      await cmd(`MAIL FROM:<${addr(from)}>`, [250]);
      for (const rcpt of recipients) await cmd(`RCPT TO:<${addr(rcpt)}>`, [250, 251]);
      await cmd("DATA", [354]);
      socket.write(data + "\r\n.\r\n");
      const done = await expect();
      if (done.code !== 250) throw new Error(`SMTP DATA → ${done.text}`);

      try {
        await cmd("QUIT", [221]);
      } catch {
        /* server may just close */
      }
      socket.end();
      if (!settled) {
        settled = true;
        // The 250 reply text often carries a queue id (e.g. "250 2.0.0 Ok: queued as ABC123").
        const id = /queued as (\S+)/i.exec(done.text)?.[1];
        resolve({ id, accepted: recipients });
      }
    };

    run().catch(fail);
  });
}

/** A dependency-free SMTP {@link MailTransport}. */
export function smtpTransport(opts: SmtpTransportOptions): MailTransport {
  return {
    name: "smtp",
    send: (msg) => send(opts, msg),
  };
}
