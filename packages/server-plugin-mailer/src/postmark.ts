// ── @youneed/server-plugin-mailer/postmark — Postmark HTTP transport ──────────
//
// A `MailTransport` backed by Postmark's email API (POST /email). Uses the global
// `fetch` — no SDK. https://postmarkapp.com/developer/api/email-api

import type { MailMessage, MailResult, MailTransport } from "./index.ts";

export interface PostmarkTransportOptions {
  serverToken: string;
  /** Default `From` address when a message omits one. */
  from?: string;
  /** Override the endpoint (tests). */
  endpoint?: string;
}

const csv = (v: string | string[] | undefined): string | undefined => {
  if (v == null) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  return arr.length ? arr.join(", ") : undefined;
};

export function postmarkTransport(opts: PostmarkTransportOptions): MailTransport {
  const endpoint = opts.endpoint ?? "https://api.postmarkapp.com/email";
  return {
    name: "postmark",
    async send(msg: MailMessage): Promise<MailResult> {
      const from = msg.from ?? opts.from;
      if (!from) throw new Error("mailer/postmark: no `from`");
      const payload: Record<string, unknown> = {
        From: from,
        To: csv(msg.to),
        Subject: msg.subject,
      };
      if (msg.text != null) payload.TextBody = msg.text;
      if (msg.html != null) payload.HtmlBody = msg.html;
      const cc = csv(msg.cc);
      if (cc) payload.Cc = cc;
      const bcc = csv(msg.bcc);
      if (bcc) payload.Bcc = bcc;
      if (msg.replyTo) payload.ReplyTo = msg.replyTo;
      if (msg.headers) payload.Headers = Object.entries(msg.headers).map(([Name, Value]) => ({ Name, Value }));

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "X-Postmark-Server-Token": opts.serverToken, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { MessageID?: string; Message?: string; ErrorCode?: number };
      if (!res.ok || (json.ErrorCode != null && json.ErrorCode !== 0)) {
        throw new Error(`postmark: ${res.status} ${json.Message ?? ""}`.trim());
      }
      return { id: json.MessageID, accepted: Array.isArray(msg.to) ? msg.to : [msg.to] };
    },
  };
}
