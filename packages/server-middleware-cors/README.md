# @youneed/server-middleware-cors

Set Cross-Origin Resource Sharing headers (`Access-Control-Allow-*`) on responses
and short-circuit CORS preflight (`OPTIONS`) requests before routing.

```ts
import { Application } from "@youneed/server";
import { cors } from "@youneed/server-middleware-cors";

Application()
  .use(cors({ origin: "*" }))
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `origin` | `"*"` | allowed origin(s): `"*"`, exact string, list, predicate, or `true` to reflect |
| `methods` | `GET,HEAD,PUT,PATCH,POST,DELETE,QUERY` | allowed methods (preflight) |
| `allowedHeaders` | reflect request's `ACR-Headers` | allowed request headers (preflight) |
| `exposedHeaders` | — | headers exposed to the browser |
| `credentials` | `false` | send `Access-Control-Allow-Credentials: true` |
| `maxAge` | — | seconds the preflight result is cached |
| `preflightStatus` | `204` | status returned for a preflight response |
