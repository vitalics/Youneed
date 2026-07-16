// A @youneed/server app served through @youneed/server-adapter — the SAME code
// runs on Node, Bun and Deno (and `toFetchHandler(app)` runs on edge / Workers).
//
// Run:  pnpm examples:serve:server          (Node, via tsx)
//       bun examples/server/server.ts        (Bun  — auto-detected)
//       deno run -A examples/server/server.ts (Deno — auto-detected)
// Open: http://localhost:3000/hello
import { Application, Controller, t, type Context } from "@youneed/server";
import { serve, toFetchHandler } from "@youneed/server-adapter";

// A tiny in-memory resource so there's something to GET/POST.
const todos: Array<{ id: number; title: string; done: boolean }> = [
  { id: 1, title: "Try @youneed/server-adapter", done: false },
];

class TodosController extends Controller("/todos") {
  @Controller.get()
  list() {
    return todos;
  }

  @Controller.post({ body: t.object({ title: t.string() }) })
  create(ctx: Context) {
    const todo = { id: todos.length + 1, title: (ctx.body as { title: string }).title, done: false };
    todos.push(todo);
    return this.Response.json(todo, { status: 201 });
  }
}

export const app = Application(TodosController)
  .get("/hello", () => ({ hello: "world" }))
  .get("/health", () => ({ ok: true }));

// `toFetchHandler(app)` is the portable export for edge / serverless / Workers.
export const fetchHandler = toFetchHandler(app);
export default { fetch: fetchHandler }; // Cloudflare Worker / Bun default-export style

// When run directly, serve on whatever runtime we're in (Node / Bun / Deno).
const server = await serve(app, { port: 3000 });
console.log(`server-adapter demo → ${server.url}/hello  (runtime: ${server.runtime})`);
console.log(`  list todos          → ${server.url}/todos`);
