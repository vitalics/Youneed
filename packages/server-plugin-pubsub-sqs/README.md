# @youneed/server-plugin-pubsub-sqs

AWS SQS transport for [`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
**`SqsPubSub`** implements the `PubSub` contract over AWS SQS queues — a channel
maps to a queue. SQS is a **queue**, not a native pub/sub bus, so `publish`
enqueues a message and `subscribe` runs a **long-poll consumer** loop. This is
competing-consumer delivery (each message goes to one reader), not broadcast — if
you need fan-out, front the queues with SNS.

Talks to SQS over pure `fetch` signed with AWS Signature V4 (`node:crypto` — **no
aws-sdk**), using the AWS JSON 1.0 protocol
(`X-Amz-Target: AmazonSQS.*`, `Content-Type: application/x-amz-json-1.0`).

```ts
import { Application } from "@youneed/server";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { sqsPubSub } from "@youneed/server-plugin-pubsub-sqs";

const bus = createPubSub(
  sqsPubSub({
    region: "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    // channel === queue name, appended to this base URL prefix.
    queuePrefix: "https://sqs.us-east-1.amazonaws.com/123456789012/",
  }),
);

Application().plugin(pubsub(bus)).listen(3000, () => {});

// channel === SQS queue. handler receives (message, channel).
await bus.subscribe("orders", (message, channel) => {
  console.log(`[${channel}]`, JSON.parse(message));
});
await bus.publish("orders", JSON.stringify({ id: 42 }));
```

Each `subscribe` starts its own long-poll loop against the queue: it calls
`ReceiveMessage` (with `WaitTimeSeconds = pollWaitSec`, `MaxNumberOfMessages = 10`),
runs the handler per message, then `DeleteMessage` (by `ReceiptHandle`). The loop
runs until `Subscription.close()` (or `close()` on the bus), which flips a stop
flag and aborts the in-flight poll via an `AbortController`.

## API

- **`sqsPubSub(opts)`** → `SqsPubSub` (a `PubSub`, `name: "sqs"`).
- **`SqsOptions`**:
  - `region`, `accessKeyId`, `secretAccessKey` — AWS credentials + region.
  - `sessionToken` — temporary-credential (STS) session token.
  - `queueUrl` — `(channel) => string`, resolves a channel to a full queue URL
    (takes precedence over `queuePrefix`).
  - `queuePrefix` — base queue URL prefix; the URL is `${queuePrefix}${channel}`.
  - `pollWaitSec` — long-poll `WaitTimeSeconds` (default `20`, the SQS max).
  - `visibilityTimeoutSec` — visibility timeout applied to received messages.
  - `fetch` — injectable `fetch` (default global) for tests / custom transports.
  - `date` — injectable clock, makes the SigV4 signature deterministic (tests).
- **`signV4(input)`** — the standalone AWS Signature V4 signer (pure, testable).

Pair this adapter with the core plugin for the devtools view — see
[`@youneed/server-plugin-pubsub`](../server-plugin-pubsub).
