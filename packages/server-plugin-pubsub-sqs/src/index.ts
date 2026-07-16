// ── @youneed/server-plugin-pubsub-sqs — AWS SQS adapter (Pub/Sub) ─────────────
//
// `SqsPubSub` implements the `PubSub` contract over AWS SQS queues. SQS is a
// *queue*, not a native pub/sub bus, so a channel maps to a queue: `publish`
// enqueues a message (`SendMessage`), `subscribe` runs a long-poll loop
// (`ReceiveMessage` → handler → `DeleteMessage`). Each subscription is a competing
// consumer of its queue, not a broadcast — pair a fan-out topology (e.g. SNS →
// SQS) if you need broadcast semantics.
//
// Talks to SQS over pure `fetch` with AWS Signature V4 (node:crypto — no
// aws-sdk), using the AWS JSON 1.0 protocol (`X-Amz-Target: AmazonSQS.*`,
// `Content-Type: application/x-amz-json-1.0`).
//   • SigV4 refs: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
//   • SQS API:    https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/

import { createHash, createHmac } from "node:crypto";
import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

const SERVICE = "sqs";

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
  /**
   * Extra headers to include in the signature (lowercased). SQS signs
   * `x-amz-target` + `content-type` alongside the standard host/date headers.
   */
  extraHeaders?: Record<string, string>;
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

  // Canonical headers must be lowercase, sorted, trimmed.
  const headers: Record<string, string> = {
    host: input.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  for (const [k, v] of Object.entries(input.extraHeaders ?? {})) headers[k.toLowerCase()] = v;
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

/** A `fetch`-compatible function (injectable for tests). */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface SqsOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Temporary-credential session token (STS). */
  sessionToken?: string;
  /** Resolve a channel to a full SQS queue URL. Takes precedence over `queuePrefix`. */
  queueUrl?: (channel: string) => string;
  /** Base queue URL prefix; the queue URL is `${queuePrefix}${channel}`. */
  queuePrefix?: string;
  /** Injectable fetch. Default: global `fetch`. */
  fetch?: FetchLike;
  /** Long-poll wait time in seconds for `ReceiveMessage` (default `20`, the SQS max). */
  pollWaitSec?: number;
  /** Visibility timeout in seconds applied to received messages (optional). */
  visibilityTimeoutSec?: number;
  /** Injectable clock (tests) — makes the SigV4 signature deterministic. */
  date?: () => Date;
}

interface ReceiveMessageResponse {
  Messages?: Array<{ Body?: string; ReceiptHandle?: string; MessageId?: string }>;
  __type?: string;
  message?: string;
  Message?: string;
}

export class SqsPubSub implements PubSub {
  readonly name = "sqs";
  #opts: SqsOptions;
  #fetch: FetchLike;
  #pollWaitSec: number;
  #loops = new Set<() => void>();

  constructor(opts: SqsOptions) {
    this.#opts = opts;
    this.#fetch = opts.fetch ?? ((u, init) => fetch(u, init) as unknown as ReturnType<FetchLike>);
    this.#pollWaitSec = opts.pollWaitSec ?? 20;
  }

  /** Resolve a channel to its SQS queue URL. */
  #queueUrl(channel: string): string {
    if (this.#opts.queueUrl) return this.#opts.queueUrl(channel);
    if (this.#opts.queuePrefix != null) return `${this.#opts.queuePrefix}${channel}`;
    throw new Error("server-plugin-pubsub-sqs: no `queueUrl` fn or `queuePrefix` given to resolve a channel");
  }

  /** POST an AWS JSON 1.0 request to a queue URL, SigV4-signed. */
  async #call<T>(queueUrl: string, target: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ status: number; ok: boolean; json: T }> {
    const url = new URL(queueUrl);
    const host = url.host;
    const path = url.pathname || "/";
    const payload = JSON.stringify(body);
    const contentType = "application/x-amz-json-1.0";
    const amzTarget = `AmazonSQS.${target}`;

    const sig = signV4({
      method: "POST",
      host,
      path,
      service: SERVICE,
      region: this.#opts.region,
      accessKeyId: this.#opts.accessKeyId,
      secretAccessKey: this.#opts.secretAccessKey,
      sessionToken: this.#opts.sessionToken,
      payload,
      extraHeaders: { "content-type": contentType, "x-amz-target": amzTarget },
      now: this.#opts.date?.(),
    });

    const headers: Record<string, string> = {
      host,
      "content-type": contentType,
      "x-amz-target": amzTarget,
      "x-amz-content-sha256": sha256hex(payload),
      "x-amz-date": sig.amzDate,
      authorization: sig.authorization,
    };
    if (this.#opts.sessionToken) headers["x-amz-security-token"] = this.#opts.sessionToken;

    const res = await this.#fetch(queueUrl, { method: "POST", headers, body: payload, signal });
    const json = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, ok: res.ok, json };
  }

  async publish(channel: string, message: string): Promise<void> {
    const queueUrl = this.#queueUrl(channel);
    const { ok, status, json } = await this.#call<{ __type?: string; message?: string; Message?: string }>(queueUrl, "SendMessage", {
      QueueUrl: queueUrl,
      MessageBody: message,
    });
    if (!ok) throw new Error(`sqs: SendMessage ${status} ${json.__type ?? ""} ${json.message ?? json.Message ?? ""}`.trim());
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    const queueUrl = this.#queueUrl(channel);
    let stopped = false;
    const ctrl = new AbortController();

    const stop = () => {
      stopped = true;
      ctrl.abort();
    };
    this.#loops.add(stop);

    const loop = async (): Promise<void> => {
      while (!stopped) {
        let json: ReceiveMessageResponse;
        try {
          const res = await this.#call<ReceiveMessageResponse>(
            queueUrl,
            "ReceiveMessage",
            {
              QueueUrl: queueUrl,
              MaxNumberOfMessages: 10,
              WaitTimeSeconds: this.#pollWaitSec,
              ...(this.#opts.visibilityTimeoutSec != null ? { VisibilityTimeout: this.#opts.visibilityTimeoutSec } : {}),
            },
            ctrl.signal,
          ).then((r) => r.json);
          json = res;
        } catch {
          // Aborted (close) or a transient fetch failure — bail if stopped, else retry the loop.
          if (stopped) break;
          continue;
        }
        for (const m of json.Messages ?? []) {
          if (stopped) break;
          await handler(m.Body ?? "", channel);
          if (m.ReceiptHandle != null) {
            await this.#call(queueUrl, "DeleteMessage", { QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle }, ctrl.signal).catch(() => {});
          }
        }
      }
    };

    void loop();

    return {
      close: () => {
        this.#loops.delete(stop);
        stop();
      },
    };
  }

  async close(): Promise<void> {
    for (const stop of this.#loops) stop();
    this.#loops.clear();
  }
}

export function sqsPubSub(opts: SqsOptions): SqsPubSub {
  return new SqsPubSub(opts);
}
