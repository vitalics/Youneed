// Bundle the React + @youneed/dom-scheduler demo (esbuild handles TSX + JSX).
// Production React (NODE_ENV=production + minify) so the scheduling contrast,
// not dev-mode overhead, is what's measured.
import { build } from "esbuild";
await build({
  entryPoints: ["examples/scheduler-react/app.tsx"],
  bundle: true,
  outfile: "examples/scheduler-react/app.js",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  charset: "utf8",
  logLevel: "info",
});
console.log("built examples/scheduler-react/app.js");
