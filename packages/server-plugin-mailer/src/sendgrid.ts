// ── @youneed/server-plugin-mailer/sendgrid — SendGrid v3 HTTP transport ───────
//
// A `MailTransport` backed by SendGrid's Mail Send API (POST /v3/mail/send).
// Uses the global `fetch` — no SDK. https://docs.sendgrid.com/api-reference/mail-send/mail-send

import type { MailMessage, MailResult, MailTransport } from "./index.ts";

export interface SendGridTransportOptions {
  apiKey: string;
  /** Default `From` address when a message omits one. */
  from?: string;
  /** Override the endpoint (tests). */
  endpoint?: string;
}

const list = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const toEmails = (v: string | string[] | undefined) => list(v).map((email) => ({ email }));

export function sendgridTransport(opts: SendGridTransportOptions): MailTransport {
  const endpoint = opts.endpoint ?? "https://api.sendgrid.com/v3/mail/send";
  return {
    name: "sendgrid",
    async send(msg: MailMessage): Promise<MailResult> {
      const from = msg.from ?? opts.from;
      if (!from) throw new Error("mailer/sendgrid: no `from`");
      const content: Array<{ type: string; value: string }> = [];
      if (msg.text != null) content.push({ type: "text/plain", value: msg.text });
      if (msg.html != null) content.push({ type: "text/html", value: msg.html });

      const personalization: Record<string, unknown> = { to: toEmails(msg.to) };
      if (msg.cc && list(msg.cc).length) personalization.cc = toEmails(msg.cc);
      if (msg.bcc && list(msg.bcc).length) personalization.bcc = toEmails(msg.bcc);

      const payload: Record<string, unknown> = {
        personalizations: [personalization],
        from: { email: from },
        subject: msg.subject,
        content: content.length ? content : [{ type: "text/plain", value: "" }],
      };
      if (msg.replyTo) payload.reply_to = { email: msg.replyTo };
      if (msg.headers) payload.headers = msg.headers;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`sendgrid: ${res.status} ${await res.text().catch(() => "")}`.trim());
      // SendGrid returns 202 with an empty body; the id is in the X-Message-Id header.
      return { id: res.headers.get("x-message-id") ?? undefined, accepted: list(msg.to) };
    },
  };
}
