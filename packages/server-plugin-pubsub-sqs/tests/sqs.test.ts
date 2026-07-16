// Run: pnpm --filter @youneed/server-plugin-pubsub-sqs test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { SqsPubSub, sqsPubSub, signV4, type FetchLike } from "../src/index.ts";

interface Call {
  url: string;
  target: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

// A fake fetch: each call pops the next queued JSON response (or `{}`), and records
// the URL, X-Amz-Target and parsed body for assertions.
function fakeFetch(responses: Array<unknown> = []): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      target: init.headers["x-amz-target"] ?? "",
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    });
    const json = queue.length ? queue.shift() : {};
    return {
      ok: true,
      status: 200,
      json: async () => json,
      text: async () => JSON.stringify(json),
    };
  };
  return { fetch, calls };
}

const CREDS = { region: "us-east-1", accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
const FIXED_DATE = () => new Date("2015-08-30T12:36:00Z");

async function tick(n = 3): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

class SqsSuite extends Test({ name: "server-plugin-pubsub-sqs" }) {
  @Test.it("signV4 produces an SQS Authorization header for a known date") sig() {
    const r = signV4({
      method: "POST",
      host: "sqs.us-east-1.amazonaws.com",
      path: "/123456789012/orders",
      service: "sqs",
      region: "us-east-1",
      accessKeyId: CREDS.accessKeyId,
      secretAccessKey: CREDS.secretAccessKey,
      payload: JSON.stringify({ QueueUrl: "x", MessageBody: "y" }),
      extraHeaders: { "content-type": "application/x-amz-json-1.0", "x-amz-target": "AmazonSQS.SendMessage" },
      now: FIXED_DATE(),
    });
    expect(r.amzDate === "20150830T123600Z").toBeTruthy();
    expect(r.credentialScope === "20150830/us-east-1/sqs/aws4_request").toBeTruthy();
    expect(r.authorization.startsWith(`AWS4-HMAC-SHA256 Credential=${CREDS.accessKeyId}/20150830/us-east-1/sqs/aws4_request`)).toBeTruthy();
    expect(/^[0-9a-f]{64}$/.test(r.signature)).toBeTruthy();
    // content-type + x-amz-target must be signed alongside host/date headers.
    expect(r.signedHeaders === "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target").toBeTruthy();
  }

  @Test.it("publish sends SendMessage with QueueUrl + MessageBody") async publish() {
    const { fetch, calls } = fakeFetch();
    const bus = new SqsPubSub({ ...CREDS, queuePrefix: "https://sqs.us-east-1.amazonaws.com/123456789012/", fetch, date: FIXED_DATE });
    await bus.publish("orders", "hello");
    expect(calls.length === 1).toBeTruthy();
    expect(calls[0].url === "https://sqs.us-east-1.amazonaws.com/123456789012/orders").toBeTruthy();
    expect(calls[0].target === "AmazonSQS.SendMessage").toBeTruthy();
    expect(calls[0].body.QueueUrl === "https://sqs.us-east-1.amazonaws.com/123456789012/orders").toBeTruthy();
    expect(calls[0].body.MessageBody === "hello").toBeTruthy();
    expect(calls[0].headers["content-type"] === "application/x-amz-json-1.0").toBeTruthy();
    await bus.close();
  }

  @Test.it("subscribe polls ReceiveMessage, delivers body+channel, then DeleteMessage") async subscribe() {
    // First poll returns one message; subsequent polls return empty.
    const { fetch, calls } = fakeFetch([{ Messages: [{ Body: "user.created", ReceiptHandle: "rh-1", MessageId: "m1" }] }]);
    const bus = sqsPubSub({ ...CREDS, queuePrefix: "https://sqs.us-east-1.amazonaws.com/123456789012/", fetch, date: FIXED_DATE, pollWaitSec: 0 });
    const got: string[] = [];
    const sub = await bus.subscribe("events", (m, ch) => void got.push(`${ch}:${m}`));
    await tick(6);
    sub.close();

    const receive = calls.find((c) => c.target === "AmazonSQS.ReceiveMessage");
    const del = calls.find((c) => c.target === "AmazonSQS.DeleteMessage");
    expect(receive !== undefined).toBeTruthy();
    expect(receive!.body.QueueUrl === "https://sqs.us-east-1.amazonaws.com/123456789012/events").toBeTruthy();
    expect(receive!.body.MaxNumberOfMessages === 10).toBeTruthy();
    expect(got[0] === "events:user.created").toBeTruthy();
    expect(del !== undefined).toBeTruthy();
    expect(del!.body.ReceiptHandle === "rh-1").toBeTruthy();
    await bus.close();
  }

  @Test.it("Subscription.close stops the poll loop") async stops() {
    const { fetch, calls } = fakeFetch(); // always empty responses
    const bus = new SqsPubSub({ ...CREDS, queuePrefix: "https://q/", fetch, pollWaitSec: 0 });
    const sub = await bus.subscribe("c", () => {});
    await tick(4);
    sub.close();
    const before = calls.length;
    await tick(10);
    // No further polls after close.
    expect(calls.length === before).toBeTruthy();
    await bus.close();
  }

  @Test.it("channel resolves via queueUrl fn or queuePrefix") async resolve() {
    const a = fakeFetch();
    const busFn = new SqsPubSub({ ...CREDS, queueUrl: (ch) => `https://custom/${ch}.fifo`, fetch: a.fetch });
    await busFn.publish("payments", "x");
    expect(a.calls[0].url === "https://custom/payments.fifo").toBeTruthy();
    await busFn.close();

    const b = fakeFetch();
    const busPrefix = new SqsPubSub({ ...CREDS, queuePrefix: "https://base/acct/", fetch: b.fetch });
    await busPrefix.publish("q1", "x");
    expect(b.calls[0].url === "https://base/acct/q1").toBeTruthy();
    await busPrefix.close();
  }
}

await TestApplication().addTests(SqsSuite).reporter(new ConsoleReporter()).run();
