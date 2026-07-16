// @youneed/server-plugin-otp/email
//
// An email OTP channel backed by a minimal, dependency-free SMTP client
// (node:net + node:tls). Supports implicit TLS (`secure: true`, port 465),
// STARTTLS upgrade (port 587), and AUTH LOGIN.

import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import type { OtpChannel } from "./index.ts";

export interface EmailChannelOptions {
  host: string;
  /** Default 465 when `secure`, else 587. */
  port?: number;
  /** Implicit TLS (port 465). Otherwise plaintext + opportunistic STARTTLS. */
  secure?: boolean;
  /** SMTP AUTH LOGIN credentials. */
  auth?: { user: string; pass: string };
  /** Envelope/From address (e.g. `"Acme <no-reply@acme.dev>"`). */
  from: string;
  /** Subject — a string or a `(code) => string` (default "Your verification code"). */
  subject?: string | ((code: string) => string);
  /** Plain-text body builder (default `Your verification code is <code>`). */
  text?: (code: string) => string;
  /** HTML body builder (used instead of text when provided). */
  html?: (code: string) => string;
  /** Require STARTTLS when not `secure` (default: upgrade only if advertised). */
  requireTls?: boolean;
  /** EHLO name (default "localhost"). */
  clientName?: string;
  /** Socket timeout ms (default 10000). */
  timeoutMs?: number;
}

interface Mail {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

const addr = (s: string): string => /<([^>]+)>/.exec(s)?.[1] ?? s.trim();

function buildMessage(mail: Mail): string {
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `Content-Type: text/${mail.html ? "html" : "plain"}; charset=utf-8`,
  ];
  const body = (mail.html ?? mail.text ?? "").replace(/\r?\n/g, "\r\n");
  // Dot-stuffing: a line starting with "." must be doubled so it isn't read as the terminator.
  const stuffed = body
    .split("\r\n")
    .map((l) => (l.startsWith(".") ? "." + l : l))
    .join("\r\n");
  return headers.join("\r\n") + "\r\n\r\n" + stuffed;
}

interface SmtpResponse {
  code: number;
  text: string;
}

/** Send one mail over SMTP. Throws on any non-OK reply. */
export function smtpSend(opts: EmailChannelOptions, mail: Mail): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
        for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { end = i; break; }
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

      await cmd(`MAIL FROM:<${addr(mail.from)}>`, [250]);
      await cmd(`RCPT TO:<${addr(mail.to)}>`, [250, 251]);
      await cmd("DATA", [354]);
      socket.write(buildMessage(mail) + "\r\n.\r\n");
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
        resolve();
      }
    };

    run().catch(fail);
  });
}

/** Email OTP channel — delivers the code via SMTP. */
export function emailChannel(opts: EmailChannelOptions): OtpChannel {
  return {
    name: "email",
    async send(to, code) {
      const subject = typeof opts.subject === "function" ? opts.subject(code) : opts.subject ?? "Your verification code";
      const html = opts.html ? opts.html(code) : undefined;
      const text = html ? undefined : opts.text ? opts.text(code) : `Your verification code is ${code}`;
      await smtpSend(opts, { from: opts.from, to, subject, text, html });
    },
  };
}
