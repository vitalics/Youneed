import { t } from "@youneed/schema";
import { Application, Context, Controller, Response } from "@youneed/server";
import { cors } from "@youneed/server-middleware-cors";
import {
  jsonrpc,
  JsonRPC,
  JsonRPCResponse,
} from "@youneed/server-plugin-jsonrpc";
import "@youneed/server-plugin-jsonrpc/devtools"; // side effect: registers the JSON-RPC devtools renderers
import { devtools } from "@youneed/server-plugin-devtools";
import { loggerProvider } from "@youneed/server-middleware-logger";

const PORT = 3000;

class DevtoolsEndpoint extends JsonRPC({ providers: [loggerProvider()] }) {
  @JsonRPC.method("sum", { args: [t.number(), t.number()] })
  sum(a: number, b: number) {
    this.log.info("sum", { a, b });
    return JsonRPCResponse.success({ result: a + b });
  }
}

const app = Application()
  .use(
    cors({ origin: "*", allowedHeaders: ["Content-Type"], methods: ["POST"] }),
  )
  .plugin(
    jsonrpc((r) => ({
      endpoints: [DevtoolsEndpoint],
      exposeDevtools: true,
      path: "",
      connection: (c) => c.ws("/devtools", r.ws),
    })),
    devtools({
      middleware: ["cors"],
      name: "",
    }),
  );

app.listen(PORT, () => {
  console.log(`listening on port: http://localhost:${PORT}`);
  console.log(
    `devtools listening on port: http://localhost:${PORT}/__devtools`,
  );
});
