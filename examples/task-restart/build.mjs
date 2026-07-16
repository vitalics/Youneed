// Bundle the auto-restarting-task demo client into a single IIFE (works over file://).
import { build } from "esbuild";

await build({
  entryPoints: ["examples/task-restart/client.ts"],
  bundle: true,
  outfile: "examples/task-restart/app.js",
  format: "iife",
  target: "es2022",
  charset: "utf8",
  logLevel: "info",
});

console.log("built examples/task-restart/app.js");
