---
name: youneed-server-plugins
description: "Application-level @youneed/server plugins beyond the core middleware — API protocols, background services, and observability. GraphQL (@youneed/server-plugin-graphql: schema-first SDL or GraphQLSchema + resolvers, spec-compliant POST/GET endpoint, GraphiQL, devtools tab), gRPC (@youneed/server-plugin-grpc: @grpc/grpc-js server on its own HTTP/2 listener tied to the app lifecycle, .proto load, call-tester devtools), transactional email (@youneed/server-plugin-mailer: MailTransport contract + SMTP/SES/SendGrid/Postmark transports, no SDKs), object/blob storage (@youneed/server-plugin-storage: StorageAdapter contract + Memory/File/S3 adapters), a durable background job queue (@youneed/server-plugin-queue: retries+backoff, dead-letter, delayed/concurrent workers, persisted to KV), and OTLP trace export (@youneed/server-plugin-otlp: batches trace-middleware spans, POSTs OTLP/HTTP JSON to a collector/Jaeger/Tempo/Grafana, no OTel SDK). Use this skill when adding a GraphQL or gRPC endpoint, sending email, storing files/blobs, running background jobs off the request path, or exporting traces to an OpenTelemetry backend. For per-request HTTP middleware (cors/helmet/auth/etc) or the infra plugins (jobs/cron, cluster, docker, env, devtools, pubsub, store), see the main youneed skill's middleware.md / plugins-infra.md / realtime.md."
license: ISC
---

# youneed — Application Server Plugins (protocols, services, observability)

These are `ServerPlugin`s (`app.plugin(...)`) that add whole capabilities to a
`@youneed/server` app — a second protocol endpoint, an outbound service client, a background
worker, or a telemetry exporter. Distinct from per-request **middleware** (`app.use`, in the
main `youneed` skill's `references/middleware.md`) and from the **infra** plugins jobs/cluster/
docker/env/devtools (`references/plugins-infra.md`) and pubsub/store (`references/realtime.md`).

Source of truth: `packages/server-plugin-{graphql,grpc,mailer,storage,queue,otlp}/src`.
Verify a signature before asserting it.

## Route to the reference

| Task | Read |
|------|------|
| A GraphQL or gRPC endpoint alongside the HTTP API | `references/protocols.md` |
| Sending transactional email; storing files/blobs; running background jobs | `references/services.md` |
| Exporting per-request traces to an OpenTelemetry collector / Jaeger / Tempo / Grafana | `references/observability.md` |

## At a glance

```ts
import { Application } from "@youneed/server";
import { graphql } from "@youneed/server-plugin-graphql";
import { mailer } from "@youneed/server-plugin-mailer";
import { smtpTransport } from "@youneed/server-plugin-mailer/smtp";
import { storage, FileStorage } from "@youneed/server-plugin-storage";
import { createQueue, queue } from "@youneed/server-plugin-queue";
import { otlp } from "@youneed/server-plugin-otlp";

const mail = mailer(smtpTransport({ host, port, auth, from }));
const jobs = createQueue({ concurrency: 5, maxAttempts: 3 }).register("email", async ({ to }) => sendEmail(to));

const app = Application(MyController)
  .plugin(graphql({ schema: sdl, rootValue }))
  .plugin(mail)
  .plugin(storage(new FileStorage("./data")))
  .plugin(queue(jobs))
  .plugin(otlp({ endpoint: "http://localhost:4318", serviceName: "my-api" }));

app.listen(3000);
```

## Common shape

- **Lifecycle-bound.** Each plugin binds `onListen` / `onShutdown` — workers start on
  `listen`, drain on graceful shutdown; the queue and OTLP exporter flush on exit.
- **Devtools tab.** With `@youneed/server-plugin-devtools` mounted, each surfaces a tab
  (GraphiQL / call-tester / recent-sends / storage browser / queue backlog / OTLP stats).
- **No vendor SDK where avoidable.** Mailer transports, storage S3 (optional `@aws-sdk/client-s3`),
  and OTLP are pure `fetch`/`node:crypto`. gRPC uses `@grpc/grpc-js`; GraphQL uses `graphql-js`.
- **Contract + adapter.** Mailer (`MailTransport`) and storage (`StorageAdapter`) are one
  contract with swappable backends — pick where bytes/mail physically go at deploy time.
