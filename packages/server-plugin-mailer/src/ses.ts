// ── @youneed/server-plugin-mailer/ses — AWS SES v2 transport (SigV4-signed) ───
//
// A `MailTransport` backed by the AWS SES v2 SendEmail HTTP API, signed with
// AWS Signature Version 4 (implemented here with node:crypto — no aws-sdk).
//   POST https://email.<region>.amazonaws.com/v2/email/outbound-emails
// Uses the global `fetch`.
//   • SigV4 refs: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html

import { createHash, createHmac } from "node:crypto";
import type { MailMessage, MailResult, MailTransport } from "./index.ts";

export interface SesTransportOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Temporary-credential session token (STS). */
  sessionToken?: string;
  /** Default `From` address when a message omits one. */
  from?: string;
  /** Override the endpoint host (tests / VPC endpoints). */
  endpoint?: string;
}

const list = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const sha256hex = (data: string): string => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key: string | Buffer, data: string): Buffer => createHmac("sha256", key).update(data, "utf8").digest();

/** The pieces a SigV4 signature is derived from — returned by {@link signV4} for testability. */
export interface SigV4Result {
  authorization: string;
  amzDate: string;
  dateStamp: string;
  canonicalRequest: string;
  stringToSign: string;
  credentialScope: string;
  signature: string;
  signedHeaders: string;
}

export interface SigV4Input {
  method: string;
  host: string;
  path: string;
  service: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  payload: string;
  /** Injectable clock (tests). Default `new Date()`. */
  now?: Date;
  /** Extra query string (canonical form, already sorted+encoded). Default "". */
  query?: string;
}

/**
 * Compute an AWS Signature V4 `Authorization` header for a request. Factored out
 * (and pure — inject `now`) so it can be unit-tested against known vectors
 * without hitting the network.
 */
export function signV4(input: SigV4Input): SigV4Result {
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
  const payloadHash = sha256hex(input.payload);

  // Canonical headers must be lowercase, sorted, trimmed; SES needs host + x-amz-date (+ token).
  const headers: Record<string, string> = {
    host: input.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.sessionToken) headers["x-amz-security-token"] = input.sessionToken;
  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k]}\n`).join("");
  const signedHeaders = sortedKeys.join(";");

  const canonicalRequest = [
    input.method,
    input.path,
    input.query ?? "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256hex(canonicalRequest)].join("\n");

  // Derive the signing key: HMAC chain over date → region → service → "aws4_request".
  const kDate = hmac("AWS4" + input.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate, dateStamp, canonicalRequest, stringToSign, credentialScope, signature, signedHeaders };
}

export function sesTransport(opts: SesTransportOptions): MailTransport {
  const host = opts.endpoint ?? `email.${opts.region}.amazonaws.com`;
  const path = "/v2/email/outbound-emails";
  return {
    name: "ses",
    async send(msg: MailMessage): Promise<MailResult> {
      const from = msg.from ?? opts.from;
      if (!from) throw new Error("mailer/ses: no `from`");

      const content: Record<string, unknown> = { Subject: { Data: msg.subject, Charset: "UTF-8" }, Body: {} as Record<string, unknown> };
      const body = content.Body as Record<string, unknown>;
      if (msg.text != null) body.Text = { Data: msg.text, Charset: "UTF-8" };
      if (msg.html != null) body.Html = { Data: msg.html, Charset: "UTF-8" };

      const destination: Record<string, unknown> = { ToAddresses: list(msg.to) };
      if (msg.cc && list(msg.cc).length) destination.CcAddresses = list(msg.cc);
      if (msg.bcc && list(msg.bcc).length) destination.BccAddresses = list(msg.bcc);

      const payload = JSON.stringify({
        FromEmailAddress: from,
        Destination: destination,
        Content: { Simple: content },
        ...(msg.replyTo ? { ReplyToAddresses: [msg.replyTo] } : {}),
      });

      const sig = signV4({
        method: "POST",
        host,
        path,
        service: "ses",
        region: opts.region,
        accessKeyId: opts.accessKeyId,
        secretAccessKey: opts.secretAccessKey,
        sessionToken: opts.sessionToken,
        payload,
      });

      const headers: Record<string, string> = {
        host,
        "content-type": "application/json",
        "x-amz-content-sha256": sha256hex(payload),
        "x-amz-date": sig.amzDate,
        authorization: sig.authorization,
      };
      if (opts.sessionToken) headers["x-amz-security-token"] = opts.sessionToken;

      const res = await fetch(`https://${host}${path}`, { method: "POST", headers, body: payload });
      const json = (await res.json().catch(() => ({}))) as { MessageId?: string; message?: string; Message?: string };
      if (!res.ok) throw new Error(`ses: ${res.status} ${json.message ?? json.Message ?? ""}`.trim());
      return { id: json.MessageId, accepted: list(msg.to) };
    },
  };
}
