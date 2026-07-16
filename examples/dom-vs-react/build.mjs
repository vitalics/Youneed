import { build } from "esbuild";
await build({
  entryPoints: ["examples/dom-vs-react/app.tsx"],
  bundle: true,
  outfile: "examples/dom-vs-react/app.js",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  charset: "utf8",
  logLevel: "info",
});
console.log("built examples/dom-vs-react/app.js");
