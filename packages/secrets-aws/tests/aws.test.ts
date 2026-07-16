// Run: pnpm --filter @youneed/secrets-aws test
// Verifies the SigV4 signer against a known date vector and the SecretsProvider
// behaviour with an injected fake fetch — no network.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createSecrets } from "@youneed/secrets";
import { awsSecrets, signV4, type FetchLike } from "../src/index.ts";

// ── a fake fetch: records the last request, replies from a queue of responses ──
interface FakeResponse {
  ok?: boolean;
  status?: number;
  body: unknown;
}
function fakeFetch(responses: FakeResponse[]) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const r = responses.shift() ?? { body: {} };
    const status = r.status ?? (r.ok === false ? 400 : 200);
    return {
      ok: r.ok ?? (status >= 200 && status < 300),
      status,
      async json() {
        return r.body;
      },
      async text() {
        return JSON.stringify(r.body);
      },
    };
  };
  return { fetch, calls };
}

const creds = { region: "us-east-1", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };

class AwsSecretsSuite extends Test({ name: "@youneed/secrets-aws" }) {
  // ── SigV4 signer — known date vector, no network ────────────────────────────
  @Test.it("signV4 builds the right canonical request + Authorization shape") sigv4() {
    const sig = signV4({
      method: "POST",
      host: "secretsmanager.us-east-1.amazonaws.com",
      path: "/",
      service: "secretsmanager",
      region: "us-east-1",
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      payload: JSON.stringify({ SecretId: "prod/db" }),
      extraHeaders: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "secretsmanager.GetSecretValue" },
      now: new Date("2015-08-30T12:36:00Z"),
    });
    expect(sig.amzDate).toBe("20150830T123600Z");
    expect(sig.dateStamp).toBe("20150830");
    expect(sig.credentialScope).toBe("20150830/us-east-1/secretsmanager/aws4_request");
    // content-type + host + x-amz-* are all signed, sorted lexicographically.
    expect(sig.signedHeaders).toBe("content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target");
    const lines = sig.canonicalRequest.split("\n");
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/");
    expect(lines[2]).toBe(""); // no query
    expect(sig.canonicalRequest).toContain("host:secretsmanager.us-east-1.amazonaws.com");
    expect(sig.canonicalRequest).toContain("x-amz-target:secretsmanager.GetSecretValue");
    expect(sig.canonicalRequest).toContain("content-type:application/x-amz-json-1.1");
    expect(sig.stringToSign.split("\n")[0]).toBe("AWS4-HMAC-SHA256");
    expect(sig.authorization).toContain("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/secretsmanager/aws4_request");
    expect(sig.authorization).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target");
    const signaturePart = sig.authorization.split("Signature=")[1] ?? "";
    expect(/^[0-9a-f]{64}$/.test(signaturePart)).toBe(true);
    expect(signaturePart).toBe(sig.signature);
  }

  @Test.it("signV4 is deterministic + includes the session token when present") sigv4Deterministic() {
    const input = {
      method: "POST",
      host: "secretsmanager.eu-west-1.amazonaws.com",
      path: "/",
      service: "secretsmanager",
      region: "eu-west-1",
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: "TOKEN123",
      payload: "{}",
      now: new Date("2020-01-02T03:04:05Z"),
    };
    const a = signV4(input);
    const b = signV4(input);
    expect(a.signature).toBe(b.signature);
    expect(a.signedHeaders).toContain("x-amz-security-token");
    expect(a.canonicalRequest).toContain("x-amz-security-token:TOKEN123");
  }

  // ── get() response mapping ──────────────────────────────────────────────────
  @Test.it("get() returns SecretString verbatim + signs/targets the request") async getString() {
    const { fetch, calls } = fakeFetch([{ body: { ARN: "arn:...", Name: "prod/db", SecretString: "postgres://u:p@h/db" } }]);
    const p = awsSecrets({ ...creds, fetch, date: () => new Date("2015-08-30T12:36:00Z") });
    const v = await p.get("prod/db");
    expect(v).toBe("postgres://u:p@h/db");
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://secretsmanager.us-east-1.amazonaws.com/");
    expect(calls[0].headers["x-amz-target"]).toBe("secretsmanager.GetSecretValue");
    expect(calls[0].headers["content-type"]).toBe("application/x-amz-json-1.1");
    expect(calls[0].headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/secretsmanager/aws4_request");
    expect(JSON.parse(calls[0].body)).toEqual({ SecretId: "prod/db" });
  }

  @Test.it("get() returns SecretBinary as a base64 string") async getBinary() {
    const b64 = Buffer.from("binary-secret").toString("base64");
    const { fetch } = fakeFetch([{ body: { Name: "cert", SecretBinary: b64 } }]);
    const p = awsSecrets({ ...creds, fetch });
    expect(await p.get("cert")).toBe(b64);
  }

  @Test.it("get() maps ResourceNotFoundException → undefined") async getMissing() {
    const { fetch } = fakeFetch([{ ok: false, status: 400, body: { __type: "ResourceNotFoundException", message: "Secrets Manager can't find the specified secret." } }]);
    const p = awsSecrets({ ...creds, fetch });
    expect(await p.get("nope")).toBe(undefined);
  }

  @Test.it("get() throws on other errors (AccessDenied)") async getError() {
    const { fetch } = fakeFetch([{ ok: false, status: 400, body: { __type: "AccessDeniedException", message: "denied" } }]);
    const p = awsSecrets({ ...creds, fetch });
    let caught: Error | undefined;
    try {
      await p.get("x");
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toContain("AccessDeniedException");
  }

  // ── list() → NAMES only, paginated ──────────────────────────────────────────
  @Test.it("list() maps SecretList names across NextToken pages") async listNames() {
    const { fetch, calls } = fakeFetch([
      { body: { SecretList: [{ Name: "a" }, { Name: "b" }], NextToken: "T2" } },
      { body: { SecretList: [{ Name: "c" }] } },
    ]);
    const p = awsSecrets({ ...creds, fetch });
    const names = await p.list!();
    expect(names).toEqual(["a", "b", "c"]);
    expect(calls.length).toBe(2);
    expect(calls[0].headers["x-amz-target"]).toBe("secretsmanager.ListSecrets");
    expect(JSON.parse(calls[0].body)).toEqual({});
    expect(JSON.parse(calls[1].body)).toEqual({ NextToken: "T2" });
  }

  // ── integration with the @youneed/secrets engine ────────────────────────────
  @Test.it("createSecrets(awsSecrets(...)) resolves + require() through the engine") async engine() {
    const { fetch } = fakeFetch([{ body: { SecretString: "sk_live_123" } }, { body: { SecretString: "sk_live_123" } }]);
    const secrets = createSecrets(awsSecrets({ ...creds, fetch }), { cacheTtlMs: 0 });
    expect(secrets.backend).toBe("aws");
    expect(await secrets.require("STRIPE_KEY")).toBe("sk_live_123");
    expect(await secrets.resolve("secret://STRIPE_KEY")).toBe("sk_live_123");
  }
}

await TestApplication().addTests(AwsSecretsSuite).reporter(new ConsoleReporter()).run();
