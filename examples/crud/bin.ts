// SSR server for the CRUD demo. Run: pnpm crud  ->  http://localhost:3012/users/1
import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { app } = await import("./pages.ts");
app.listen(3012, (ctx) => {
  console.log(`CRUD pages on http://localhost:${ctx.port}`);
  console.log("  GET  /users/1          (SSR + hydration)");
  console.log("  POST /users/1          (form rename → 303)");
  console.log("  GET  /users/1/stats    (JSON sub-route)");
});
