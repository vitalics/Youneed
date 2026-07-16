// ── @youneed/secrets-aws — AWS Secrets Manager provider (SigV4-signed) ────────
//
// A framework-agnostic `SecretsProvider` (from `@youneed/secrets`) backed by the
// AWS Secrets Manager JSON API, signed with AWS Signature Version 4 (implemented
// here with node:crypto — no aws-sdk). Pure `fetch`.
//   POST https://secretsmanager.<region>.amazonaws.com/
//   X-Amz-Target: secretsmanager.GetSecretValue | secretsmanager.ListSecrets
//   Content-Type: application/x-amz-json-1.1
//
//   const secrets = createSecrets(awsSecrets({ region, accessKeyId, secretAccessKey }));
//   const dbUrl = await secrets.require("prod/db/url");
//
//   • SigV4 refs: https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html
//   • Secrets Manager API: https://docs.aws.amazon.com/secretsmanager/latest/apireference/

import { createHash, createHmac } from "node:crypto";
import type { SecretsProvider } from "@youneed/secrets";

const SERVICE = "secretsmanager";

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
   * Extra headers to include in the signature (lowercased). Secrets Manager signs
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

export interface AwsSecretsOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Temporary-credential session token (STS). */
  sessionToken?: string;
  /** Override the endpoint host (tests / VPC endpoints). e.g. `localhost:4566`. */
  endpoint?: string;
  /** Injectable fetch. Default: global `fetch`. */
  fetch?: FetchLike;
  /** Abort the request after this many ms (default `10000`, `0` disables). */
  timeoutMs?: number;
  /** Injectable clock (tests) — makes the SigV4 signature deterministic. */
  date?: () => Date;
}

interface GetSecretValueResponse {
  SecretString?: string;
  SecretBinary?: string; // base64
  __type?: string;
  message?: string;
  Message?: string;
}

interface ListSecretsResponse {
  SecretList?: Array<{ Name?: string }>;
  NextToken?: string;
  __type?: string;
  message?: string;
  Message?: string;
}

/** True when the response describes a `ResourceNotFoundException` (missing secret). */
function isNotFound(status: number, body: { __type?: string }): boolean {
  return (status === 400 || status === 404) && typeof body.__type === "string" && body.__type.includes("ResourceNotFoundException");
}

/**
 * A {@link SecretsProvider} over AWS Secrets Manager. Values are returned as
 * strings: a `SecretString` verbatim, or a `SecretBinary` decoded to a base64
 * string. A missing secret (`ResourceNotFoundException`) resolves to `undefined`.
 */
export function awsSecrets(opts: AwsSecretsOptions): SecretsProvider {
  const host = opts.endpoint ?? `${SERVICE}.${opts.region}.amazonaws.com`;
  const path = "/";
  const url = `${opts.endpoint ? (opts.endpoint.startsWith("http") ? opts.endpoint : `https://${opts.endpoint}`) : `https://${host}`}${path}`;
  const doFetch: FetchLike = opts.fetch ?? ((u, init) => fetch(u, init) as unknown as ReturnType<FetchLike>);
  const timeoutMs = opts.timeoutMs ?? 10_000;

  async function call<T>(target: string, body: Record<string, unknown>): Promise<{ status: number; ok: boolean; json: T }> {
    const payload = JSON.stringify(body);
    const contentType = "application/x-amz-json-1.1";
    const amzTarget = `${SERVICE}.${target}`;

    const sig = signV4({
      method: "POST",
      host,
      path,
      service: SERVICE,
      region: opts.region,
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      sessionToken: opts.sessionToken,
      payload,
      extraHeaders: { "content-type": contentType, "x-amz-target": amzTarget },
      now: opts.date?.(),
    });

    const headers: Record<string, string> = {
      host,
      "content-type": contentType,
      "x-amz-target": amzTarget,
      "x-amz-content-sha256": sha256hex(payload),
      "x-amz-date": sig.amzDate,
      authorization: sig.authorization,
    };
    if (opts.sessionToken) headers["x-amz-security-token"] = opts.sessionToken;

    let signal: AbortSignal | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      const ctrl = new AbortController();
      signal = ctrl.signal;
      timer = setTimeout(() => ctrl.abort(), timeoutMs);
    }
    try {
      const res = await doFetch(url, { method: "POST", headers, body: payload, signal });
      const json = (await res.json().catch(() => ({}))) as T;
      return { status: res.status, ok: res.ok, json };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    name: "aws",

    async get(key: string): Promise<string | undefined> {
      const { status, ok, json } = await call<GetSecretValueResponse>("GetSecretValue", { SecretId: key });
      if (!ok) {
        if (isNotFound(status, json)) return undefined;
        throw new Error(`secrets-aws: GetSecretValue ${status} ${json.__type ?? ""} ${json.message ?? json.Message ?? ""}`.trim());
      }
      if (typeof json.SecretString === "string") return json.SecretString;
      if (typeof json.SecretBinary === "string") return json.SecretBinary; // already base64 in the JSON API
      return undefined;
    },

    async list(): Promise<string[]> {
      const names: string[] = [];
      let nextToken: string | undefined;
      // Paginate through `NextToken`; guarded so a broken/looping backend can't spin forever.
      for (let page = 0; page < 1000; page++) {
        const body: Record<string, unknown> = nextToken ? { NextToken: nextToken } : {};
        const { ok, status, json } = await call<ListSecretsResponse>("ListSecrets", body);
        if (!ok) throw new Error(`secrets-aws: ListSecrets ${status} ${json.__type ?? ""} ${json.message ?? json.Message ?? ""}`.trim());
        for (const s of json.SecretList ?? []) if (typeof s.Name === "string") names.push(s.Name);
        nextToken = json.NextToken;
        if (!nextToken) break;
      }
      return names;
    },
  };
}
