# @youneed/secrets-aws

An **AWS Secrets Manager** provider for [`@youneed/secrets`](../secrets). Pure
`fetch` + AWS Signature V4 signed with `node:crypto` — **no `aws-sdk`**. Values
come back as strings, so they slot straight into the `Secrets` engine (caching,
`secret://` references, `require`).

```ts
import { createSecrets } from "@youneed/secrets";
import { awsSecrets } from "@youneed/secrets-aws";

const secrets = createSecrets(
  awsSecrets({
    region: "us-east-1",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    // sessionToken: process.env.AWS_SESSION_TOKEN, // STS temp creds
  }),
  { cacheTtlMs: 60_000 },
);

const dbUrl = await secrets.require("prod/db/url");                 // GetSecretValue
const cfg = await secrets.resolveAll({ db: "secret://prod/db/url" }); // deep-resolve
const names = await secrets.list();                                 // NAMES only (audit)
```

## `awsSecrets(opts)`

| option            | type                | notes                                                        |
| ----------------- | ------------------- | ------------------------------------------------------------ |
| `region`          | `string`            | e.g. `"us-east-1"`.                                           |
| `accessKeyId`     | `string`            | IAM access key id.                                           |
| `secretAccessKey` | `string`            | IAM secret access key.                                       |
| `sessionToken?`   | `string`            | STS temporary-credential token (adds `x-amz-security-token`).|
| `endpoint?`       | `string`            | Override host — tests / VPC endpoints / LocalStack.          |
| `fetch?`          | `FetchLike`         | Injectable `fetch` (tests). Default: global `fetch`.         |
| `timeoutMs?`      | `number`            | Abort after N ms (default `10000`, `0` disables).            |
| `date?`           | `() => Date`        | Injectable clock — deterministic SigV4 in tests.             |

## How it maps to the API

Every call is a `POST https://secretsmanager.<region>.amazonaws.com/` with
`Content-Type: application/x-amz-json-1.1`, an `X-Amz-Target` header, and a
SigV4 `Authorization` (service `"secretsmanager"`).

- **`get(key)`** → `GetSecretValue` with body `{ "SecretId": key }`.
  - `{ SecretString }` → returned verbatim.
  - `{ SecretBinary }` → returned as the base64 string.
  - `ResourceNotFoundException` (400/404) → `undefined`.
  - any other non-2xx → throws.
- **`list()`** → `ListSecrets`, following `NextToken` pages, returning
  `SecretList[].Name` — **names only, never values** (safe for an audit view).

## SigV4

`signV4(input)` is factored out and pure (inject `now`) so it can be unit-tested
against a known date vector without the network — see `tests/aws.test.ts`. It
returns the `authorization` header plus the intermediate `canonicalRequest` /
`stringToSign` / `signature` for assertions.
