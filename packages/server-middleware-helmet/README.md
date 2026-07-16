# @youneed/server-middleware-helmet

Stamp a bundle of hardening response headers (helmet-style defaults: CSP, HSTS,
X-Frame-Options, and friends) so responses ship with sane security headers.

```ts
import { Application } from "@youneed/server";
import { helmet } from "@youneed/server-middleware-helmet";

Application()
  .use(helmet())                                     // strict defaults, global
  .use(helmet({ contentSecurityPolicy: false }))     // opt out of CSP
  .listen(3000, () => {});
```

| option | default | meaning |
| --- | --- | --- |
| `contentSecurityPolicy` | strict self-only | CSP string, or `false` to omit |
| `hsts` | `180d + includeSubDomains` | HSTS config, or `false` to omit |
| `frameguard` | `"SAMEORIGIN"` | X-Frame-Options, or `false` |
| `referrerPolicy` | `"no-referrer"` | Referrer-Policy, or `false` |
| `noSniff` | on | X-Content-Type-Options: nosniff |
| `xssFilter` | on | X-XSS-Protection: 0 |
| `crossOriginOpenerPolicy` | `"same-origin"` | Cross-Origin-Opener-Policy, or `false` |
| `crossOriginResourcePolicy` | `"same-origin"` | Cross-Origin-Resource-Policy, or `false` |
| `originAgentCluster` | on | Origin-Agent-Cluster: ?1 |
| `dnsPrefetchControl` | on | X-DNS-Prefetch-Control: off |
| `permittedCrossDomainPolicies` | `"none"` | X-Permitted-Cross-Domain-Policies, or `false` |
