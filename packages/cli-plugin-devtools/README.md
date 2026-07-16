# @youneed/cli-plugin-devtools

Devtools server for [`@youneed/cli`](../cli). Registers a `devtools` command that
serves a localhost single-page UI: it lists every command and option, lets you
fill in a builder form, shows the assembled command line (Copy), and — on a POST
to `/run` — spawns the CLI with those arguments and streams the output back (Run).
Built on `node:http` and `node:child_process`; nothing leaves localhost.

```ts
import { Application } from "@youneed/cli";
import { devtools } from "@youneed/cli-plugin-devtools";

Application({
  name: "ops",
  commands: [/* … */],
  plugins: [devtools()],
}).run();

// ops devtools   →   http://127.0.0.1:7331
```

The server stays up until graceful shutdown (SIGINT/SIGTERM) aborts the run. The
request handler serves the page (`GET /`), the catalogue JSON (`GET /catalog`),
and runs commands (`POST /run`, unless `run` is disabled).

## Exports

Main entry (`@youneed/cli-plugin-devtools`):

- **`devtools(options?)`** — the plugin. Registers the `devtools` command.
- **`requestHandler(catalog, options?)`** — the `(req, res)` handler, exported for
  testing.
- **`createCatalog(host, opts?)`** / **`assembleCommand`** / **`toArgv`** /
  **`quoteArg`** — catalogue + command-line assembly helpers.
- **`renderPage(catalog, allowRun)`** — render the UI HTML.
- Types: **`Catalog`**, **`CatalogCommand`**, **`CatalogOption`**, **`CatalogArg`**,
  **`CommandValues`**, **`DevtoolsOptions`**, **`DevtoolsRequest`**,
  **`DevtoolsResponse`**.

Subpath `@youneed/cli-plugin-devtools/protocol` exports the
[`@youneed/devtools-protocol`](../devtools-protocol) domain definitions for this
plugin.

## Options

- **`port`** — port to listen on. Default `7331`.
- **`host`** — hostname to bind. Default `127.0.0.1` (localhost only).
- **`command`** — name of the registered command. Default `"devtools"`.
- **`run`** — allow the Run button (spawns the CLI). Default `true`.
- **`launcher`** — argv prefix used to launch the CLI for Run. Default
  `process.argv.slice(0, 2)`.
- **`runTimeoutMs`** — kill a Run that exceeds this many ms. Default `8000`.
